import { google, sheets_v4 } from "googleapis";
import type { AppConfig } from "../config.js";
import type { Activity, AuditEvent, Farmer, Lot, OutboxMessage, Plot, Review, StorageLocation } from "../domain/types.js";
import type { ActivityFilters, Repository } from "./repository.js";

const TABLES = {
  Farmers: ["farmer_id", "member_code", "display_name", "line_user_id", "status", "address", "phone", "registered_at", "total_area_rai"],
  Plots: ["plot_id", "farmer_id", "name", "crop", "status", "area_rai", "gps_lat", "gps_lng", "certification_status", "conversion_started_at", "conversion_ends_at", "previous_chemical_use", "estimated_yield", "estimated_yield_unit"],
  Activities: ["activity_id", "source_event_id", "source_event_ids", "farmer_id", "farmer_name", "plot_id", "plot_name", "crop", "occurred_at", "received_at", "transcript", "audio_content_id", "activity_type", "inputs_used", "harvest_amount", "harvest_unit", "processing_status", "risk_status", "confidence", "flag_reasons", "matched_terms", "created_lot_id", "revision", "correction_requested_at", "updated_at"],
  Reviews: ["review_id", "activity_id", "reviewer_id", "decision", "reason", "reviewed_at"],
  Lots: ["lot_id", "activity_id", "farmer_id", "farmer_name", "plot_name", "crop", "quantity", "unit", "harvest_date", "inventory_status", "trace_token", "storage_location_id", "storage_location_name", "created_at", "updated_at"],
  StorageLocations: ["location_id", "name", "location_type", "address", "zone", "status", "created_at", "updated_at"],
  AuditEvents: ["audit_id", "entity_type", "entity_id", "actor_id", "action", "reason", "before", "after", "occurred_at"],
  Outbox: ["message_id", "channel", "recipient", "body", "line_message", "related_entity_id", "status", "attempts", "max_attempts", "next_attempt_at", "last_error", "created_at", "updated_at"]
} as const;

type TableName = keyof typeof TABLES;
type Row = Record<string, string>;

const enc = (value: unknown) => value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
const json = <T>(value: string, fallback: T): T => { try { return value ? JSON.parse(value) as T : fallback; } catch { return fallback; } };
const num = (value: string) => value === "" ? undefined : Number(value);

export class GoogleSheetsRepository implements Repository {
  private readonly sheets: sheets_v4.Sheets;
  private initialized?: Promise<void>;

  constructor(private readonly spreadsheetId: string, config: Pick<AppConfig, "GOOGLE_SERVICE_ACCOUNT_EMAIL" | "GOOGLE_PRIVATE_KEY">) {
    const auth = new google.auth.JWT({
      email: config.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
      key: config.GOOGLE_PRIVATE_KEY!.replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"]
    });
    this.sheets = google.sheets({ version: "v4", auth });
  }

  async ensureSchema() {
    if (!this.initialized) this.initialized = this.createMissingTables();
    return this.initialized;
  }

  private async createMissingTables() {
    const metadata = await this.sheets.spreadsheets.get({ spreadsheetId: this.spreadsheetId, fields: "sheets.properties.title" });
    const existing = new Set(metadata.data.sheets?.map((item) => item.properties?.title).filter(Boolean));
    const missing = Object.keys(TABLES).filter((title) => !existing.has(title));
    if (missing.length) {
      await this.sheets.spreadsheets.batchUpdate({ spreadsheetId: this.spreadsheetId, requestBody: { requests: missing.map((title) => ({ addSheet: { properties: { title } } })) } });
    }
    for (const [title, headers] of Object.entries(TABLES)) {
      const result = await this.sheets.spreadsheets.values.get({ spreadsheetId: this.spreadsheetId, range: `'${title}'!1:1` });
      const existingHeaders = (result.data.values?.[0] ?? []).map(String);
      const missingHeaders = headers.filter((header) => !existingHeaders.includes(header));
      if (!existingHeaders.length || missingHeaders.length) {
        await this.sheets.spreadsheets.values.update({ spreadsheetId: this.spreadsheetId, range: `'${title}'!A1`, valueInputOption: "RAW", requestBody: { values: [[...existingHeaders, ...missingHeaders]] } });
      }
    }
  }

