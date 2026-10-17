import { google, sheets_v4 } from "googleapis";
import type { AppConfig } from "../config.js";
import type { Activity, AuditEvent, Farmer, Lot, Plot, Review } from "../domain/types.js";
import type { ActivityFilters, Repository } from "./repository.js";

const TABLES = {
  Farmers: ["farmer_id", "member_code", "display_name", "line_user_id", "status"],
  Plots: ["plot_id", "farmer_id", "name", "crop", "status"],
  Activities: ["activity_id", "source_event_id", "farmer_id", "farmer_name", "plot_id", "plot_name", "crop", "occurred_at", "received_at", "transcript", "audio_content_id", "activity_type", "inputs_used", "harvest_amount", "harvest_unit", "processing_status", "risk_status", "confidence", "flag_reasons", "matched_terms", "created_lot_id", "updated_at"],
  Reviews: ["review_id", "activity_id", "reviewer_id", "decision", "reason", "reviewed_at"],
  Lots: ["lot_id", "activity_id", "farmer_id", "farmer_name", "plot_name", "crop", "quantity", "unit", "harvest_date", "inventory_status", "trace_token", "created_at", "updated_at"],
  AuditEvents: ["audit_id", "entity_type", "entity_id", "actor_id", "action", "reason", "before", "after", "occurred_at"]
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
      if (!(result.data.values?.[0]?.length)) {
        await this.sheets.spreadsheets.values.update({ spreadsheetId: this.spreadsheetId, range: `'${title}'!A1`, valueInputOption: "RAW", requestBody: { values: [[...headers]] } });
      }
    }
  }

  private async rows(table: TableName): Promise<Row[]> {
    await this.ensureSchema();
    const headers = TABLES[table];
    const result = await this.sheets.spreadsheets.values.get({ spreadsheetId: this.spreadsheetId, range: `'${table}'!A2:${columnName(headers.length)}` });
    return (result.data.values ?? []).map((values) => Object.fromEntries(headers.map((header, index) => [header, String(values[index] ?? "")])));
  }

  private async upsert(table: TableName, key: string, value: string, data: Row) {
    await this.ensureSchema();
    const headers = TABLES[table];
    const existing = await this.rows(table);
    const index = existing.findIndex((row) => row[key] === value);
    const values = headers.map((header) => data[header] ?? "");
    if (index < 0) {
      await this.sheets.spreadsheets.values.append({ spreadsheetId: this.spreadsheetId, range: `'${table}'!A:${columnName(headers.length)}`, valueInputOption: "RAW", insertDataOption: "INSERT_ROWS", requestBody: { values: [values] } });
    } else {
      const row = index + 2;
      await this.sheets.spreadsheets.values.update({ spreadsheetId: this.spreadsheetId, range: `'${table}'!A${row}:${columnName(headers.length)}${row}`, valueInputOption: "RAW", requestBody: { values: [values] } });
    }
  }

  private async append(table: TableName, data: Row) {
    await this.ensureSchema();
    const headers = TABLES[table];
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
  async findActivityBySourceEvent(id: string) { return (await this.listActivities()).find((x) => x.sourceEventId === id); }
  async saveActivity(x: Activity) { await this.upsert("Activities", "activity_id", x.activityId, activityToRow(x)); }
  async listReviews(id: string) { return (await this.rows("Reviews")).map(reviewFromRow).filter((x) => x.activityId === id); }
  async saveReview(x: Review) { await this.append("Reviews", mapKeys(x)); }
  async listLots() { return (await this.rows("Lots")).map(lotFromRow); }
  async getLot(id: string) { return (await this.listLots()).find((x) => x.lotId === id); }
  async getLotByTraceToken(token: string) { return (await this.listLots()).find((x) => x.traceToken === token); }
  async saveLot(x: Lot) { await this.upsert("Lots", "lot_id", x.lotId, mapKeys(x)); }
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
}

function columnName(count: number) { let value = count; let result = ""; while (value) { value--; result = String.fromCharCode(65 + value % 26) + result; value = Math.floor(value / 26); } return result; }
function mapKeys(value: object): Row { return Object.fromEntries(Object.entries(value).map(([key, item]) => [key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), enc(item)])); }
function farmerFromRow(r: Row): Farmer { return { farmerId: r.farmer_id!, memberCode: r.member_code!, displayName: r.display_name!, ...(r.line_user_id ? { lineUserId: r.line_user_id } : {}), status: r.status === "INACTIVE" ? "INACTIVE" : "ACTIVE" }; }
function plotFromRow(r: Row): Plot { return { plotId: r.plot_id!, farmerId: r.farmer_id!, name: r.name!, crop: r.crop!, status: r.status === "INACTIVE" ? "INACTIVE" : "ACTIVE" }; }
function activityFromRow(r: Row): Activity { return { activityId:r.activity_id!,sourceEventId:r.source_event_id!,farmerId:r.farmer_id!,farmerName:r.farmer_name!,...(r.plot_id?{plotId:r.plot_id}:{}),...(r.plot_name?{plotName:r.plot_name}:{}),...(r.crop?{crop:r.crop}:{}),occurredAt:r.occurred_at!,receivedAt:r.received_at!,...(r.transcript?{transcript:r.transcript}:{}),...(r.audio_content_id?{audioContentId:r.audio_content_id}:{}),...(r.activity_type?{activityType:r.activity_type}:{}),...(r.inputs_used?{inputsUsed:r.inputs_used}:{}),...(num(r.harvest_amount!)!==undefined?{harvestAmount:num(r.harvest_amount!)!}:{}),...(r.harvest_unit?{harvestUnit:r.harvest_unit}:{}),processingStatus:r.processing_status as Activity["processingStatus"],riskStatus:r.risk_status as Activity["riskStatus"],confidence:Number(r.confidence||0),flagReasons:json(r.flag_reasons!,[]),matchedTerms:json(r.matched_terms!,[]),...(r.created_lot_id?{createdLotId:r.created_lot_id}:{}),updatedAt:r.updated_at! }; }
function activityToRow(x: Activity) { return mapKeys(x); }
function reviewFromRow(r: Row): Review { return { reviewId:r.review_id!,activityId:r.activity_id!,reviewerId:r.reviewer_id!,decision:r.decision as Review["decision"],reason:r.reason!,reviewedAt:r.reviewed_at! }; }
function lotFromRow(r: Row): Lot { return { lotId:r.lot_id!,activityId:r.activity_id!,farmerId:r.farmer_id!,farmerName:r.farmer_name!,plotName:r.plot_name!,crop:r.crop!,quantity:Number(r.quantity),unit:r.unit!,harvestDate:r.harvest_date!,inventoryStatus:r.inventory_status as Lot["inventoryStatus"],traceToken:r.trace_token!,createdAt:r.created_at!,updatedAt:r.updated_at! }; }
function auditFromRow(r: Row): AuditEvent { return { auditId:r.audit_id!,entityType:r.entity_type as AuditEvent["entityType"],entityId:r.entity_id!,actorId:r.actor_id!,action:r.action!,...(r.reason?{reason:r.reason}:{}),...(r.before?{before:json(r.before,null)}:{}),...(r.after?{after:json(r.after,null)}:{}),occurredAt:r.occurred_at! }; }
