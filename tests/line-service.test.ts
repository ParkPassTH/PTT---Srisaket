import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createHmac } from "node:crypto";
import { loadConfig } from "../src/config.js";
import { MemoryRepository } from "../src/repositories/memory-repository.js";
import { LineService } from "../src/services/line-service.js";
import type { VoiceAnalyzer } from "../src/services/gemini-service.js";

const config = loadConfig({ NODE_ENV:"test", DATA_DRIVER:"memory", SESSION_SECRET:"test-session-secret-at-least-32-characters", ADMIN_EMAIL:"admin@example.com", ADMIN_PASSWORD:"secure-password", LINE_CHANNEL_SECRET:"line-secret", LINE_CHANNEL_ACCESS_TOKEN:"line-token", AI_PROVIDER:"gemini", GEMINI_API_KEY:"gemini-test", ALLOWED_ORIGINS:"http://localhost:3000" });
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const sign = (body: Buffer) => createHmac("sha256", config.LINE_CHANNEL_SECRET!).update(body).digest("base64");

describe("LINE voice pipeline", () => {
  it("links a LINE user with a member code", async () => {
    const repository = new MemoryRepository();
    await repository.saveFarmer({ farmerId:"F-001", memberCode:"M001", displayName:"ผู้ทดสอบ", status:"ACTIVE" });
    globalThis.fetch = async () => new Response("{}", { status: 200 });
    const service = new LineService(config, repository);
    const body = Buffer.from(JSON.stringify({ events: [{ type:"message", webhookEventId:"register-1", replyToken:"reply-1", timestamp:1, source:{ type:"user", userId:"U-REAL" }, message:{ type:"text", id:"text-1", text:"ลงทะเบียน M001" } }] }));
    const result = await service.acceptWebhook(body, sign(body));
    assert.equal(result.accepted, 1);
    assert.equal((await repository.getFarmerByLineUserId("U-REAL"))?.memberCode, "M001");
  });

  it("downloads, analyzes, evaluates and persists an audio event", async () => {
    const repository = new MemoryRepository();
    await repository.saveFarmer({ farmerId:"F-001", memberCode:"M001", displayName:"ผู้ทดสอบ", lineUserId:"U-REAL", status:"ACTIVE" });
    await repository.savePlot({ plotId:"P-001", farmerId:"F-001", name:"แปลงหนึ่ง", crop:"ถั่วเหลือง", status:"ACTIVE" });
    await repository.savePlot({ plotId:"P-002", farmerId:"F-001", name:"แปลงสอง", crop:"ข้าว", status:"ACTIVE" });
    const requests: string[] = [];
    globalThis.fetch = async (input) => { requests.push(String(input)); return String(input).includes("api-data.line.me") ? new Response(Buffer.from("audio"), { status:200, headers:{ "content-type":"audio/mp4" } }) : new Response("{}", { status:200 }); };
    const analyzer: VoiceAnalyzer = { analyze: async () => ({ transcript:"วันนี้ใส่ปุ๋ยคอกที่แปลง 1 ปลูกถั่วเหลือง", plotName:"แปลง 1", extracted:{ plotId:"แปลง 1", crop:"ถั่วเหลือง", activityType:"บำรุงดิน", inputsUsed:"ปุ๋ยคอก", isHarvesting:false, fieldConfidence:{ plotId:0.95,crop:0.95,activityType:0.9,inputsUsed:0.9 } } }) };
    const service = new LineService(config, repository, analyzer);
    const body = Buffer.from(JSON.stringify({ events: [{ type:"message", webhookEventId:"audio-event-1", replyToken:"reply-2", timestamp:1700000000000, source:{ type:"user", userId:"U-REAL" }, message:{ type:"audio", id:"audio-123456", duration:4000 } }] }));
    const result = await service.acceptWebhook(body, sign(body));
    const activity = await repository.findActivityBySourceEvent("audio-event-1");
    assert.equal(result.accepted, 1);
    assert.equal(activity?.transcript, "วันนี้ใส่ปุ๋ยคอกที่แปลง 1 ปลูกถั่วเหลือง");
    assert.equal(activity?.plotId, "P-001");
    assert.equal(activity?.processingStatus, "NEEDS_CONFIRMATION");
    assert.ok(requests.some((url) => url.includes("api-data.line.me")));
    assert.ok(requests.some((url) => url.includes("api.line.me/v2/bot/message/reply")));
    assert.ok(requests.some((url) => url.includes("api.line.me/v2/bot/message/push")));
    assert.deepEqual((await repository.listAuditEvents(activity!.activityId)).map((event) => event.action), ["VOICE_RECEIVED", "VOICE_PROCESSED"]);
  });

  it("merges a farmer follow-up into the awaiting activity instead of creating a new one", async () => {
    const repository = new MemoryRepository();
    await repository.saveFarmer({ farmerId:"F-001", memberCode:"M001", displayName:"ผู้ทดสอบ", lineUserId:"U-REAL", status:"ACTIVE" });
    await repository.savePlot({ plotId:"P-001", farmerId:"F-001", name:"แปลงหนึ่ง", crop:"ข้าว", status:"ACTIVE" });
    await repository.saveActivity({ activityId:"ACT-OLD", sourceEventId:"voice-original", sourceEventIds:["voice-original"], farmerId:"F-001", farmerName:"ผู้ทดสอบ", occurredAt:"2026-10-18T01:00:00.000Z", receivedAt:"2026-10-18T01:00:00.000Z", transcript:"วันนี้ปลูก", activityType:"ปลูก", processingStatus:"AWAITING_FARMER", riskStatus:"NEEDS_REVIEW", confidence:0.7, flagReasons:["ข้อมูลบังคับไม่ครบ: plotId, crop"], matchedTerms:[], updatedAt:"2026-10-18T01:00:00.000Z" });
    globalThis.fetch = async (input) => String(input).includes("api-data.line.me") ? new Response(Buffer.from("audio"), { status:200, headers:{ "content-type":"audio/mp4" } }) : new Response("{}", { status:200 });
    const analyzer: VoiceAnalyzer = { analyze: async () => ({ transcript:"แปลง 1 ปลูกข้าว", plotName:"แปลง 1", extracted:{ plotId:"แปลง 1", crop:"ข้าว", isHarvesting:false, fieldConfidence:{ plotId:0.98,crop:0.98 } } }) };
    const service = new LineService(config, repository, analyzer);
    const body = Buffer.from(JSON.stringify({ events:[{ type:"message", webhookEventId:"voice-followup", replyToken:"reply-followup", timestamp:1700000005000, source:{ type:"user", userId:"U-REAL" }, message:{ type:"audio", id:"audio-followup", duration:3000 } }] }));
    const result = await service.acceptWebhook(body, sign(body));
    const activities = await repository.listActivities();
    assert.equal(result.accepted, 1);
    assert.equal(activities.length, 1);
    assert.equal(activities[0]?.activityId, "ACT-OLD");
    assert.equal(activities[0]?.plotId, "P-001");
    assert.match(activities[0]?.transcript ?? "", /ข้อมูลเพิ่มเติม/);
    assert.equal((await repository.findActivityBySourceEvent("voice-followup"))?.activityId, "ACT-OLD");
    assert.deepEqual((await repository.listAuditEvents("ACT-OLD")).map((event) => event.action), ["FOLLOWUP_VOICE_RECEIVED", "FOLLOWUP_MERGED"]);
  });

  it("lets the linked farmer confirm a provisionally clear record", async () => {
    const repository = new MemoryRepository();
    await repository.saveFarmer({ farmerId:"F-001", memberCode:"M001", displayName:"ผู้ทดสอบ", lineUserId:"U-REAL", status:"ACTIVE" });
    await repository.saveActivity({ activityId:"ACT-1700000000000-123456", sourceEventId:"voice-1", farmerId:"F-001", farmerName:"ผู้ทดสอบ", occurredAt:new Date().toISOString(), receivedAt:new Date().toISOString(), processingStatus:"NEEDS_CONFIRMATION", riskStatus:"PROVISIONALLY_CLEAR", confidence:0.9, flagReasons:[], matchedTerms:[], updatedAt:new Date().toISOString() });
    globalThis.fetch = async () => new Response("{}", { status:200 });
    const service = new LineService(config, repository);
    const body = Buffer.from(JSON.stringify({ events:[{ type:"message", webhookEventId:"confirm-1", replyToken:"reply-confirm", timestamp:2, source:{ type:"user", userId:"U-REAL" }, message:{ type:"text", id:"text-confirm", text:"ยืนยัน ACT-1700000000000-123456" } }] }));
    const result = await service.acceptWebhook(body, sign(body));
    assert.equal(result.accepted, 1);
    assert.equal((await repository.getActivity("ACT-1700000000000-123456"))?.processingStatus, "COMPLETED");
    assert.equal((await repository.listAuditEvents("ACT-1700000000000-123456"))[0]?.action, "FARMER_CONFIRM");
  });
});