  private async tableData(table: TableName): Promise<{ headers: string[]; rows: Row[] }> {
    await this.ensureSchema();
    const result = await this.sheets.spreadsheets.values.get({ spreadsheetId: this.spreadsheetId, range: `'${table}'!A1:ZZ` });
    const values = result.data.values ?? [];
    const headers = (values[0] ?? []).map(String);
    return { headers, rows: values.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, String(row[index] ?? "")]))) };
  }

  private async rows(table: TableName) { return (await this.tableData(table)).rows; }

  private async upsert(table: TableName, key: string, value: string, data: Row) {
    await this.ensureSchema();
    const { headers, rows: existing } = await this.tableData(table);
    const index = existing.findIndex((row) => row[key] === value);
    const values = headers.map((header) => data[header] ?? (index >= 0 ? existing[index]?.[header] : "") ?? "");
    if (index < 0) {
      await this.sheets.spreadsheets.values.append({ spreadsheetId: this.spreadsheetId, range: `'${table}'!A:${columnName(headers.length)}`, valueInputOption: "RAW", insertDataOption: "INSERT_ROWS", requestBody: { values: [values] } });
    } else {
      const row = index + 2;
      await this.sheets.spreadsheets.values.update({ spreadsheetId: this.spreadsheetId, range: `'${table}'!A${row}:${columnName(headers.length)}${row}`, valueInputOption: "RAW", requestBody: { values: [values] } });
    }
  }

  private async append(table: TableName, data: Row) {
    await this.ensureSchema();
    const { headers } = await this.tableData(table);
    await this.sheets.spreadsheets.values.append({ spreadsheetId: this.spreadsheetId, range: `'${table}'!A:${columnName(headers.length)}`, valueInputOption: "RAW", insertDataOption: "INSERT_ROWS", requestBody: { values: [headers.map((header) => data[header] ?? "")] } });
  }

  async getDashboardSummary() {
    const [activities, lots] = await Promise.all([this.listActivities(), this.listLots()]);
    const today = new Date().toISOString().slice(0, 10);
    return { pendingReview: activities.filter((x) => x.processingStatus === "NEEDS_REVIEW").length, highRisk: activities.filter((x) => x.riskStatus === "FLAGGED_HIGH").length, recordedToday: activities.filter((x) => x.receivedAt.startsWith(today)).length, lotsInStock: lots.filter((x) => x.inventoryStatus === "IN_STOCK").length, queueHealth: "HEALTHY" as const };
  }

  async listActivities(filters: ActivityFilters = {}) {
    const query = filters.query?.toLocaleLowerCase("th-TH");
    return (await this.rows("Activities")).map(activityFromRow)
      .filter((x) => !filters.status || x.processingStatus === filters.status)
      .filter((x) => !filters.risk || x.riskStatus === filters.risk)
      .filter((x) => !query || [x.activityId, x.farmerName, x.plotName, x.crop, x.activityType].some((v) => v?.toLocaleLowerCase("th-TH").includes(query)))
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  }
  async getActivity(id: string) { return (await this.listActivities()).find((x) => x.activityId === id); }
  async findActivityBySourceEvent(id: string) { return (await this.listActivities()).find((x) => x.sourceEventId === id || x.sourceEventIds?.includes(id)); }
  async saveActivity(x: Activity) { await this.upsert("Activities", "activity_id", x.activityId, activityToRow(x)); }
  async listReviews(id: string) { return (await this.rows("Reviews")).map(reviewFromRow).filter((x) => x.activityId === id); }
  async listAllReviews() { return (await this.rows("Reviews")).map(reviewFromRow); }
  async saveReview(x: Review) { await this.append("Reviews", mapKeys(x)); }
  async listLots() { return (await this.rows("Lots")).map(lotFromRow); }
  async getLot(id: string) { return (await this.listLots()).find((x) => x.lotId === id); }
  async getLotByTraceToken(token: string) { return (await this.listLots()).find((x) => x.traceToken === token); }
  async saveLot(x: Lot) { await this.upsert("Lots", "lot_id", x.lotId, mapKeys(x)); }
  async listStorageLocations() { return (await this.rows("StorageLocations")).map(storageLocationFromRow).sort((a,b) => a.name.localeCompare(b.name,"th")); }
  async getStorageLocation(id: string) { return (await this.listStorageLocations()).find((x) => x.locationId === id); }
  async saveStorageLocation(x: StorageLocation) { await this.upsert("StorageLocations", "location_id", x.locationId, mapKeys(x)); }
  async getFarmerByLineUserId(id: string) { return (await this.rows("Farmers")).map(farmerFromRow).find((x) => x.lineUserId === id && x.status === "ACTIVE"); }
  async getFarmerByMemberCode(code: string) { return (await this.rows("Farmers")).map(farmerFromRow).find((x) => x.memberCode.toLowerCase() === code.toLowerCase() && x.status === "ACTIVE"); }
  async listFarmers() { return (await this.rows("Farmers")).map(farmerFromRow).sort((a, b) => a.memberCode.localeCompare(b.memberCode)); }
  async getFarmer(id: string) { return (await this.rows("Farmers")).map(farmerFromRow).find((x) => x.farmerId === id); }
  async saveFarmer(x: Farmer) { await this.upsert("Farmers", "farmer_id", x.farmerId, mapKeys(x)); }
  async listPlots(farmerId?: string) { return (await this.rows("Plots")).map(plotFromRow).filter((x) => !farmerId || x.farmerId === farmerId); }
  async getPlot(id: string) { return (await this.rows("Plots")).map(plotFromRow).find((x) => x.plotId === id); }
  async savePlot(x: Plot) { await this.upsert("Plots", "plot_id", x.plotId, mapKeys(x)); }
  async saveAuditEvent(x: AuditEvent) { await this.append("AuditEvents", mapKeys(x)); }
  async listAuditEvents(id: string) { return (await this.rows("AuditEvents")).map(auditFromRow).filter((x) => x.entityId === id); }
  async listAllAuditEvents() { return (await this.rows("AuditEvents")).map(auditFromRow); }
  async listOutbox() { return (await this.rows("Outbox")).map(outboxFromRow).sort((a,b) => b.createdAt.localeCompare(a.createdAt)); }
  async getOutboxMessage(id: string) { return (await this.listOutbox()).find((x) => x.messageId === id); }
  async saveOutboxMessage(x: OutboxMessage) { await this.upsert("Outbox", "message_id", x.messageId, mapKeys(x)); }
}

