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
    const requests: string[] = [];
    globalThis.fetch = async (input) => { requests.push(String(input)); return String(input).includes("api-data.line.me") ? new Response(Buffer.from("audio"), { status:200, headers:{ "content-type":"audio/mp4" } }) : new Response("{}", { status:200 }); };
    const analyzer: VoiceAnalyzer = { analyze: async () => ({ transcript:"วันนี้ใส่ปุ๋ยคอกที่แปลง P-001 ปลูกถั่วเหลือง", plotName:"แปลงหนึ่ง", extracted:{ plotId:"P-001", crop:"ถั่วเหลือง", activityType:"บำรุงดิน", inputsUsed:"ปุ๋ยคอก", isHarvesting:false, fieldConfidence:{ plotId:0.95,crop:0.95,activityType:0.9,inputsUsed:0.9 } } }) };
    const service = new LineService(config, repository, analyzer);
    const body = Buffer.from(JSON.stringify({ events: [{ type:"message", webhookEventId:"audio-event-1", replyToken:"reply-2", timestamp:1700000000000, source:{ type:"user", userId:"U-REAL" }, message:{ type:"audio", id:"audio-123456", duration:4000 } }] }));
    const result = await service.acceptWebhook(body, sign(body));
    const activity = await repository.findActivityBySourceEvent("audio-event-1");
    assert.equal(result.accepted, 1);
    assert.equal(activity?.transcript, "วันนี้ใส่ปุ๋ยคอกที่แปลง P-001 ปลูกถั่วเหลือง");
    assert.equal(activity?.processingStatus, "NEEDS_CONFIRMATION");
    assert.ok(requests.some((url) => url.includes("api-data.line.me")));
    assert.ok(requests.some((url) => url.includes("api.line.me/v2/bot/message/reply")));
  });
});
