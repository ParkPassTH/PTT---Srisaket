import { createHash } from "node:crypto";
import { z } from "zod";
import { createId } from "../lib/ids.js";
import { HttpError } from "../lib/http-error.js";
import type { Repository } from "../repositories/repository.js";

const record = (fields: z.ZodRawShape) => z.object(fields).passthrough();
const entitySchema = z.object({
  farmers:z.array(record({ farmerId:z.string().min(1), memberCode:z.string().min(1), displayName:z.string().min(1), status:z.enum(["ACTIVE","INACTIVE"]) })),
  plots:z.array(record({ plotId:z.string().min(1), farmerId:z.string().min(1), name:z.string().min(1), crop:z.string().min(1), status:z.enum(["ACTIVE","INACTIVE"]) })),
  activities:z.array(record({ activityId:z.string().min(1), sourceEventId:z.string().min(1), farmerId:z.string().min(1), occurredAt:z.string(), receivedAt:z.string(), processingStatus:z.string(), riskStatus:z.string() })),
  reviews:z.array(record({ reviewId:z.string().min(1), activityId:z.string().min(1), reviewerId:z.string().min(1), decision:z.string(), reason:z.string(), reviewedAt:z.string() })),
  lots:z.array(record({ lotId:z.string().min(1), activityId:z.string().min(1), farmerId:z.string().min(1), traceToken:z.string().min(1), inventoryStatus:z.string() })),
  stockMovements:z.array(record({ movementId:z.string().min(1), lotId:z.string().min(1), movementType:z.string(), quantity:z.number(), unit:z.string().min(1), reference:z.string().min(1) })).default([]),
  storageLocations:z.array(record({ locationId:z.string().min(1), name:z.string().min(1), status:z.enum(["ACTIVE","INACTIVE"]) })).default([]),
  importBatches:z.array(record({batchId:z.string().min(1),checksum:z.string().min(1),status:z.string()})).default([]),
  importRows:z.array(record({importRowId:z.string().min(1),batchId:z.string().min(1),rowStatus:z.string()})).default([]),
  importMappingTemplates:z.array(record({templateId:z.string().min(1),name:z.string().min(1),sourceName:z.string().min(1),entityType:z.literal("FARMER"),headers:z.array(z.string()),mapping:z.record(z.string())})).default([]),
  auditEvents:z.array(record({ auditId:z.string().min(1), entityType:z.string(), entityId:z.string().min(1), actorId:z.string().min(1), action:z.string(), occurredAt:z.string() })),
  outbox:z.array(record({ messageId:z.string().min(1), channel:z.literal("LINE"), recipient:z.string().min(1), body:z.string(), status:z.string(), attempts:z.number(), maxAttempts:z.number() }))
});
const backupSchema = z.object({ schemaVersion:z.literal(1), generatedAt:z.string().datetime(), entities:entitySchema, checksum:z.string().regex(/^[a-f0-9]{64}$/) });
export type BackupArchive = z.infer<typeof backupSchema>;

export class BackupService {
  constructor(private readonly repository: Repository) {}

  async export() {
    const [farmers,plots,activities,reviews,lots,stockMovements,storageLocations,importBatches,importMappingTemplates,auditEvents,outbox] = await Promise.all([
      this.repository.listFarmers(), this.repository.listPlots(), this.repository.listActivities(), this.repository.listAllReviews(),
      this.repository.listLots(), this.repository.listStockMovements(), this.repository.listStorageLocations(), this.repository.listImportBatches(), this.repository.listImportMappingTemplates(), this.repository.listAllAuditEvents(), this.repository.listOutbox()
    ]);
    const importRows=(await Promise.all(importBatches.map((x)=>this.repository.listImportRows(x.batchId)))).flat();
    const payload = { schemaVersion:1 as const, generatedAt:new Date().toISOString(), entities:{ farmers,plots,activities,reviews,lots,stockMovements,storageLocations,importBatches,importRows,importMappingTemplates,auditEvents,outbox } };
    return { ...payload, checksum:checksum(payload) };
  }

  validate(input: unknown) {
    const raw = z.object({ checksum:z.string().regex(/^[a-f0-9]{64}$/) }).passthrough().parse(input);
    const { checksum:expected, ...payload } = raw;
    const actual = checksum(payload);
    if (actual !== expected) throw new HttpError(400, "BACKUP_CHECKSUM_INVALID", "Backup checksum ไม่ตรง ไฟล์อาจถูกแก้ไขหรือเสียหาย");
    const archive = backupSchema.parse(input);
    return { archive, counts:Object.fromEntries(Object.entries(archive.entities).map(([key,value]) => [key,value.length])) };
  }

  async merge(input: unknown, actorId: string, reason: string) {
    const { archive, counts } = this.validate(input);
    const before = await this.export();
    const existingReviews = new Set((await this.repository.listAllReviews()).map((item) => item.reviewId));
    const existingAudits = new Set((await this.repository.listAllAuditEvents()).map((item) => item.auditId));
    const existingMovements = new Set((await this.repository.listStockMovements()).map((item) => item.movementId));
    for (const item of archive.entities.farmers) await this.repository.saveFarmer(item as never);
    for (const item of archive.entities.plots) await this.repository.savePlot(item as never);
    for (const item of archive.entities.activities) await this.repository.saveActivity(item as never);
    for (const item of archive.entities.reviews) if (!existingReviews.has(String(item.reviewId))) await this.repository.saveReview(item as never);
    for (const item of archive.entities.lots) await this.repository.saveLot(item as never);
    for (const item of archive.entities.stockMovements) if (!existingMovements.has(String(item.movementId))) await this.repository.appendStockMovement(item as never);
    for (const item of archive.entities.storageLocations) await this.repository.saveStorageLocation(item as never);
    for (const item of archive.entities.importBatches) await this.repository.saveImportBatch(item as never);
    for (const item of archive.entities.importRows) await this.repository.saveImportRow(item as never);
    for (const item of archive.entities.importMappingTemplates) await this.repository.saveImportMappingTemplate(item as never);
    for (const item of archive.entities.outbox) await this.repository.saveOutboxMessage(item as never);
    for (const item of archive.entities.auditEvents) if (!existingAudits.has(String(item.auditId))) await this.repository.saveAuditEvent(item as never);
    const completedAt = new Date().toISOString();
    await this.repository.saveAuditEvent({ auditId:createId("AUD"), entityType:"REPORT", entityId:`restore-${completedAt}`, actorId, action:"BACKUP_MERGE_RESTORE", reason, before:{ checksum:before.checksum }, after:{ sourceChecksum:archive.checksum, counts }, occurredAt:completedAt });
    return { counts, sourceChecksum:archive.checksum, completedAt };
  }
}

function checksum(payload: unknown) { return createHash("sha256").update(JSON.stringify(canonical(payload))).digest("hex"); }
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([,item]) => item !== undefined).sort(([left],[right]) => left.localeCompare(right)).map(([key,item]) => [key,canonical(item)]));
  return value;
}