function columnName(count: number) { let value = count; let result = ""; while (value) { value--; result = String.fromCharCode(65 + value % 26) + result; value = Math.floor(value / 26); } return result; }
function mapKeys(value: object): Row { return Object.fromEntries(Object.entries(value).map(([key, item]) => [key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), enc(item)])); }
function farmerFromRow(r: Row): Farmer {
  const legacyLineValue = r.line_user_id ?? "";
  const memberCode = r.member_code || (!legacyLineValue.startsWith("U") ? legacyLineValue : "");
  const lineUserId = legacyLineValue.startsWith("U") ? legacyLineValue : (r.plots?.startsWith("U") ? r.plots : "");
  return { farmerId:r.farmer_id!, memberCode, displayName:r.display_name || r.full_name || "ไม่ระบุชื่อ", ...(lineUserId ? { lineUserId } : {}), status:r.status === "INACTIVE" ? "INACTIVE" : "ACTIVE", ...(r.address?{address:r.address}:{}), ...(r.phone?{phone:r.phone}:{}), ...(r.registered_at?{registeredAt:r.registered_at}:{}), ...(num(r.total_area_rai ?? "")!==undefined?{totalAreaRai:num(r.total_area_rai ?? "")!}:{}) };
}
function plotFromRow(r: Row): Plot { return { plotId:r.plot_id!, farmerId:r.farmer_id!, name:r.name!, crop:r.crop!, status:r.status === "INACTIVE" ? "INACTIVE" : "ACTIVE", ...(num(r.area_rai ?? "")!==undefined?{areaRai:num(r.area_rai ?? "")!}:{}), ...(num(r.gps_lat ?? "")!==undefined?{gpsLat:num(r.gps_lat ?? "")!}:{}), ...(num(r.gps_lng ?? "")!==undefined?{gpsLng:num(r.gps_lng ?? "")!}:{}), ...(r.certification_status?{certificationStatus:r.certification_status as NonNullable<Plot["certificationStatus"]>}:{}), ...(r.conversion_started_at?{conversionStartedAt:r.conversion_started_at}:{}), ...(r.conversion_ends_at?{conversionEndsAt:r.conversion_ends_at}:{}), ...(r.previous_chemical_use?{previousChemicalUse:r.previous_chemical_use}:{}), ...(num(r.estimated_yield ?? "")!==undefined?{estimatedYield:num(r.estimated_yield ?? "")!}:{}), ...(r.estimated_yield_unit?{estimatedYieldUnit:r.estimated_yield_unit}:{}) }; }
function activityFromRow(r: Row): Activity { return { activityId:r.activity_id!,sourceEventId:r.source_event_id!,...(r.source_event_ids?{sourceEventIds:json(r.source_event_ids,[])}:{}),farmerId:r.farmer_id!,farmerName:r.farmer_name!,...(r.plot_id?{plotId:r.plot_id}:{}),...(r.plot_name?{plotName:r.plot_name}:{}),...(r.crop?{crop:r.crop}:{}),occurredAt:r.occurred_at!,receivedAt:r.received_at!,...(r.transcript?{transcript:r.transcript}:{}),...(r.audio_content_id?{audioContentId:r.audio_content_id}:{}),...(r.activity_type?{activityType:r.activity_type}:{}),...(r.inputs_used?{inputsUsed:r.inputs_used}:{}),...(num(r.harvest_amount!)!==undefined?{harvestAmount:num(r.harvest_amount!)!}:{}),...(r.harvest_unit?{harvestUnit:r.harvest_unit}:{}),processingStatus:r.processing_status as Activity["processingStatus"],riskStatus:r.risk_status as Activity["riskStatus"],confidence:Number(r.confidence||0),flagReasons:json(r.flag_reasons!,[]),matchedTerms:json(r.matched_terms!,[]),...(r.created_lot_id?{createdLotId:r.created_lot_id}:{}),revision:Number(r.revision||1),...(r.correction_requested_at?{correctionRequestedAt:r.correction_requested_at}:{}),updatedAt:r.updated_at! }; }
function activityToRow(x: Activity) { return mapKeys(x); }
function reviewFromRow(r: Row): Review { return { reviewId:r.review_id!,activityId:r.activity_id!,reviewerId:r.reviewer_id!,decision:r.decision as Review["decision"],reason:r.reason!,reviewedAt:r.reviewed_at! }; }
function lotFromRow(r: Row): Lot { return { lotId:r.lot_id!,activityId:r.activity_id!,farmerId:r.farmer_id!,farmerName:r.farmer_name!,plotName:r.plot_name!,crop:r.crop!,quantity:Number(r.quantity),unit:r.unit!,harvestDate:r.harvest_date!,inventoryStatus:r.inventory_status as Lot["inventoryStatus"],traceToken:r.trace_token!,...(r.storage_location_id?{storageLocationId:r.storage_location_id}:{}),...(r.storage_location_name?{storageLocationName:r.storage_location_name}:{}),createdAt:r.created_at!,updatedAt:r.updated_at! }; }
function storageLocationFromRow(r: Row): StorageLocation { return { locationId:r.location_id!,name:r.name!,...(r.location_type?{locationType:r.location_type}:{}),...(r.address?{address:r.address}:{}),...(r.zone?{zone:r.zone}:{}),status:r.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",createdAt:r.created_at!,updatedAt:r.updated_at! }; }
function auditFromRow(r: Row): AuditEvent { return { auditId:r.audit_id!,entityType:r.entity_type as AuditEvent["entityType"],entityId:r.entity_id!,actorId:r.actor_id!,action:r.action!,...(r.reason?{reason:r.reason}:{}),...(r.before?{before:json(r.before,null)}:{}),...(r.after?{after:json(r.after,null)}:{}),occurredAt:r.occurred_at! }; }
function outboxFromRow(r: Row): OutboxMessage { return { messageId:r.message_id!, channel:"LINE", recipient:r.recipient!, body:r.body!, ...(r.line_message?{lineMessage:json<Record<string,unknown>>(r.line_message,{})}:{}), ...(r.related_entity_id?{relatedEntityId:r.related_entity_id}:{}), status:r.status as OutboxMessage["status"], attempts:Number(r.attempts||0), maxAttempts:Number(r.max_attempts||5), nextAttemptAt:r.next_attempt_at!, ...(r.last_error?{lastError:r.last_error}:{}), createdAt:r.created_at!, updatedAt:r.updated_at! }; }
