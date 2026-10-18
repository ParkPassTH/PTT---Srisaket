import request from "supertest";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { MemoryRepository } from "../src/repositories/memory-repository.js";

const testConfig = loadConfig({
  NODE_ENV: "test",
  PORT: "3000",
  APP_BASE_URL: "http://localhost:3000",
  DATA_DRIVER: "memory",
  SESSION_SECRET: "test-session-secret-at-least-32-characters",
  ADMIN_EMAIL: "admin@example.com",
  ADMIN_PASSWORD: "secure-test-password",
  ALLOWED_ORIGINS: "http://localhost:3000",
  PUBLIC_TRACE_ENABLED: "true"
});

describe("HTTP API", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    const repository = new MemoryRepository();
    const now = new Date().toISOString();
    await repository.saveFarmer({ farmerId:"F-TEST", memberCode:"M-TEST", displayName:"ผู้ทดสอบ", status:"ACTIVE" });
    await repository.savePlot({ plotId:"P-TEST", farmerId:"F-TEST", name:"แปลงทดสอบ", crop:"พืชทดสอบ", status:"ACTIVE" });
    await repository.saveActivity({ activityId:"ACT-TEST-001", sourceEventId:"event-test-001", farmerId:"F-TEST", farmerName:"ผู้ทดสอบ", plotName:"แปลงทดสอบ", crop:"พืชทดสอบ", activityType:"เก็บเกี่ยว", harvestAmount:12, harvestUnit:"กก.", occurredAt:now, receivedAt:now, transcript:"ทดสอบกิจกรรม", processingStatus:"NEEDS_REVIEW", riskStatus:"NEEDS_REVIEW", confidence:0.8, flagReasons:["ทดสอบ"], matchedTerms:[], updatedAt:now });
    await repository.saveLot({ lotId:"LOT-TEST-001", activityId:"ACT-TEST-001", farmerId:"F-TEST", farmerName:"ผู้ทดสอบ", plotName:"แปลงทดสอบ", crop:"พืชทดสอบ", quantity:1, unit:"กก.", harvestDate:now.slice(0,10), inventoryStatus:"IN_STOCK", traceToken:"trace-test-001", createdAt:now, updatedAt:now });
    app = createApp({ config: testConfig, repository });
  });

  it("returns health without authentication", async () => {
    const response = await request(app).get("/health");
    assert.equal(response.status, 200);
    assert.equal(response.body.status, "ok");
  });

  it("publishes security headers and a dependency-aware readiness result", async () => {
    const health = await request(app).get("/health");
    assert.match(health.headers["content-security-policy"] ?? "", /default-src 'self'/);
    assert.equal(health.headers["x-content-type-options"], "nosniff");
    const ready = await request(app).get("/ready");
    assert.equal(ready.status, 503);
    assert.equal(ready.body.dependencies.dataStore, "ok");
    assert.equal(ready.body.dependencies.line, "missing");
  });

  it("requires authentication for backup and validates a downloaded archive", async () => {
    assert.equal((await request(app).get("/api/system/backup")).status,401);
    const agent=request.agent(app);
    await agent.post("/api/auth/login").send({ email:"admin@example.com", password:"secure-test-password" });
    const backup=await agent.get("/api/system/backup");
    assert.equal(backup.status,200);
    assert.match(backup.headers["content-disposition"] ?? "", /ics-backup/);
    const validation=await agent.post("/api/system/backup/validate").send(backup.body);
    assert.equal(validation.status,200);
    assert.equal(validation.body.valid,true);
    assert.equal(validation.body.counts.activities,1);
  });

  it("serves the dashboard application shell", async () => {
    const response = await request(app).get("/");
    assert.equal(response.status, 200);
    assert.match(response.text, /ทะเบียน ICS/);
    assert.match(response.headers["content-type"] ?? "", /text\/html/);
  });

  it("protects dashboard routes", async () => {
    const response = await request(app).get("/api/dashboard");
    assert.equal(response.status, 401);
    assert.equal(response.body.error.code, "AUTH_REQUIRED");
  });

  it("logs in and loads the dashboard", async () => {
    const agent = request.agent(app);
    const login = await agent.post("/api/auth/login").send({
      email: "admin@example.com",
      password: "secure-test-password"
    });
    assert.equal(login.status, 200);
    assert.match(login.headers["set-cookie"]?.[0] ?? "", /HttpOnly/);

    const dashboard = await agent.get("/api/dashboard");
    assert.equal(dashboard.status, 200);
    assert.equal(dashboard.body.summary.pendingReview, 1);
    assert.equal(dashboard.body.activities.length, 1);
    assert.equal(dashboard.body.dataSource, "memory");
  });

  it("records a review and audit event", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({
      email: "admin@example.com",
      password: "secure-test-password"
    });
    const reviewed = await agent
      .post("/api/activities/ACT-TEST-001/review")
      .send({ decision: "APPROVE", reason: "ตรวจหลักฐานและยืนยันกับเกษตรกรแล้ว" });
    assert.equal(reviewed.status, 200);
    assert.equal(reviewed.body.activity.riskStatus, "APPROVED");

    const detail = await agent.get("/api/activities/ACT-TEST-001");
    assert.equal(detail.body.reviews.length, 1);
    assert.equal(detail.body.audit.length, 1);
  });

  it("creates farmers and plots from the dashboard API", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email:"admin@example.com", password:"secure-test-password" });
    const farmerResponse = await agent.post("/api/farmers").send({ memberCode:"M001", displayName:"สมหญิง ใจดี" });
    assert.equal(farmerResponse.status, 201);
    assert.equal(farmerResponse.body.farmer.status, "ACTIVE");

    const duplicate = await agent.post("/api/farmers").send({ memberCode:"m001", displayName:"ชื่อซ้ำ" });
    assert.equal(duplicate.status, 409);

    const plotResponse = await agent.post("/api/plots").send({ farmerId:farmerResponse.body.farmer.farmerId, name:"แปลงเหนือ", crop:"หอมแดง" });
    assert.equal(plotResponse.status, 201);
    const registry = await agent.get("/api/farmers");
    assert.equal(registry.body.farmers.length, 2);
    assert.ok(registry.body.plots.some((plot: { crop:string }) => plot.crop === "หอมแดง"));
  });

  it("reports integration readiness without exposing secrets", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email:"admin@example.com", password:"secure-test-password" });
    const response = await agent.get("/api/integrations/status");
    assert.equal(response.status, 200);
    assert.equal(response.body.dataStore.provider, "memory");
    assert.equal(response.body.ai.provider, "gemini");
    assert.equal(JSON.stringify(response.body).includes("gemini-test"), false);
  });

  it("corrects extracted activity fields with before/after audit snapshots", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email:"admin@example.com", password:"secure-test-password" });
    const corrected = await agent.patch("/api/activities/ACT-TEST-001").send({ occurredAt:"2026-10-18T08:30:00+07:00", plotId:"P-TEST", crop:"พืชทดสอบ", activityType:"รดน้ำ", inputsUsed:"น้ำหมักสูตร 1", reason:"ยืนยันจากสมุดบันทึกประจำแปลง" });
    assert.equal(corrected.status, 200);
    assert.equal(corrected.body.activity.plotId, "P-TEST");
    const detail = await agent.get("/api/activities/ACT-TEST-001");
    const correction = detail.body.audit.find((event: { action:string }) => event.action === "MANUAL_CORRECTION");
    assert.equal(correction.before.activityType, "เก็บเกี่ยว");
    assert.equal(correction.after.activityType, "รดน้ำ");
  });

  it("creates a traceable lot from an approved harvest and exports CSV", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email:"admin@example.com", password:"secure-test-password" });
    await agent.post("/api/activities/ACT-TEST-001/review").send({ decision:"APPROVE", reason:"ตรวจข้อมูลเก็บเกี่ยวครบถ้วนแล้ว" });
    const created = await agent.post("/api/lots").send({ activityId:"ACT-TEST-001" });
    assert.equal(created.status, 201);
    assert.equal(created.body.lot.inventoryStatus, "IN_STOCK");
    const trace = await request(app).get(`/api/trace/${created.body.lot.traceToken}`);
    assert.equal(trace.body.lot.crop, "พืชทดสอบ");
    const qr = await agent.get(`/api/lots/${created.body.lot.lotId}/qr.png`);
    assert.equal(qr.status, 200);
    assert.match(qr.headers["content-type"] ?? "", /image\/png/);
    const report = await agent.get("/api/reports/activities.csv");
    assert.match(report.headers["content-type"] ?? "", /text\/csv/);
    assert.match(report.text, /ACT-TEST-001/);
  });

  it("rejects lot creation when the approved activity is not harvesting", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email:"admin@example.com", password:"secure-test-password" });
    await agent.patch("/api/activities/ACT-TEST-001").send({ occurredAt:"2026-10-18T08:30:00+07:00", plotId:"P-TEST", crop:"พืชทดสอบ", activityType:"รดน้ำ", harvestAmount:12, harvestUnit:"กก.", reason:"ทดสอบกิจกรรมที่ไม่ใช่การเก็บเกี่ยว" });
    await agent.post("/api/activities/ACT-TEST-001/review").send({ decision:"APPROVE", reason:"ทดสอบอนุมัติรายการที่ไม่ใช่เก็บเกี่ยว" });
    const response = await agent.post("/api/lots").send({ activityId:"ACT-TEST-001" });
    assert.equal(response.status, 409);
    assert.equal(response.body.error.code, "NOT_HARVEST_ACTIVITY");
  });

  it("exposes only privacy-safe trace fields", async () => {
    const response = await request(app).get("/api/trace/trace-test-001");
    assert.equal(response.status, 200);
    assert.equal(response.body.lot.lotId, "LOT-TEST-001");
    assert.equal(response.body.lot.farmerName, undefined);
    assert.equal(response.body.lot.farmerId, undefined);
  });

  it("rejects unsigned LINE webhook calls", async () => {
    const response = await request(app)
      .post("/webhooks/line")
      .set("Content-Type", "application/json")
      .send({ events: [] });
    assert.equal(response.status, 503);
    assert.equal(response.body.error.code, "LINE_NOT_CONFIGURED");
  });
});
