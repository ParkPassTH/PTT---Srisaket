import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import helmetModule, { type HelmetOptions } from "helmet";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import QRCode from "qrcode";
import type { AppConfig } from "./config.js";
import type { Repository } from "./repositories/repository.js";
import { AuthService } from "./services/auth-service.js";
import { LineService, pushLineText } from "./services/line-service.js";
import { createVoiceAnalyzer } from "./services/gemini-service.js";
import { ReviewService } from "./services/review-service.js";
import { HttpError } from "./lib/http-error.js";
import { createId, createTraceToken } from "./lib/ids.js";
import { evaluateIcsRisk } from "./domain/ics-rules.js";
import type { Farmer, Plot } from "./domain/types.js";

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(8) });
const reviewSchema = z.object({
  decision: z.enum(["APPROVE", "FLAG", "REQUEST_INFO", "VOID"]),
  reason: z.string().trim().min(5).max(500)
});
const farmerSchema = z.object({
  memberCode: z.string().trim().min(2).max(30).regex(/^[A-Za-z0-9_-]+$/, "รหัสสมาชิกใช้ได้เฉพาะตัวอักษร ตัวเลข _ และ -"),
  displayName: z.string().trim().min(2).max(120),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"), address:z.string().trim().max(300).optional(), phone:z.string().trim().max(30).optional(), registeredAt:z.string().date().optional(), totalAreaRai:z.coerce.number().nonnegative().optional()
});
const plotSchema = z.object({
  farmerId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(120),
  crop: z.string().trim().min(1).max(120),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"), areaRai:z.coerce.number().nonnegative().optional(), gpsLat:z.coerce.number().min(-90).max(90).optional(), gpsLng:z.coerce.number().min(-180).max(180).optional(), certificationStatus:z.enum(["ORGANIC", "CONVERSION", "CONVENTIONAL"]).optional(), conversionStartedAt:z.string().date().optional(), conversionEndsAt:z.string().date().optional(), previousChemicalUse:z.string().trim().max(500).optional(), estimatedYield:z.coerce.number().nonnegative().optional(), estimatedYieldUnit:z.string().trim().max(30).optional()
});
const lotCreateSchema = z.object({ activityId:z.string().trim().min(1) });
const lotStatusSchema = z.object({ status:z.enum(["IN_STOCK", "RESERVED", "SHIPPED", "VOID", "RECALLED"]), reason:z.string().trim().min(5).max(500) });
const activityCorrectionSchema = z.object({
  occurredAt:z.string().datetime({ offset:true }), plotId:z.string().trim().min(1), crop:z.string().trim().min(1).max(120),
  activityType:z.string().trim().min(1).max(120), inputsUsed:z.string().trim().max(300).optional(),
  harvestAmount:z.coerce.number().nonnegative().optional(), harvestUnit:z.string().trim().max(30).optional(), reason:z.string().trim().min(5).max(500)
});

// Helmet publishes conditional ESM/CJS exports. Normalize the export explicitly
// so TypeScript/Vercel and local Node builds agree on the callable middleware.
const helmet = (
  (helmetModule as unknown as { default?: unknown }).default ?? helmetModule
) as (options?: Readonly<HelmetOptions>) => RequestHandler;

