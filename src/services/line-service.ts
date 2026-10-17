import { createHmac, timingSafeEqual } from "node:crypto";
import type { Repository } from "../repositories/repository.js";
import type { AppConfig } from "../config.js";
import { HttpError } from "../lib/http-error.js";
import { evaluateIcsRisk } from "../domain/ics-rules.js";
import type { VoiceAnalyzer } from "./gemini-service.js";
import { createId } from "../lib/ids.js";

interface LineEvent { type: string; webhookEventId?: string; replyToken?: string; timestamp: number; source: { type: string; userId?: string }; message?: { type: string; id: string; text?: string; duration?: number; contentProvider?: { type: string } }; }
interface LineWebhookBody { events?: unknown[]; }

export function verifyLineSignature(rawBody: Buffer, signature: string | undefined, secret: string | undefined) {
  if (!secret) throw new HttpError(503, "LINE_NOT_CONFIGURED", "ยังไม่ได้ตั้งค่า LINE_CHANNEL_SECRET");
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("base64");
  const actualBuffer = Buffer.from(signature); const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function isMessageEvent(value: unknown): value is LineEvent { const x = value as LineEvent; return !!x && typeof x === "object" && x.type === "message" && !!x.message; }

export class LineService {
  constructor(private readonly config: AppConfig, private readonly repository: Repository, private readonly analyzer?: VoiceAnalyzer) {}

  async acceptWebhook(rawBody: Buffer, signature?: string) {
    if (!verifyLineSignature(rawBody, signature, this.config.LINE_CHANNEL_SECRET)) throw new HttpError(401, "INVALID_LINE_SIGNATURE", "LINE webhook signature ไม่ถูกต้อง");
    let body: LineWebhookBody;
    try { body = JSON.parse(rawBody.toString("utf8")) as LineWebhookBody; } catch { throw new HttpError(400, "INVALID_JSON", "Webhook body ไม่ใช่ JSON ที่ถูกต้อง"); }
    let accepted = 0, duplicates = 0, ignored = 0, failed = 0;
    for (const unknownEvent of body.events ?? []) {
      if (!isMessageEvent(unknownEvent)) { ignored++; continue; }
      const event = unknownEvent;
      if (event.message?.type === "text") { if (await this.handleTextCommand(event)) accepted++; else ignored++; continue; }
      if (event.message?.type !== "audio") { ignored++; continue; }
      const sourceEventId = event.webhookEventId ?? `line-${event.message.id}-${event.timestamp}`;
      if (await this.repository.findActivityBySourceEvent(sourceEventId)) { duplicates++; continue; }
      const farmer = event.source.userId ? await this.repository.getFarmerByLineUserId(event.source.userId) : undefined;
      if (!farmer) { await this.reply(event.replyToken, "ยังไม่พบการเชื่อมบัญชี กรุณาส่งข้อความ: ลงทะเบียน รหัสสมาชิก\nตัวอย่าง: ลงทะเบียน M001"); ignored++; continue; }
      if (!this.analyzer) { await this.reply(event.replyToken, "ระบบถอดเสียงยังไม่พร้อม กรุณาตรวจ GEMINI_API_KEY และ AI_PROVIDER"); failed++; continue; }
      await this.reply(event.replyToken, "รับไฟล์เสียงแล้ว กำลังถอดเสียงและตรวจข้อมูล ระบบจะแจ้งผลกลับมาอีกครั้ง");
      const now = new Date().toISOString();
      const activity = { activityId: `ACT-${event.timestamp}-${event.message.id.slice(-6)}`, sourceEventId, farmerId: farmer.farmerId, farmerName: farmer.displayName, occurredAt: new Date(event.timestamp).toISOString(), receivedAt: now, audioContentId: event.message.id, processingStatus: "PROCESSING" as const, riskStatus: "NEEDS_REVIEW" as const, confidence: 0, flagReasons: [] as string[], matchedTerms: [] as string[], updatedAt: now };
      await this.repository.saveActivity(activity);
      await this.snapshot("ACTIVITY", activity.activityId, farmer.farmerId, "VOICE_RECEIVED", undefined, activity);
      try {
        const { audio, mimeType } = await this.downloadAudio(event.message.id);
        const analysis = await this.analyzer.analyze(audio, mimeType);
        const rule = evaluateIcsRisk(analysis.extracted, analysis.transcript);
        const registeredPlot = analysis.extracted.plotId ? await this.repository.getPlot(analysis.extracted.plotId) : undefined;
        if (analysis.extracted.plotId && !registeredPlot) {
          rule.riskStatus = "NEEDS_REVIEW";
          rule.reasons.push(`ไม่พบแปลง ${analysis.extracted.plotId} ในทะเบียน`);
        } else if (registeredPlot) {
          if (registeredPlot.farmerId !== farmer.farmerId || registeredPlot.status !== "ACTIVE") {
            rule.riskStatus = "NEEDS_REVIEW";
            rule.reasons.push("แปลงที่ระบุไม่ได้อยู่ในบัญชีเกษตรกรหรือไม่ได้เปิดใช้งาน");
          }
          if (analysis.extracted.crop && normalizeThai(analysis.extracted.crop) !== normalizeThai(registeredPlot.crop)) {
            rule.riskStatus = "NEEDS_REVIEW";
            rule.reasons.push(`พืชจากเสียง “${analysis.extracted.crop}” ไม่ตรงกับทะเบียนแปลง “${registeredPlot.crop}”`);
          }
        }
        const confidenceValues = Object.values(analysis.extracted.fieldConfidence);
        const confidence = confidenceValues.length ? confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length : 0;
        const completed = { ...activity, transcript: analysis.transcript, ...analysis.extracted, ...(registeredPlot ? { plotName:registeredPlot.name } : analysis.plotName ? { plotName: analysis.plotName } : {}), processingStatus: (rule.riskStatus === "PROVISIONALLY_CLEAR" ? "NEEDS_CONFIRMATION" : "NEEDS_REVIEW") as "NEEDS_CONFIRMATION" | "NEEDS_REVIEW", riskStatus: rule.riskStatus, confidence, flagReasons: rule.reasons, matchedTerms: rule.matchedTerms, updatedAt: new Date().toISOString() };
        await this.repository.saveActivity(completed);
        await this.snapshot("ACTIVITY", activity.activityId, "system:voice-pipeline", "VOICE_PROCESSED", activity, completed);
        await pushLineText(this.config, event.source.userId!, this.summary(completed.activityId, analysis.transcript, rule.riskStatus));
        accepted++;
      } catch (error) {
        const failedActivity = { ...activity, processingStatus: "FAILED_RETRYABLE" as const, flagReasons: [error instanceof Error ? error.message.slice(0, 300) : "Unknown processing error"], updatedAt: new Date().toISOString() };
        await this.repository.saveActivity(failedActivity);
        await this.snapshot("ACTIVITY", activity.activityId, "system:voice-pipeline", "VOICE_PROCESSING_FAILED", activity, failedActivity, failedActivity.flagReasons[0]);
        await pushLineText(this.config, event.source.userId!, "รับไฟล์เสียงแล้ว แต่ประมวลผลไม่สำเร็จ เจ้าหน้าที่สามารถตรวจและลองใหม่ได้").catch(() => undefined);
        console.error(JSON.stringify({ level: "error", code: "VOICE_PROCESSING_FAILED", activityId: activity.activityId, message: error instanceof Error ? error.message : String(error) })); failed++;
      }
    }
    return { accepted, duplicates, ignored, failed };
  }

  private async handleTextCommand(event: LineEvent) {
    const text = event.message?.text?.trim() ?? "";
    const confirmation = text.match(/^ยืนยัน\s+(ACT-[A-Za-z0-9-]+)$/i);
    if (confirmation && event.source.userId) {
      const farmer = await this.repository.getFarmerByLineUserId(event.source.userId);
      const activity = await this.repository.getActivity(confirmation[1]!);
      if (!farmer || !activity || activity.farmerId !== farmer.farmerId) { await this.reply(event.replyToken, "ไม่พบรายการนี้ในบัญชีของคุณ กรุณาตรวจเลขที่รายการอีกครั้ง"); return true; }
      if (activity.processingStatus !== "NEEDS_CONFIRMATION") { await this.reply(event.replyToken, "รายการนี้ไม่อยู่ในสถานะรอยืนยัน เจ้าหน้าที่จะเป็นผู้ตรวจสอบต่อ"); return true; }
      const now = new Date().toISOString();
      const confirmed = { ...activity, processingStatus:"COMPLETED" as const, updatedAt:now };
      await this.repository.saveActivity(confirmed);
      await this.snapshot("ACTIVITY", activity.activityId, farmer.farmerId, "FARMER_CONFIRM", activity, confirmed);
      await this.reply(event.replyToken, `ยืนยันบันทึก ${activity.activityId} เรียบร้อยแล้ว ✅`);
      return true;
    }
    const match = event.message?.text?.trim().match(/^ลงทะเบียน\s+([A-Za-z0-9_-]+)$/i);
    if (!match || !event.source.userId) return false;
    const farmer = await this.repository.getFarmerByMemberCode(match[1]!);
    if (!farmer) { await this.reply(event.replyToken, "ไม่พบรหัสสมาชิกนี้ กรุณาติดต่อเจ้าหน้าที่ให้เพิ่มสมาชิกในหน้าเว็บทะเบียน ICS"); return true; }
    const linked = { ...farmer, lineUserId:event.source.userId };
    await this.repository.saveFarmer(linked);
    await this.snapshot("FARMER", farmer.farmerId, farmer.farmerId, "LINE_ACCOUNT_LINKED", farmer, linked);
    await this.reply(event.replyToken, `เชื่อมบัญชีสำเร็จ: ${farmer.displayName}\nส่งข้อความเสียงกิจกรรมการเกษตรได้เลย`);
    return true;
  }

  private async downloadAudio(messageId: string) {
    if (!this.config.LINE_CHANNEL_ACCESS_TOKEN) throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not configured");
    const response = await fetch(`https://api-data.line.me/v2/bot/message/${encodeURIComponent(messageId)}/content`, { headers: { Authorization: `Bearer ${this.config.LINE_CHANNEL_ACCESS_TOKEN}` }, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`LINE content API returned ${response.status}`);
    const audio = Buffer.from(await response.arrayBuffer());
    if (!audio.length) throw new Error("LINE returned empty audio");
    return { audio, mimeType: response.headers.get("content-type")?.split(";")[0] ?? "audio/mp4" };
  }

  private async reply(replyToken: string | undefined, text: string) {
    if (!replyToken || !this.config.LINE_CHANNEL_ACCESS_TOKEN) return;
    const response = await fetch("https://api.line.me/v2/bot/message/reply", { method: "POST", headers: { Authorization: `Bearer ${this.config.LINE_CHANNEL_ACCESS_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ replyToken, messages: [{ type: "text", text: text.slice(0, 5000) }] }), signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`LINE reply API returned ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }

  private async snapshot(entityType: "ACTIVITY" | "FARMER", entityId: string, actorId: string, action: string, before: unknown, after: unknown, reason?: string) {
    await this.repository.saveAuditEvent({ auditId:createId("AUD"), entityType, entityId, actorId, action, ...(reason ? { reason } : {}), ...(before !== undefined ? { before:structuredClone(before) } : {}), ...(after !== undefined ? { after:structuredClone(after) } : {}), occurredAt:new Date().toISOString() });
  }

  private summary(id: string, transcript: string, risk: string) { const status = risk === "FLAGGED_HIGH" ? "พบประเด็นเสี่ยง รอเจ้าหน้าที่ตรวจ" : risk === "NEEDS_REVIEW" ? "ข้อมูลยังไม่ครบ รอเจ้าหน้าที่ตรวจ" : `บันทึกแล้ว รอยืนยัน\nหากข้อมูลถูกต้อง ส่ง: ยืนยัน ${id}`; return `รับและถอดเสียงสำเร็จ ✅\nเลขที่: ${id}\nข้อความ: ${transcript.slice(0, 700)}\nสถานะ: ${status}`; }
}

function normalizeThai(value: string) { return value.trim().toLocaleLowerCase("th-TH").replace(/\s+/g, ""); }

export async function pushLineText(config: AppConfig, lineUserId: string, text: string) {
  if (!config.LINE_CHANNEL_ACCESS_TOKEN) throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not configured");
  const response = await fetch("https://api.line.me/v2/bot/message/push", { method:"POST", headers:{ Authorization:`Bearer ${config.LINE_CHANNEL_ACCESS_TOKEN}`, "Content-Type":"application/json" }, body:JSON.stringify({ to:lineUserId, messages:[{ type:"text", text:text.slice(0,5000) }] }), signal:AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`LINE push API returned ${response.status}: ${(await response.text()).slice(0,200)}`);
}
