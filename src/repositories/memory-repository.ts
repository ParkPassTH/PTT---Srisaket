import type { Activity, AuditEvent, Farmer, ImportBatch, ImportRow, Lot, OutboxMessage, Plot, Review, StorageLocation } from "../domain/types.js";
import type { ActivityFilters, Repository } from "./repository.js";

/** Empty, process-local repository for tests and local development only. */
export class MemoryRepository implements Repository {
  private activities = new Map<string, Activity>();
  private lots = new Map<string, Lot>();
  private farmers = new Map<string, Farmer>();
  private plots = new Map<string, Plot>();
  private reviews: Review[] = [];
  private auditEvents: AuditEvent[] = [];
  private outbox = new Map<string, OutboxMessage>();
  private storageLocations = new Map<string, StorageLocation>();
  private importBatches = new Map<string, ImportBatch>();
  private importRows = new Map<string, ImportRow>();

  async getDashboardSummary() {
    const activities = [...this.activities.values()];
    const today = new Date().toISOString().slice(0, 10);
    return {
      pendingReview: activities.filter((item) => item.processingStatus === "NEEDS_REVIEW").length,
      highRisk: activities.filter((item) => item.riskStatus === "FLAGGED_HIGH").length,
      recordedToday: activities.filter((item) => item.receivedAt.startsWith(today)).length,
      lotsInStock: [...this.lots.values()].filter((item) => item.inventoryStatus === "IN_STOCK").length,
      queueHealth: "HEALTHY" as const
    };
  }

  async listActivities(filters: ActivityFilters = {}) {
    const query = filters.query?.toLocaleLowerCase("th-TH");
    return [...this.activities.values()]
      .filter((item) => !filters.status || item.processingStatus === filters.status)
      .filter((item) => !filters.risk || item.riskStatus === filters.risk)
      .filter((item) => !query || [item.activityId, item.farmerName, item.plotName, item.crop, item.activityType].some((value) => value?.toLocaleLowerCase("th-TH").includes(query)))
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
      .map((item) => structuredClone(item));
  }

  async getActivity(id: string) { const item = this.activities.get(id); return item ? structuredClone(item) : undefined; }
  async findActivityBySourceEvent(id: string) { const item = [...this.activities.values()].find((value) => value.sourceEventId === id || value.sourceEventIds?.includes(id)); return item ? structuredClone(item) : undefined; }
  async saveActivity(item: Activity) { this.activities.set(item.activityId, structuredClone(item)); }
  async listReviews(id: string) { return this.reviews.filter((item) => item.activityId === id).map((item) => structuredClone(item)); }
  async listAllReviews() { return this.reviews.map((item) => structuredClone(item)); }
  async saveReview(item: Review) { this.reviews.push(structuredClone(item)); }
  async listLots() { return [...this.lots.values()].map((item) => structuredClone(item)); }
  async getLot(id: string) { const item = this.lots.get(id); return item ? structuredClone(item) : undefined; }
  async getLotByTraceToken(token: string) { const item = [...this.lots.values()].find((value) => value.traceToken === token); return item ? structuredClone(item) : undefined; }
  async saveLot(item: Lot) { this.lots.set(item.lotId, structuredClone(item)); }
  async listStorageLocations() { return [...this.storageLocations.values()].sort((a,b) => a.name.localeCompare(b.name,"th")).map((item) => structuredClone(item)); }
  async getStorageLocation(id: string) { const item=this.storageLocations.get(id); return item ? structuredClone(item) : undefined; }
  async saveStorageLocation(item: StorageLocation) { this.storageLocations.set(item.locationId, structuredClone(item)); }
  async listImportBatches(){ return [...this.importBatches.values()].map((x)=>structuredClone(x)); }
  async getImportBatch(id:string){ const x=this.importBatches.get(id); return x?structuredClone(x):undefined; }
  async getImportBatchByChecksum(checksum:string,entityType:ImportBatch["entityType"]){ return (await this.listImportBatches()).find((x)=>x.checksum===checksum&&x.entityType===entityType&&x.status!=="VOID"); }
  async saveImportBatch(x:ImportBatch){ this.importBatches.set(x.batchId,structuredClone(x)); }
  async listImportRows(batchId:string){ return [...this.importRows.values()].filter((x)=>x.batchId===batchId).map((x)=>structuredClone(x)); }
  async saveImportRow(x:ImportRow){ this.importRows.set(x.importRowId,structuredClone(x)); }
  async getFarmerByLineUserId(id: string) { const item = [...this.farmers.values()].find((value) => value.lineUserId === id); return item ? structuredClone(item) : undefined; }
  async getFarmerByMemberCode(code: string) { const item = [...this.farmers.values()].find((value) => value.memberCode.toLowerCase() === code.toLowerCase()); return item ? structuredClone(item) : undefined; }
  async listFarmers() { return [...this.farmers.values()].sort((a, b) => a.memberCode.localeCompare(b.memberCode)).map((item) => structuredClone(item)); }
  async getFarmer(id: string) { const item = this.farmers.get(id); return item ? structuredClone(item) : undefined; }
  async saveFarmer(item: Farmer) { this.farmers.set(item.farmerId, structuredClone(item)); }
  async listPlots(farmerId?: string) { return [...this.plots.values()].filter((item) => !farmerId || item.farmerId === farmerId).map((item) => structuredClone(item)); }
  async getPlot(id: string) { const item = this.plots.get(id); return item ? structuredClone(item) : undefined; }
  async savePlot(item: Plot) { this.plots.set(item.plotId, structuredClone(item)); }
  async saveAuditEvent(item: AuditEvent) { this.auditEvents.push(structuredClone(item)); }
  async listAuditEvents(id: string) { return this.auditEvents.filter((item) => item.entityId === id).map((item) => structuredClone(item)); }
  async listAllAuditEvents() { return this.auditEvents.map((item) => structuredClone(item)); }
  async listOutbox() { return [...this.outbox.values()].sort((a,b) => b.createdAt.localeCompare(a.createdAt)).map((item) => structuredClone(item)); }
  async getOutboxMessage(id: string) { const item=this.outbox.get(id); return item ? structuredClone(item) : undefined; }
  async saveOutboxMessage(item: OutboxMessage) { this.outbox.set(item.messageId, structuredClone(item)); }
}
