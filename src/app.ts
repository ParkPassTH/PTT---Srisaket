import express, { type ErrorRequestHandler } from "express";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import type { AppConfig } from "./config.js";
import type { Repository } from "./repositories/repository.js";
import { AuthService } from "./services/auth-service.js";
import { LineService } from "./services/line-service.js";
import { ReviewService } from "./services/review-service.js";
import { HttpError } from "./lib/http-error.js";

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(8) });
const reviewSchema = z.object({
  decision: z.enum(["APPROVE", "FLAG", "REQUEST_INFO", "VOID"]),
  reason: z.string().trim().min(5).max(500)
});

export function createApp(dependencies: { config: AppConfig; repository: Repository }) {
  const { config, repository } = dependencies;
  const app = express();
  const auth = new AuthService(config);
  const reviewService = new ReviewService(repository);
  const lineService = new LineService(config, repository);
  const publicDirectory = fileURLToPath(new URL("../public", import.meta.url));

  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        "default-src": ["'self'"],
        "style-src": ["'self'", "https://fonts.googleapis.com"],
        "font-src": ["'self'", "https://fonts.gstatic.com"],
        "img-src": ["'self'", "data:"],
        "script-src": ["'self'"]
      }
    }
  }));

  app.post("/webhooks/line", express.raw({ type: "application/json", limit: "2mb" }), async (request, response, next) => {
    try {
      const result = await lineService.acceptWebhook(request.body as Buffer, request.header("x-line-signature"));
      response.status(200).json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  });

  app.use(express.json({ limit: "256kb" }));
  app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: "draft-7",
    legacyHeaders: false
  }));

  app.get("/health", (_request, response) => {
    response.json({ status: "ok", version: "0.1.0", time: new Date().toISOString() });
  });

  app.post("/api/auth/login", rateLimit({ windowMs: 15 * 60 * 1000, limit: 10 }), (request, response, next) => {
    try {
      const credentials = loginSchema.parse(request.body);
      const { token, user } = auth.login(credentials.email, credentials.password);
      auth.attachCookie(response, token);
      response.json({ user });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/auth/logout", (_request, response) => {
    auth.clearCookie(response);
    response.status(204).end();
  });

  app.get("/api/auth/me", auth.requireUser, (request, response) => {
    response.json({ user: request.user });
  });

  app.get("/api/dashboard", auth.requireUser, async (_request, response, next) => {
    try {
      const [summary, activities, lots] = await Promise.all([
        repository.getDashboardSummary(),
        repository.listActivities(),
        repository.listLots()
      ]);
      response.json({ summary, activities: activities.slice(0, 8), lots: lots.slice(0, 5) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/activities", auth.requireUser, async (request, response, next) => {
    try {
      const filters = {
        ...(typeof request.query.status === "string" ? { status: request.query.status } : {}),
        ...(typeof request.query.risk === "string" ? { risk: request.query.risk } : {}),
        ...(typeof request.query.query === "string" ? { query: request.query.query } : {})
      };
      response.json({ activities: await repository.listActivities(filters) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/activities/:activityId", auth.requireUser, async (request, response, next) => {
    try {
      const activityId = request.params.activityId as string;
      const activity = await repository.getActivity(activityId);
      if (!activity) throw new HttpError(404, "ACTIVITY_NOT_FOUND", "ไม่พบกิจกรรมที่ค้นหา");
      const [reviews, audit] = await Promise.all([
        repository.listReviews(activityId),
        repository.listAuditEvents(activityId)
      ]);
      response.json({ activity, reviews, audit });
    } catch (error) {
      next(error);
    }
  });

  app.post(
    "/api/activities/:activityId/review",
    auth.requireUser,
    auth.requireRole("REVIEWER", "ADMIN"),
    async (request, response, next) => {
      try {
        const input = reviewSchema.parse(request.body);
        const activity = await reviewService.reviewActivity({
          activityId: request.params.activityId as string,
          decision: input.decision,
          reason: input.reason,
          user: request.user!
        });
        response.json({ activity });
      } catch (error) {
        next(error);
      }
    }
  );

  app.get("/api/lots", auth.requireUser, async (_request, response, next) => {
    try {
      response.json({ lots: await repository.listLots() });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/trace/:token", async (request, response, next) => {
    try {
      if (!config.publicTraceEnabled) throw new HttpError(404, "TRACE_DISABLED", "ไม่ได้เปิดใช้งานหน้าตรวจสอบสาธารณะ");
      const lot = await repository.getLotByTraceToken(request.params.token as string);
      if (!lot) throw new HttpError(404, "LOT_NOT_FOUND", "ไม่พบล็อตหรือรหัสตรวจสอบไม่ถูกต้อง");
      response.json({
        lot: {
          lotId: lot.lotId,
          crop: lot.crop,
          quantity: lot.quantity,
          unit: lot.unit,
          harvestDate: lot.harvestDate,
          inventoryStatus: lot.inventoryStatus,
          community: "กลุ่มเกษตรผักไหม",
          updatedAt: lot.updatedAt
        },
        notice: "ข้อมูลนี้ใช้สำหรับตรวจสอบย้อนกลับ ไม่ใช่ใบรับรองมาตรฐานโดยอัตโนมัติ"
      });
    } catch (error) {
      next(error);
    }
  });

  app.use(express.static(publicDirectory));
  app.get("*", (_request, response) => {
    response.sendFile(join(publicDirectory, "index.html"));
  });

  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    if (error instanceof z.ZodError) {
      response.status(400).json({ error: { code: "VALIDATION_ERROR", message: "ข้อมูลที่ส่งมาไม่ถูกต้อง", details: error.flatten() } });
      return;
    }
    if (error instanceof HttpError) {
      response.status(error.status).json({ error: { code: error.code, message: error.message, details: error.details } });
      return;
    }
    console.error(JSON.stringify({ level: "error", message: "Unhandled request error", error: error instanceof Error ? error.message : String(error) }));
    response.status(500).json({ error: { code: "INTERNAL_ERROR", message: "ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง" } });
  };
  app.use(errorHandler);

  return app;
}
