import { createHmac, timingSafeEqual } from "node:crypto";
import type { Repository } from "../repositories/repository.js";
import type { AppConfig } from "../config.js";
import { HttpError } from "../lib/http-error.js";

interface LineAudioEvent {
  type: "message";
  webhookEventId?: string;
  timestamp: number;
  source: { type: string; userId?: string };
  message: { type: "audio"; id: string; duration?: number };
}

interface LineWebhookBody {
  events?: unknown[];
}

export function verifyLineSignature(rawBody: Buffer, signature: string | undefined, secret: string | undefined) {
  if (!secret) throw new HttpError(503, "LINE_NOT_CONFIGURED", "ยังไม่ได้ตั้งค่า LINE_CHANNEL_SECRET");
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("base64");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function isAudioEvent(event: unknown): event is LineAudioEvent {
  if (!event || typeof event !== "object") return false;
  const candidate = event as Partial<LineAudioEvent>;
  return candidate.type === "message" && candidate.message?.type === "audio";
}

export class LineService {
  constructor(
    private readonly config: AppConfig,
    private readonly repository: Repository
  ) {}

  async acceptWebhook(rawBody: Buffer, signature?: string) {
    if (!verifyLineSignature(rawBody, signature, this.config.LINE_CHANNEL_SECRET)) {
      throw new HttpError(401, "INVALID_LINE_SIGNATURE", "LINE webhook signature ไม่ถูกต้อง");
    }

    let body: LineWebhookBody;
    try {
      body = JSON.parse(rawBody.toString("utf8")) as LineWebhookBody;
    } catch {
      throw new HttpError(400, "INVALID_JSON", "Webhook body ไม่ใช่ JSON ที่ถูกต้อง");
    }

    let accepted = 0;
    let duplicates = 0;
    let ignored = 0;

    for (const event of body.events ?? []) {
      if (!isAudioEvent(event)) {
        ignored += 1;
        continue;
      }
      const sourceEventId = event.webhookEventId ?? `line-${event.message.id}-${event.timestamp}`;
      if (await this.repository.findActivityBySourceEvent(sourceEventId)) {
        duplicates += 1;
        continue;
      }
      const lineUserId = event.source.userId;
      if (!lineUserId) {
        ignored += 1;
        continue;
      }
      const farmer = await this.repository.getFarmerByLineUserId(lineUserId);
      if (!farmer) {
        // Unlinked identities must enter a separate onboarding flow; never infer identity from display name.
        ignored += 1;
        continue;
      }
      const now = new Date().toISOString();
      await this.repository.saveActivity({
        activityId: `ACT-${event.timestamp}-${event.message.id.slice(-6)}`,
        sourceEventId,
        farmerId: farmer.farmerId,
        farmerName: farmer.displayName,
        occurredAt: new Date(event.timestamp).toISOString(),
        receivedAt: now,
        audioContentId: event.message.id,
        processingStatus: "RECEIVED",
        riskStatus: "NEEDS_REVIEW",
        confidence: 0,
        flagReasons: [],
        matchedTerms: [],
        updatedAt: now
      });
      accepted += 1;
    }

    return { accepted, duplicates, ignored };
  }
}
