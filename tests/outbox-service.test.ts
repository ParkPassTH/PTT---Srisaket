import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { loadConfig } from "../src/config.js";
import { MemoryRepository } from "../src/repositories/memory-repository.js";
import { OutboxService } from "../src/services/outbox-service.js";

const config = loadConfig({ NODE_ENV:"test", DATA_DRIVER:"memory", SESSION_SECRET:"test-session-secret-at-least-32-characters", ADMIN_EMAIL:"admin@example.com", ADMIN_PASSWORD:"secure-password", LINE_CHANNEL_SECRET:"line-secret", LINE_CHANNEL_ACCESS_TOKEN:"line-token", AI_PROVIDER:"gemini", GEMINI_API_KEY:"gemini-test", ALLOWED_ORIGINS:"http://localhost:3000" });
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

describe("durable LINE outbox", () => {
  it("persists a failed notification for a later retry", async () => {
    const repository = new MemoryRepository();
    globalThis.fetch = async () => new Response("temporary outage", { status:503 });
    const service = new OutboxService(config, repository);
    const message = await service.enqueueLine("U-001", "แจ้งผล", "ACT-001");
    assert.equal(message.status, "PENDING");
    assert.equal(message.attempts, 1);
    assert.match(message.lastError ?? "", /503/);
    assert.equal((await repository.listOutbox()).length, 1);
  });

  it("retries the same durable message without creating a duplicate", async () => {
    const repository = new MemoryRepository();
    let available = false;
    globalThis.fetch = async () => available ? new Response("{}", { status:200 }) : new Response("temporary outage", { status:503 });
    const service = new OutboxService(config, repository);
    const queued = await service.enqueueLine("U-001", "แจ้งผล", "ACT-001");
    available = true;
    const delivered = await service.retry(queued.messageId);
    assert.equal(delivered.status, "DELIVERED");
    assert.equal(delivered.attempts, 2);
    assert.equal((await repository.listOutbox()).length, 1);
  });

  it("moves a message to dead letter after the maximum attempts", async () => {
    const repository = new MemoryRepository();
    globalThis.fetch = async () => new Response("still unavailable", { status:503 });
    const service = new OutboxService(config, repository);
    let message = await service.enqueueLine("U-001", "แจ้งผล", "ACT-001");
    for (let attempt=1; attempt<5; attempt++) message = await service.retry(message.messageId);
    assert.equal(message.status, "DEAD_LETTER");
    assert.equal(message.attempts, 5);
  });

  it("persists and delivers a Flex Message payload", async () => {
    const repository = new MemoryRepository();
    let sentBody = "";
    globalThis.fetch = async (_input, init) => { sentBody = String(init?.body); return new Response("{}", { status:200 }); };
    const service = new OutboxService(config, repository);
    const flex = { type:"flex", altText:"ผลการบันทึก", contents:{ type:"bubble" } };
    const message = await service.enqueueLineMessage("U-001", "ผลการบันทึก", flex, "ACT-001");
    assert.equal(message.status, "DELIVERED");
    assert.deepEqual((await repository.getOutboxMessage(message.messageId))?.lineMessage, flex);
    assert.match(sentBody, /\"type\":\"flex\"/);
  });
});