export function createApp(dependencies: { config: AppConfig; repository: Repository }) {
  const { config, repository } = dependencies;
  const app = express();
  const auth = new AuthService(config);
  const reviewService = new ReviewService(repository);
  const lineService = new LineService(config, repository, createVoiceAnalyzer(config));
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

  app.get("/api/integrations/status", auth.requireUser, auth.requireRole("ADMIN"), (_request, response) => {
    response.json({
      dataStore: { provider: config.DATA_DRIVER, configured: config.DATA_DRIVER === "google-sheets" },
      line: { configured: Boolean(config.LINE_CHANNEL_SECRET && config.LINE_CHANNEL_ACCESS_TOKEN) },
      ai: { provider: config.AI_PROVIDER, configured: config.AI_PROVIDER === "gemini" ? Boolean(config.GEMINI_API_KEY) : Boolean(config.OPENAI_API_KEY), model: config.AI_PROVIDER === "gemini" ? config.GEMINI_MODEL : config.OPENAI_EXTRACTION_MODEL },
      publicTrace: { configured: config.publicTraceEnabled }
    });
  });

  app.get("/api/farmers", auth.requireUser, async (_request, response, next) => {
    try {
      const [farmers, plots] = await Promise.all([repository.listFarmers(), repository.listPlots()]);
      response.json({ farmers, plots });
    } catch (error) { next(error); }
  });

  app.post("/api/farmers", auth.requireUser, auth.requireRole("ADMIN"), async (request, response, next) => {
    try {
      const input = farmerSchema.parse(request.body);
      if (await repository.getFarmerByMemberCode(input.memberCode)) throw new HttpError(409, "MEMBER_CODE_EXISTS", "รหัสสมาชิกนี้ถูกใช้งานแล้ว");
      const farmer = { farmerId: createId("FARM"), ...defined(input) } as Farmer;
      await repository.saveFarmer(farmer);
      await repository.saveAuditEvent({ auditId:createId("AUD"), entityType:"FARMER", entityId:farmer.farmerId, actorId:request.user!.userId, action:"CREATE", after:farmer, occurredAt:new Date().toISOString() });
      response.status(201).json({ farmer });
    } catch (error) { next(error); }
  });

  app.patch("/api/farmers/:farmerId", auth.requireUser, auth.requireRole("ADMIN"), async (request, response, next) => {
    try {
      const before = await repository.getFarmer(request.params.farmerId as string);
      if (!before) throw new HttpError(404, "FARMER_NOT_FOUND", "ไม่พบเกษตรกรที่ค้นหา");
      const input = farmerSchema.partial().parse(request.body);
      if (input.memberCode && input.memberCode.toLowerCase() !== before.memberCode.toLowerCase()) {
        if (await repository.getFarmerByMemberCode(input.memberCode)) throw new HttpError(409, "MEMBER_CODE_EXISTS", "รหัสสมาชิกนี้ถูกใช้งานแล้ว");
      }
      const farmer = { ...before, ...defined(input), memberCode:input.memberCode ?? before.memberCode, displayName:input.displayName ?? before.displayName, status:input.status ?? before.status } as Farmer;
      await repository.saveFarmer(farmer);
      await repository.saveAuditEvent({ auditId:createId("AUD"), entityType:"FARMER", entityId:farmer.farmerId, actorId:request.user!.userId, action:"UPDATE", before, after:farmer, occurredAt:new Date().toISOString() });
      response.json({ farmer });
    } catch (error) { next(error); }
  });

  app.post("/api/plots", auth.requireUser, auth.requireRole("ADMIN"), async (request, response, next) => {
    try {
      const input = plotSchema.parse(request.body);
      if (!await repository.getFarmer(input.farmerId)) throw new HttpError(404, "FARMER_NOT_FOUND", "ไม่พบเกษตรกรเจ้าของแปลง");
      const plot = { plotId:createId("PLOT"), ...defined(input) } as Plot;
      await repository.savePlot(plot);
      await repository.saveAuditEvent({ auditId:createId("AUD"), entityType:"PLOT", entityId:plot.plotId, actorId:request.user!.userId, action:"CREATE", after:plot, occurredAt:new Date().toISOString() });
      response.status(201).json({ plot });
    } catch (error) { next(error); }
  });

  app.patch("/api/plots/:plotId", auth.requireUser, auth.requireRole("ADMIN"), async (request, response, next) => {
    try {
      const before = await repository.getPlot(request.params.plotId as string);
      if (!before) throw new HttpError(404, "PLOT_NOT_FOUND", "ไม่พบแปลงที่ค้นหา");
      const input = plotSchema.partial().parse(request.body);
      if (input.farmerId && !await repository.getFarmer(input.farmerId)) throw new HttpError(404, "FARMER_NOT_FOUND", "ไม่พบเกษตรกรเจ้าของแปลง");
      const plot = { ...before, ...defined(input), farmerId:input.farmerId ?? before.farmerId, name:input.name ?? before.name, crop:input.crop ?? before.crop, status:input.status ?? before.status } as Plot;
      await repository.savePlot(plot);
      await repository.saveAuditEvent({ auditId:createId("AUD"), entityType:"PLOT", entityId:plot.plotId, actorId:request.user!.userId, action:"UPDATE", before, after:plot, occurredAt:new Date().toISOString() });
      response.json({ plot });
    } catch (error) { next(error); }
  });

  app.get("/api/dashboard", auth.requireUser, async (_request, response, next) => {
    try {
      const [summary, activities, lots] = await Promise.all([
        repository.getDashboardSummary(),
        repository.listActivities(),
        repository.listLots()
      ]);
      response.json({ summary, activities: activities.slice(0, 8), lots: lots.slice(0, 5), dataSource: config.DATA_DRIVER });
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
        let notificationSent = false;
        if (input.decision === "REQUEST_INFO") {
          const farmer = await repository.getFarmer(activity.farmerId);
          if (farmer?.lineUserId) {
            try { await pushLineText(config, farmer.lineUserId, `ขอข้อมูลเพิ่มสำหรับรายการ ${activity.activityId}\nรายละเอียด: ${input.reason}\nส่งเสียงตอบได้เลย ระบบจะเติมข้อมูลในรายการเดิมให้อัตโนมัติ ไม่สร้างรายการใหม่`); notificationSent = true; }
            catch (error) { console.error(JSON.stringify({ level:"error", code:"LINE_PUSH_FAILED", activityId:activity.activityId, message:error instanceof Error ? error.message : String(error) })); }
          }
        }
        response.json({ activity, notificationSent });
      } catch (error) {
        next(error);
      }
    }
  );

  app.patch("/api/activities/:activityId", auth.requireUser, auth.requireRole("REVIEWER", "ADMIN"), async (request, response, next) => {
    try {
      const input = activityCorrectionSchema.parse(request.body);
      const before = await repository.getActivity(request.params.activityId as string);
      if (!before) throw new HttpError(404, "ACTIVITY_NOT_FOUND", "ไม่พบกิจกรรมที่ต้องการแก้ไข");
      const plot = await repository.getPlot(input.plotId);
      if (!plot || plot.farmerId !== before.farmerId) throw new HttpError(409, "PLOT_NOT_OWNED", "แปลงนี้ไม่ได้อยู่ในทะเบียนของเกษตรกรรายนี้");
      const extracted = { plotId:input.plotId, crop:input.crop, activityType:input.activityType, ...(input.inputsUsed ? { inputsUsed:input.inputsUsed } : {}), ...(input.harvestAmount !== undefined ? { harvestAmount:input.harvestAmount } : {}), ...(input.harvestUnit ? { harvestUnit:input.harvestUnit } : {}), isHarvesting:input.harvestAmount !== undefined, fieldConfidence:{ plotId:1, crop:1, activityType:1, inputsUsed:1 } };
      const rule = evaluateIcsRisk(extracted, `${before.transcript ?? ""} ${input.inputsUsed ?? ""}`);
      if (input.crop.trim().toLocaleLowerCase("th-TH") !== plot.crop.trim().toLocaleLowerCase("th-TH")) { rule.riskStatus="NEEDS_REVIEW"; rule.reasons.push(`พืชที่แก้ไข “${input.crop}” ไม่ตรงกับทะเบียนแปลง “${plot.crop}”`); }
      const { inputsUsed: _oldInputs, harvestAmount: _oldAmount, harvestUnit: _oldUnit, ...baseActivity } = before;
      const activity = { ...baseActivity, occurredAt:input.occurredAt, plotId:input.plotId, plotName:plot.name, crop:input.crop, activityType:input.activityType, ...(input.inputsUsed ? { inputsUsed:input.inputsUsed } : {}), ...(input.harvestAmount !== undefined ? { harvestAmount:input.harvestAmount } : {}), ...(input.harvestUnit ? { harvestUnit:input.harvestUnit } : {}), riskStatus:rule.riskStatus, processingStatus:"NEEDS_REVIEW" as const, confidence:1, flagReasons:rule.reasons, matchedTerms:rule.matchedTerms, updatedAt:new Date().toISOString() };
      await repository.saveActivity(activity);
      await repository.saveAuditEvent({ auditId:createId("AUD"), entityType:"ACTIVITY", entityId:activity.activityId, actorId:request.user!.userId, action:"MANUAL_CORRECTION", reason:input.reason, before, after:activity, occurredAt:activity.updatedAt });
      response.json({ activity });
    } catch (error) { next(error); }
  });

  app.post("/api/activities/:activityId/retry", auth.requireUser, auth.requireRole("REVIEWER", "ADMIN"), async (request, response, next) => {
    try { response.json({ activity:await lineService.retryActivity(request.params.activityId as string, request.user!.userId) }); }
    catch (error) { next(error); }
  });

  app.get("/api/lots", auth.requireUser, async (_request, response, next) => {
    try {
      response.json({ lots: await repository.listLots() });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/lots", auth.requireUser, auth.requireRole("WAREHOUSE", "ADMIN"), async (request, response, next) => {
    try {
      const input = lotCreateSchema.parse(request.body);
      const activity = await repository.getActivity(input.activityId);
      if (!activity) throw new HttpError(404, "ACTIVITY_NOT_FOUND", "ไม่พบกิจกรรมเก็บเกี่ยว");
      if (activity.createdLotId) throw new HttpError(409, "LOT_EXISTS", "กิจกรรมนี้สร้างล็อตแล้ว");
      if (activity.riskStatus !== "APPROVED") throw new HttpError(409, "ACTIVITY_NOT_APPROVED", "ต้องอนุมัติกิจกรรมก่อนสร้างล็อต");
      if (!activity.crop || !activity.plotName || !activity.harvestAmount || !activity.harvestUnit) throw new HttpError(409, "HARVEST_DATA_INCOMPLETE", "ข้อมูลพืช แปลง ปริมาณ หรือหน่วยยังไม่ครบ");
      const now = new Date().toISOString();
      const lot = { lotId:createId("LOT"), activityId:activity.activityId, farmerId:activity.farmerId, farmerName:activity.farmerName, plotName:activity.plotName, crop:activity.crop, quantity:activity.harvestAmount, unit:activity.harvestUnit, harvestDate:activity.occurredAt.slice(0,10), inventoryStatus:"IN_STOCK" as const, traceToken:createTraceToken(), createdAt:now, updatedAt:now };
      await repository.saveLot(lot);
      const linkedActivity = { ...activity, createdLotId:lot.lotId, updatedAt:now };
      await repository.saveActivity(linkedActivity);
      await repository.saveAuditEvent({ auditId:createId("AUD"), entityType:"LOT", entityId:lot.lotId, actorId:request.user!.userId, action:"CREATE_FROM_ACTIVITY", after:lot, occurredAt:now });
      await repository.saveAuditEvent({ auditId:createId("AUD"), entityType:"ACTIVITY", entityId:activity.activityId, actorId:request.user!.userId, action:"LINK_LOT", before:activity, after:linkedActivity, occurredAt:now });
      response.status(201).json({ lot });
    } catch (error) { next(error); }
  });

  app.patch("/api/lots/:lotId/status", auth.requireUser, auth.requireRole("WAREHOUSE", "ADMIN"), async (request, response, next) => {
    try {
      const input = lotStatusSchema.parse(request.body);
      const before = await repository.getLot(request.params.lotId as string);
      if (!before) throw new HttpError(404, "LOT_NOT_FOUND", "ไม่พบล็อตที่ค้นหา");
      const allowed: Record<string, string[]> = { IN_STOCK:["RESERVED", "SHIPPED", "VOID", "RECALLED"], RESERVED:["IN_STOCK", "SHIPPED", "VOID", "RECALLED"], SHIPPED:["RECALLED"], DRAFT:["IN_STOCK", "VOID"], RECALLED:[], VOID:[] };
      if (!allowed[before.inventoryStatus]?.includes(input.status)) throw new HttpError(409, "INVALID_LOT_TRANSITION", "ไม่สามารถเปลี่ยนสถานะล็อตตามลำดับนี้ได้");
      const lot = { ...before, inventoryStatus:input.status, updatedAt:new Date().toISOString() };
      await repository.saveLot(lot);
      await repository.saveAuditEvent({ auditId:createId("AUD"), entityType:"LOT", entityId:lot.lotId, actorId:request.user!.userId, action:`STATUS_${input.status}`, reason:input.reason, before, after:lot, occurredAt:lot.updatedAt });
      response.json({ lot });
    } catch (error) { next(error); }
  });

  app.get("/api/reports/activities.csv", auth.requireUser, auth.requireRole("ADMIN", "AUDITOR"), async (_request, response, next) => {
    try {
      const rows = await repository.listActivities();
      const quote = (value:unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
      const csv = [["activity_id","received_at","farmer","plot","crop","activity_type","risk_status","processing_status"], ...rows.map((x) => [x.activityId,x.receivedAt,x.farmerName,x.plotName,x.crop,x.activityType,x.riskStatus,x.processingStatus])].map((row) => row.map(quote).join(",")).join("\r\n");
      await repository.saveAuditEvent({ auditId:createId("AUD"), entityType:"REPORT", entityId:`activities-${new Date().toISOString().slice(0,10)}`, actorId:_request.user!.userId, action:"EXPORT_CSV", occurredAt:new Date().toISOString() });
      response.setHeader("Content-Type", "text/csv; charset=utf-8");
      response.setHeader("Content-Disposition", `attachment; filename="ics-activities-${new Date().toISOString().slice(0,10)}.csv"`);
      response.send(`\uFEFF${csv}`);
    } catch (error) { next(error); }
  });

  app.get("/api/lots/:lotId/qr.png", auth.requireUser, async (request, response, next) => {
    try {
      const lot = await repository.getLot(request.params.lotId as string);
      if (!lot) throw new HttpError(404, "LOT_NOT_FOUND", "ไม่พบล็อตที่ค้นหา");
      const traceUrl = new URL(`/trace/${encodeURIComponent(lot.traceToken)}`, config.APP_BASE_URL).toString();
      const png = await QRCode.toBuffer(traceUrl, { type:"png", width:512, margin:2, errorCorrectionLevel:"M", color:{ dark:"#17372a", light:"#fffdf7" } });
      response.setHeader("Content-Type", "image/png");
      response.setHeader("Content-Disposition", `attachment; filename="${lot.lotId}-qr.png"`);
      response.send(png);
    } catch (error) { next(error); }
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

function defined<T extends Record<string, unknown>>(value: T) { return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>; }
