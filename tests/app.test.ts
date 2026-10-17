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

  beforeEach(() => {
    app = createApp({ config: testConfig, repository: new MemoryRepository() });
  });

  it("returns health without authentication", async () => {
    const response = await request(app).get("/health");
    assert.equal(response.status, 200);
    assert.equal(response.body.status, "ok");
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
    assert.ok(dashboard.body.summary.pendingReview > 0);
    assert.equal(dashboard.body.activities.length, 3);
  });

  it("records a review and audit event", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({
      email: "admin@example.com",
      password: "secure-test-password"
    });
    const reviewed = await agent
      .post("/api/activities/ACT-691017-025/review")
      .send({ decision: "APPROVE", reason: "ตรวจหลักฐานและยืนยันกับเกษตรกรแล้ว" });
    assert.equal(reviewed.status, 200);
    assert.equal(reviewed.body.activity.riskStatus, "APPROVED");

    const detail = await agent.get("/api/activities/ACT-691017-025");
    assert.equal(detail.body.reviews.length, 1);
    assert.equal(detail.body.audit.length, 1);
  });

  it("exposes only privacy-safe trace fields", async () => {
    const response = await request(app).get("/api/trace/demo-soy-691016-ld-01");
    assert.equal(response.status, 200);
    assert.equal(response.body.lot.lotId, "SOY-691016-LD-01");
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
