import { createHmac, timingSafeEqual } from "node:crypto";
import type { Repository } from "../repositories/repository.js";
import type { AppConfig } from "../config.js";
import { HttpError } from "../lib/http-error.js";
import { evaluateIcsRisk } from "../domain/ics-rules.js";
import type { VoiceAnalyzer } from "./gemini-service.js";
import { createId } from "../lib/ids.js";
import type { Activity } from "../domain/types.js";
import { OutboxService } from "./outbox-service.js";

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
  private readonly outbox: OutboxService;
  constructor(private readonly config: AppConfig, private readonly repository: Repository, private readonly analyzer?: VoiceAnalyzer) { this.outbox = new OutboxService(config, repository); }

  async acceptWebhook(rawBody: Buffer, signature?: string) {
    if (!verifyLineSignature(rawBody, signature, this.config.LINE_CHANNEL_SECRET)) throw new HttpError(401, "INVALID_LINE_SIGNATURE", "LINE webhook signature ไม่ถูกต้อง");
    await this.outbox.processDue(10).catch(() => undefined);
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
      const awaiting = (await this.repository.listActivities())
        .filter((item) => item.processingStatus === "AWAITING_FARMER" || item.processingStatus === "CORRECTION_PENDING")
        .filter((item) => item.farmerId === farmer.farmerId)
        .filter((item) => !item.correctionRequestedAt || Date.now() - new Date(item.correctionRequestedAt).getTime() <= 30 * 60_000)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
      const isCorrection = awaiting?.processingStatus === "CORRECTION_PENDING";
      const activity = awaiting
        ? { ...awaiting, sourceEventIds:[...new Set([awaiting.sourceEventId, ...(awaiting.sourceEventIds ?? []), sourceEventId])], audioContentId:event.message.id, processingStatus:"PROCESSING" as const, updatedAt:now }
        : { activityId: `ACT-${event.timestamp}-${event.message.id.slice(-6)}`, sourceEventId, sourceEventIds:[sourceEventId], farmerId: farmer.farmerId, farmerName: farmer.displayName, occurredAt: new Date(event.timestamp).toISOString(), receivedAt: now, audioContentId: event.message.id, processingStatus: "PROCESSING" as const, riskStatus: "NEEDS_REVIEW" as const, confidence: 0, flagReasons: [] as string[], matchedTerms: [] as string[], revision:1, updatedAt: now };
      await this.repository.saveActivity(activity);
      await this.snapshot("ACTIVITY", activity.activityId, farmer.farmerId, isCorrection ? "CORRECTION_VOICE_RECEIVED" : awaiting ? "FOLLOWUP_VOICE_RECEIVED" : "VOICE_RECEIVED", awaiting, activity);
      try {
        const completed = await this.analyzeActivity(activity, farmer.farmerId, isCorrection);
        await this.repository.saveActivity(completed);
        await this.snapshot("ACTIVITY", activity.activityId, "system:voice-pipeline", isCorrection ? "CORRECTION_PROPOSED" : awaiting ? "FOLLOWUP_MERGED" : "VOICE_PROCESSED", activity, completed);
        await this.notifyResult(event.source.userId!, completed, isCorrection ? awaiting : undefined);
        accepted++;
      } catch (error) {
        const failedActivity = { ...activity, processingStatus: "FAILED_RETRYABLE" as const, flagReasons: [error instanceof Error ? error.message.slice(0, 300) : "Unknown processing error"], updatedAt: new Date().toISOString() };
        await this.repository.saveActivity(failedActivity);
        await this.snapshot("ACTIVITY", activity.activityId, "system:voice-pipeline", "VOICE_PROCESSING_FAILED", activity, failedActivity, failedActivity.flagReasons[0]);
        await this.outbox.enqueueLine(event.source.userId!, "รับไฟล์เสียงแล้ว แต่ประมวลผลไม่สำเร็จ เจ้าหน้าที่สามารถตรวจและลองใหม่ได้", activity.activityId).catch(() => undefined);
        console.error(JSON.stringify({ level: "error", code: "VOICE_PROCESSING_FAILED", activityId: activity.activityId, message: error instanceof Error ? error.message : String(error) })); failed++;
      }
    }
    return { accepted, duplicates, ignored, failed };
  }

  async retryActivity(activityId: string, actorId: string) {
    const before = await this.repository.getActivity(activityId);
    if (!before) throw new HttpError(404, "ACTIVITY_NOT_FOUND", "ไม่พบกิจกรรมที่ต้องการประมวลผลใหม่");
    if (before.processingStatus !== "FAILED_RETRYABLE" || !before.audioContentId) throw new HttpError(409, "ACTIVITY_NOT_RETRYABLE", "รายการนี้ไม่มีไฟล์เสียงหรือไม่อยู่ในสถานะที่ลองใหม่ได้");
    if (!this.analyzer) throw new HttpError(503, "AI_NOT_CONFIGURED", "ระบบ AI ยังไม่พร้อมใช้งาน");
    const farmer = await this.repository.getFarmer(before.farmerId);
    const processing = { ...before, processingStatus:"PROCESSING" as const, updatedAt:new Date().toISOString() };
    await this.repository.saveActivity(processing);
    await this.snapshot("ACTIVITY", activityId, actorId, "RETRY_STARTED", before, processing);
    try {
      const completed = await this.analyzeActivity(processing, before.farmerId, Boolean(before.correctionRequestedAt));
      await this.repository.saveActivity(completed);
      await this.snapshot("ACTIVITY", activityId, actorId, "RETRY_SUCCEEDED", processing, completed);
      if (farmer?.lineUserId) await this.notifyResult(farmer.lineUserId, completed).catch(() => undefined);
      return completed;
    } catch (error) {
      const failed = { ...processing, processingStatus:"FAILED_RETRYABLE" as const, flagReasons:[error instanceof Error ? error.message.slice(0,300) : "Unknown processing error"], updatedAt:new Date().toISOString() };
      await this.repository.saveActivity(failed);
      await this.snapshot("ACTIVITY", activityId, actorId, "RETRY_FAILED", processing, failed, failed.flagReasons[0]);
      throw new HttpError(502, "VOICE_RETRY_FAILED", "ประมวลผลเสียงซ้ำไม่สำเร็จ กรุณาตรวจสถานะ AI แล้วลองอีกครั้ง");
    }
  }

  private async analyzeActivity(activity: Activity, farmerId: string, isCorrection=false) {
    if (!this.analyzer || !activity.audioContentId) throw new Error("Voice analyzer or audio content is unavailable");
    const { audio, mimeType } = await this.downloadAudio(activity.audioContentId);
    const analysis = await this.analyzer.analyze(audio, mimeType);
    const extracted = mergeExtracted(activity, analysis.extracted);
    const transcript = activity.transcript ? `${activity.transcript}\nข้อมูลเพิ่มเติม: ${analysis.transcript}` : analysis.transcript;
    const registeredPlot = await this.matchRegisteredPlot(farmerId, extracted.plotId, analysis.plotName, analysis.transcript);
    const resolved = registeredPlot ? { ...extracted, plotId:registeredPlot.plotId, crop:(isCorrection ? analysis.extracted.crop : extracted.crop) ?? registeredPlot.crop } : extracted;
    const rule = evaluateIcsRisk(resolved, transcript);
    if ((extracted.plotId || analysis.plotName) && !registeredPlot) { rule.riskStatus = "NEEDS_REVIEW"; rule.reasons.push(`ไม่พบแปลง “${analysis.plotName ?? extracted.plotId}” ในทะเบียนของเกษตรกร`); }
    else if (registeredPlot) {
      if (registeredPlot.farmerId !== farmerId || registeredPlot.status !== "ACTIVE") { rule.riskStatus = "NEEDS_REVIEW"; rule.reasons.push("แปลงที่ระบุไม่ได้อยู่ในบัญชีเกษตรกรหรือไม่ได้เปิดใช้งาน"); }
      if (resolved.crop && normalizeThai(resolved.crop) !== normalizeThai(registeredPlot.crop)) { rule.riskStatus = "NEEDS_REVIEW"; rule.reasons.push(`พืชจากเสียง “${resolved.crop}” ไม่ตรงกับทะเบียนแปลง “${registeredPlot.crop}”`); }
    }
    const confidenceValues = Object.values(resolved.fieldConfidence);
    const confidence = confidenceValues.length ? confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length : 0;
    return { ...activity, ...(analysis.occurredAt && !activity.transcript ? { occurredAt:analysis.occurredAt } : {}), transcript, ...resolved, ...(registeredPlot ? { plotName:registeredPlot.name } : analysis.plotName ? { plotName:analysis.plotName } : {}), processingStatus:(rule.riskStatus === "PROVISIONALLY_CLEAR" ? (isCorrection ? "CORRECTION_CONFIRMATION" : "NEEDS_CONFIRMATION") : "NEEDS_REVIEW") as "CORRECTION_CONFIRMATION" | "NEEDS_CONFIRMATION" | "NEEDS_REVIEW", riskStatus:rule.riskStatus, confidence, flagReasons:rule.reasons, matchedTerms:rule.matchedTerms, revision:(activity.revision ?? 1) + (isCorrection ? 1 : 0), updatedAt:new Date().toISOString() };
  }

  private async matchRegisteredPlot(farmerId: string, plotId?: string, plotName?: string, transcript?: string) {
    const plots = (await this.repository.listPlots(farmerId)).filter((plot) => plot.status === "ACTIVE");
    if (!plots.length) return undefined;
    const direct = plotId ? plots.find((plot) => normalizeThai(plot.plotId) === normalizeThai(plotId)) : undefined;
    if (direct) return direct;
    const candidates = [plotId, plotName].filter((value): value is string => Boolean(value));
    const byName = plots.find((plot) => candidates.some((value) => equivalentPlotName(plot.name, value)));
    if (byName) return byName;
    const mentioned = plots.filter((plot) => normalizePlotName(transcript ?? "").includes(normalizePlotName(plot.name)));
    if (mentioned.length === 1) return mentioned[0];
    return plots.length === 1 ? plots[0] : undefined;
  }

  private async handleTextCommand(event: LineEvent) {
    const text = event.message?.text?.trim() ?? "";
    const correction = text.match(/^(?:ขอ)?แก้ไข\s+(ACT-[A-Za-z0-9-]+)$/i);
    const latestCorrection = /^(?:ขอ)?แก้ไขล่าสุด$/i.test(text);
    if ((correction || latestCorrection) && event.source.userId) {
      const farmer = await this.repository.getFarmerByLineUserId(event.source.userId);
      const activeCorrection = farmer ? (await this.repository.listActivities()).find((item) => item.farmerId === farmer.farmerId && item.processingStatus === "CORRECTION_PENDING" && item.correctionRequestedAt && Date.now() - new Date(item.correctionRequestedAt).getTime() <= 30 * 60_000) : undefined;
      if (activeCorrection) { await this.reply(event.replyToken, `กำลังรอเสียงแก้ไขรายการ ${activeCorrection.activityId} อยู่แล้ว กรุณาส่งเสียงได้เลย หรือรอให้ครบ 30 นาทีเพื่อเลือกรายการใหม่`); return true; }
      const activity = correction
        ? await this.repository.getActivity(correction[1]!)
        : (await this.repository.listActivities()).filter((item) => item.farmerId === farmer?.farmerId && ["NEEDS_CONFIRMATION","COMPLETED"].includes(item.processingStatus) && !item.createdLotId).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      if (!farmer || !activity || activity.farmerId !== farmer.farmerId) { await this.reply(event.replyToken, "ไม่พบรายการนี้ในบัญชีของคุณ กรุณาตรวจเลขที่รายการอีกครั้ง"); return true; }
      if (activity.createdLotId) { await this.reply(event.replyToken, "รายการนี้ถูกสร้างเป็นล็อตแล้ว กรุณาให้เจ้าหน้าที่ตรวจผลกระทบก่อนแก้ไข"); return true; }
      if (!["NEEDS_CONFIRMATION","COMPLETED"].includes(activity.processingStatus)) { await this.reply(event.replyToken, "รายการนี้ไม่อยู่ในสถานะที่แก้ไขด้วยเสียงได้ เจ้าหน้าที่จะเป็นผู้ตรวจสอบต่อ"); return true; }
      const now = new Date().toISOString();
      const awaiting = { ...activity, processingStatus:"CORRECTION_PENDING" as const, correctionRequestedAt:now, revision:activity.revision ?? 1, updatedAt:now };
      await this.repository.saveActivity(awaiting);
      await this.snapshot("ACTIVITY", activity.activityId, farmer.farmerId, "CORRECTION_REQUESTED", activity, awaiting);
      await this.reply(event.replyToken, `กำลังแก้รายการ ${activity.activityId}\nกรุณาส่งเสียงภายใน 30 นาที โดยพูดเฉพาะข้อมูลที่ต้องแก้ เช่น “แก้เป็นแปลงสอง กิจกรรมถอนหญ้า”\nระบบจะปรับรายการเดิมและให้ตรวจอีกครั้ง`);
      return true;
    }
    const confirmation = text.match(/^ยืนยัน\s+(ACT-[A-Za-z0-9-]+)$/i);
    if (confirmation && event.source.userId) {
      const farmer = await this.repository.getFarmerByLineUserId(event.source.userId);
      const activity = await this.repository.getActivity(confirmation[1]!);
      if (!farmer || !activity || activity.farmerId !== farmer.farmerId) { await this.reply(event.replyToken, "ไม่พบรายการนี้ในบัญชีของคุณ กรุณาตรวจเลขที่รายการอีกครั้ง"); return true; }
      if (!["NEEDS_CONFIRMATION","CORRECTION_CONFIRMATION"].includes(activity.processingStatus)) { await this.reply(event.replyToken, "รายการนี้ไม่อยู่ในสถานะรอยืนยัน เจ้าหน้าที่จะเป็นผู้ตรวจสอบต่อ"); return true; }
      const now = new Date().toISOString();
      const wasCorrection = activity.processingStatus === "CORRECTION_CONFIRMATION";
      const { correctionRequestedAt: _correctionRequestedAt, ...activityWithoutCorrection } = activity;
      const confirmed = { ...activityWithoutCorrection, processingStatus:"COMPLETED" as const, updatedAt:now };
      await this.repository.saveActivity(confirmed);
      await this.snapshot("ACTIVITY", activity.activityId, farmer.farmerId, wasCorrection ? "CORRECTION_CONFIRMED" : "FARMER_CONFIRM", activity, confirmed);
      await this.reply(event.replyToken, `ยืนยันบันทึก ${activity.activityId} เรียบร้อยแล้ว ✅\nหากพบว่าข้อมูลผิดภายหลัง ส่งข้อความ “แก้ไขล่าสุด” ได้`);
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

  private async notifyResult(lineUserId: string, activity: Activity, beforeCorrection?: Activity) {
    const fallback = this.summary(activity.activityId, activity.transcript ?? "ไม่พบข้อความถอดเสียง", activity.riskStatus);
    return this.outbox.enqueueLineMessage(lineUserId, fallback, resultFlexMessage(activity, fallback, beforeCorrection), activity.activityId);
  }

  private async snapshot(entityType: "ACTIVITY" | "FARMER", entityId: string, actorId: string, action: string, before: unknown, after: unknown, reason?: string) {
    await this.repository.saveAuditEvent({ auditId:createId("AUD"), entityType, entityId, actorId, action, ...(reason ? { reason } : {}), ...(before !== undefined ? { before:structuredClone(before) } : {}), ...(after !== undefined ? { after:structuredClone(after) } : {}), occurredAt:new Date().toISOString() });
  }

  private summary(id: string, transcript: string, risk: string) { const status = risk === "FLAGGED_HIGH" ? "พบประเด็นเสี่ยง รอเจ้าหน้าที่ตรวจ" : risk === "NEEDS_REVIEW" ? "ข้อมูลยังไม่ครบ รอเจ้าหน้าที่ตรวจ" : `บันทึกแล้ว รอยืนยัน\nหากข้อมูลถูกต้อง ส่ง: ยืนยัน ${id}`; return `รับและถอดเสียงสำเร็จ ✅\nเลขที่: ${id}\nข้อความ: ${transcript.slice(0, 700)}\nสถานะ: ${status}`; }
}

function resultFlexMessage(activity: Activity, fallback: string, beforeCorrection?: Activity): Record<string, unknown> {
  const confirmable = activity.processingStatus === "NEEDS_CONFIRMATION" || activity.processingStatus === "CORRECTION_CONFIRMATION";
  const title = beforeCorrection ? "ตรวจข้อมูลที่แก้ไข" : activity.riskStatus === "FLAGGED_HIGH" ? "พบประเด็นที่ต้องตรวจ" : activity.riskStatus === "NEEDS_REVIEW" ? "ต้องตรวจข้อมูลเพิ่มเติม" : "บันทึกเสียงสำเร็จ";
  const status = activity.riskStatus === "FLAGGED_HIGH" ? "รอเจ้าหน้าที่ตรวจความเสี่ยง" : activity.riskStatus === "NEEDS_REVIEW" ? "รอเจ้าหน้าที่ตรวจหรือขอข้อมูลเพิ่ม" : "รอคุณยืนยันความถูกต้อง";
  const facts = [
    ["แปลง", activity.plotName ?? activity.plotId ?? "ยังไม่ระบุ"], ["พืช", activity.crop ?? "ยังไม่ระบุ"], ["กิจกรรม", activity.activityType ?? "ยังไม่ระบุ"], ["สถานะ", status]
  ].map(([label,value]) => ({ type:"box", layout:"baseline", spacing:"sm", contents:[{ type:"text", text:label, color:"#6B7280", size:"sm", flex:2 },{ type:"text", text:value, color:"#17372A", size:"sm", wrap:true, flex:5 }] }));
  const changed = beforeCorrection ? correctionChanges(beforeCorrection, activity) : [];
  const footer = confirmable ? { type:"box", layout:"vertical", spacing:"sm", contents:[
    { type:"button", style:"primary", color:"#287A52", action:{ type:"message", label:beforeCorrection ? "ยืนยันการแก้ไข" : "ยืนยันข้อมูล", text:`ยืนยัน ${activity.activityId}` } },
    { type:"button", style:"secondary", action:{ type:"message", label:"ส่งเสียงแก้ไข", text:`ขอแก้ไข ${activity.activityId}` } }
  ] } : undefined;
  return { type:"flex", altText:fallback.slice(0,400), contents:{ type:"bubble", header:{ type:"box", layout:"vertical", backgroundColor:"#EFF7F0", contents:[{ type:"text", text:title, weight:"bold", size:"lg", color:"#17372A" }] }, body:{ type:"box", layout:"vertical", spacing:"md", contents:[...(changed.length ? [{ type:"text", text:`เปลี่ยนแปลง: ${changed.join(" • ")}`.slice(0,500), wrap:true, size:"sm", weight:"bold", color:"#8A4B08" }] : []),...facts,{ type:"separator", margin:"md" },{ type:"text", text:(activity.transcript ?? "ไม่พบข้อความถอดเสียง").slice(0,500), wrap:true, size:"sm", color:"#374151", margin:"md" },...(activity.flagReasons.length ? [{ type:"text", text:`หมายเหตุ: ${activity.flagReasons.join(" • ")}`.slice(0,500), wrap:true, size:"xs", color:"#8A4B08" }] : [])] }, ...(footer ? { footer } : {}) } };
}

function correctionChanges(before: Activity, after: Activity) {
  const fields: Array<[keyof Activity,string]> = [["plotName","แปลง"],["crop","พืช"],["activityType","กิจกรรม"],["inputsUsed","สิ่งที่ใช้"],["occurredAt","วันเวลา"],["harvestAmount","ปริมาณ"],["harvestUnit","หน่วย"]];
  return fields.filter(([key]) => before[key] !== after[key]).map(([key,label]) => `${label}: ${String(before[key] ?? "ไม่ระบุ")} → ${String(after[key] ?? "ไม่ระบุ")}`);
}

function normalizeThai(value: string) { return value.trim().toLocaleLowerCase("th-TH").replace(/\s+/g, ""); }
function normalizePlotName(value: string) {
  const numbers: Record<string,string> = { "หนึ่ง":"1", "สอง":"2", "สาม":"3", "สี่":"4", "ห้า":"5", "หก":"6", "เจ็ด":"7", "แปด":"8", "เก้า":"9", "ศูนย์":"0" };
  let normalized = normalizeThai(value).replace(/^(แปลงที่|แปลง)/, "");
  for (const [word, digit] of Object.entries(numbers)) normalized = normalized.replaceAll(word, digit);
  return normalized.replace(/[^\p{L}\p{N}]/gu, "");
}
function equivalentPlotName(left: string, right: string) { const a=normalizePlotName(left), b=normalizePlotName(right); return a === b || a.endsWith(b) || b.endsWith(a); }
function mergeExtracted(activity: Activity, next: Awaited<ReturnType<VoiceAnalyzer["analyze"]>>["extracted"]) {
  return {
    ...(activity.plotId ? { plotId:activity.plotId } : {}), ...(activity.crop ? { crop:activity.crop } : {}), ...(activity.activityType ? { activityType:activity.activityType } : {}), ...(activity.inputsUsed ? { inputsUsed:activity.inputsUsed } : {}), ...(activity.harvestAmount !== undefined ? { harvestAmount:activity.harvestAmount } : {}), ...(activity.harvestUnit ? { harvestUnit:activity.harvestUnit } : {}),
    ...Object.fromEntries(Object.entries(next).filter(([, value]) => value !== undefined)),
    isHarvesting:next.isHarvesting || activity.harvestAmount !== undefined,
    fieldConfidence:{ ...(activity.confidence ? { existing:activity.confidence } : {}), ...next.fieldConfidence }
  };
}
