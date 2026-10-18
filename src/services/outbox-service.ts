import type { AppConfig } from "../config.js";
import type { OutboxMessage } from "../domain/types.js";
import { HttpError } from "../lib/http-error.js";
import { createId } from "../lib/ids.js";
import type { Repository } from "../repositories/repository.js";

export class OutboxService {
  constructor(private readonly config: AppConfig, private readonly repository: Repository) {}

  async enqueueLine(recipient: string, body: string, relatedEntityId?: string) {
    const now = new Date().toISOString();
    const message: OutboxMessage = {
      messageId:createId("MSG"), channel:"LINE", recipient, body:body.slice(0,5000),
      ...(relatedEntityId ? { relatedEntityId } : {}), status:"PENDING", attempts:0, maxAttempts:5,
      nextAttemptAt:now, createdAt:now, updatedAt:now
    };
    await this.repository.saveOutboxMessage(message);
    return this.deliver(message);
  }

  async retry(messageId: string) {
    const message = await this.repository.getOutboxMessage(messageId);
    if (!message) throw new HttpError(404, "OUTBOX_NOT_FOUND", "ไม่พบข้อความในคิว");
    if (message.status === "DELIVERED") throw new HttpError(409, "OUTBOX_ALREADY_DELIVERED", "ข้อความนี้ส่งสำเร็จแล้ว");
    const reset = message.status === "DEAD_LETTER" ? { ...message, status:"PENDING" as const, attempts:0, nextAttemptAt:new Date().toISOString(), updatedAt:new Date().toISOString() } : message;
    if (reset !== message) await this.repository.saveOutboxMessage(reset);
    return this.deliver(reset);
  }

  async processDue(limit=20) {
    const now = new Date().toISOString();
    const due = (await this.repository.listOutbox()).filter((item) => item.status === "PENDING" && item.nextAttemptAt <= now).slice(0,limit);
    const results = [];
    for (const item of due) results.push(await this.deliver(item));
    return results;
  }

  private async deliver(before: OutboxMessage) {
    const attempts = before.attempts + 1;
    try {
      await sendLineText(this.config, before.recipient, before.body);
      const delivered = { ...before, status:"DELIVERED" as const, attempts, updatedAt:new Date().toISOString() };
      await this.repository.saveOutboxMessage(delivered);
      return delivered;
    } catch (error) {
      const final = attempts >= before.maxAttempts;
      const updatedAt = new Date().toISOString();
      const failed = {
        ...before, status:(final ? "DEAD_LETTER" : "PENDING") as "DEAD_LETTER" | "PENDING", attempts,
        nextAttemptAt:new Date(Date.now() + Math.min(30*60_000, 30_000 * 2 ** Math.max(0, attempts-1))).toISOString(),
        lastError:error instanceof Error ? error.message.slice(0,300) : String(error).slice(0,300), updatedAt
      };
      await this.repository.saveOutboxMessage(failed);
      return failed;
    }
  }
}

async function sendLineText(config: AppConfig, lineUserId: string, text: string) {
  if (!config.LINE_CHANNEL_ACCESS_TOKEN) throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not configured");
  const response = await fetch("https://api.line.me/v2/bot/message/push", { method:"POST", headers:{ Authorization:`Bearer ${config.LINE_CHANNEL_ACCESS_TOKEN}`, "Content-Type":"application/json" }, body:JSON.stringify({ to:lineUserId, messages:[{ type:"text", text:text.slice(0,5000) }] }), signal:AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`LINE push API returned ${response.status}: ${(await response.text()).slice(0,200)}`);
}
