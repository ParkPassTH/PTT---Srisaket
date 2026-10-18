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

  it("sends an actionable Flex result and lets the farmer request a correction", async () => {
    const repository = new MemoryRepository();
    await repository.saveFarmer({ farmerId:"F-001", memberCode:"M001", displayName:"ผู้ทดสอบ", lineUserId:"U-REAL", status:"ACTIVE" });
    await repository.savePlot({ plotId:"P-001", farmerId:"F-001", name:"แปลงหนึ่ง", crop:"ข้าว", status:"ACTIVE" });
    const requestBodies: unknown[] = [];
    globalThis.fetch = async (input, init) => {
      if (!String(input).includes("api-data.line.me") && init?.body) requestBodies.push(JSON.parse(String(init.body)));
      return String(input).includes("api-data.line.me") ? new Response(Buffer.from("audio"), { status:200, headers:{ "content-type":"audio/mp4" } }) : new Response("{}", { status:200 });
    };
    const analyzer: VoiceAnalyzer = { analyze: async () => ({ transcript:"วันนี้ถอนหญ้าที่แปลงหนึ่ง", plotName:"แปลงหนึ่ง", extracted:{ plotId:"แปลงหนึ่ง", crop:"ข้าว", activityType:"ถอนหญ้า", isHarvesting:false, fieldConfidence:{ plotId:0.95,crop:0.95,activityType:0.95 } } }) };
    const service = new LineService(config, repository, analyzer);
    const voice = Buffer.from(JSON.stringify({ events:[{ type:"message", webhookEventId:"voice-flex", replyToken:"reply-flex", timestamp:1700000008000, source:{ type:"user", userId:"U-REAL" }, message:{ type:"audio", id:"audio-flex1", duration:3000 } }] }));
    await service.acceptWebhook(voice, sign(voice));
    const activity = (await repository.listActivities())[0]!;
    const push = requestBodies.find((body) => JSON.stringify(body).includes('"type":"flex"'));
    assert.ok(push);
    assert.match(JSON.stringify(push), /ยืนยันข้อมูล/);
    const correction = Buffer.from(JSON.stringify({ events:[{ type:"message", webhookEventId:"correct-flex", replyToken:"reply-correct", timestamp:1700000009000, source:{ type:"user", userId:"U-REAL" }, message:{ type:"text", id:"text-correct", text:`ขอแก้ไข ${activity.activityId}` } }] }));
    await service.acceptWebhook(correction, sign(correction));
    assert.equal((await repository.getActivity(activity.activityId))?.processingStatus, "CORRECTION_PENDING");
    assert.equal((await repository.listAuditEvents(activity.activityId)).at(-1)?.action, "CORRECTION_REQUESTED");
  });

  it("corrects the latest completed activity in place and confirms a new revision", async () => {
    const repository = new MemoryRepository();
    await repository.saveFarmer({ farmerId:"F-001", memberCode:"M001", displayName:"ผู้ทดสอบ", lineUserId:"U-REAL", status:"ACTIVE" });
    await repository.savePlot({ plotId:"P-001", farmerId:"F-001", name:"แปลงหนึ่ง", crop:"ข้าว", status:"ACTIVE" });
    await repository.savePlot({ plotId:"P-002", farmerId:"F-001", name:"แปลงสอง", crop:"มันสำปะหลัง", status:"ACTIVE" });
    await repository.saveActivity({ activityId:"ACT-CORRECT", sourceEventId:"voice-original", farmerId:"F-001", farmerName:"ผู้ทดสอบ", plotId:"P-001", plotName:"แปลงหนึ่ง", crop:"ข้าว", activityType:"ปลูก", occurredAt:"2026-10-18T01:00:00.000Z", receivedAt:"2026-10-18T01:00:00.000Z", transcript:"ปลูกข้าวแปลงหนึ่ง", processingStatus:"COMPLETED", riskStatus:"PROVISIONALLY_CLEAR", confidence:0.95, flagReasons:[], matchedTerms:[], revision:1, updatedAt:new Date().toISOString() });
    const sentBodies: string[] = [];
    globalThis.fetch = async (input, init) => {
      if (init?.body) sentBodies.push(String(init.body));
      return String(input).includes("api-data.line.me") ? new Response(Buffer.from("audio"), { status:200, headers:{ "content-type":"audio/mp4" } }) : new Response("{}", { status:200 });
    };
    const analyzer: VoiceAnalyzer = { analyze: async () => ({ transcript:"แก้เป็นแปลงสอง", plotName:"แปลงสอง", extracted:{ plotId:"แปลงสอง", isHarvesting:false, fieldConfidence:{ plotId:0.98 } } }) };
    const service = new LineService(config, repository, analyzer);
    const request = Buffer.from(JSON.stringify({ events:[{ type:"message", webhookEventId:"correct-latest", replyToken:"reply-request", timestamp:3, source:{ type:"user", userId:"U-REAL" }, message:{ type:"text", id:"text-request", text:"แก้ไขล่าสุด" } }] }));
    await service.acceptWebhook(request, sign(request));
    assert.equal((await repository.getActivity("ACT-CORRECT"))?.processingStatus, "CORRECTION_PENDING");

    const voice = Buffer.from(JSON.stringify({ events:[{ type:"message", webhookEventId:"correction-voice", replyToken:"reply-voice", timestamp:4, source:{ type:"user", userId:"U-REAL" }, message:{ type:"audio", id:"audio-correct", duration:3000 } }] }));
    await service.acceptWebhook(voice, sign(voice));
    const proposed = await repository.getActivity("ACT-CORRECT");
    assert.equal((await repository.listActivities()).length, 1);
    assert.equal(proposed?.processingStatus, "CORRECTION_CONFIRMATION");
    assert.equal(proposed?.plotId, "P-002");
    assert.equal(proposed?.crop, "มันสำปะหลัง");
    assert.equal(proposed?.revision, 2);
    assert.ok(sentBodies.some((body) => body.includes("ยืนยันการแก้ไข") && body.includes("เปลี่ยนแปลง")));

    const confirm = Buffer.from(JSON.stringify({ events:[{ type:"message", webhookEventId:"confirm-correction", replyToken:"reply-confirm", timestamp:5, source:{ type:"user", userId:"U-REAL" }, message:{ type:"text", id:"text-confirm-correction", text:"ยืนยัน ACT-CORRECT" } }] }));
    await service.acceptWebhook(confirm, sign(confirm));
    assert.equal((await repository.getActivity("ACT-CORRECT"))?.processingStatus, "COMPLETED");
    assert.deepEqual((await repository.listAuditEvents("ACT-CORRECT")).map((event) => event.action), ["CORRECTION_REQUESTED","CORRECTION_VOICE_RECEIVED","CORRECTION_PROPOSED","CORRECTION_CONFIRMED"]);
  });
});
