import type { Activity, AuditEvent, Farmer, ImportBatch, ImportRow, Lot, OutboxMessage, Plot, Review, StorageLocation } from "../domain/types.js";

export interface ActivityFilters {
  status?: string;
  risk?: string;
  query?: string;
}

export interface Repository {
  getDashboardSummary(): Promise<{
    pendingReview: number;
    highRisk: number;
    recordedToday: number;
    lotsInStock: number;
    queueHealth: "HEALTHY" | "DEGRADED";
  }>;
  listActivities(filters?: ActivityFilters): Promise<Activity[]>;
  getActivity(activityId: string): Promise<Activity | undefined>;
  findActivityBySourceEvent(sourceEventId: string): Promise<Activity | undefined>;
  saveActivity(activity: Activity): Promise<void>;
  listReviews(activityId: string): Promise<Review[]>;
  listAllReviews(): Promise<Review[]>;
  saveReview(review: Review): Promise<void>;
  listLots(): Promise<Lot[]>;
  getLot(lotId: string): Promise<Lot | undefined>;
  getLotByTraceToken(traceToken: string): Promise<Lot | undefined>;
  saveLot(lot: Lot): Promise<void>;
  listStorageLocations(): Promise<StorageLocation[]>;
  getStorageLocation(locationId: string): Promise<StorageLocation | undefined>;
  saveStorageLocation(location: StorageLocation): Promise<void>;
  listImportBatches(): Promise<ImportBatch[]>;
  getImportBatch(batchId: string): Promise<ImportBatch | undefined>;
  getImportBatchByChecksum(checksum: string, entityType: ImportBatch["entityType"]): Promise<ImportBatch | undefined>;
  saveImportBatch(batch: ImportBatch): Promise<void>;
  listImportRows(batchId: string): Promise<ImportRow[]>;
  saveImportRow(row: ImportRow): Promise<void>;
  getFarmerByLineUserId(lineUserId: string): Promise<Farmer | undefined>;
  getFarmerByMemberCode(memberCode: string): Promise<Farmer | undefined>;
  listFarmers(): Promise<Farmer[]>;
  getFarmer(farmerId: string): Promise<Farmer | undefined>;
  saveFarmer(farmer: Farmer): Promise<void>;
  listPlots(farmerId?: string): Promise<Plot[]>;
  getPlot(plotId: string): Promise<Plot | undefined>;
  savePlot(plot: Plot): Promise<void>;
  saveAuditEvent(event: AuditEvent): Promise<void>;
  listAuditEvents(entityId: string): Promise<AuditEvent[]>;
  listAllAuditEvents(): Promise<AuditEvent[]>;
  listOutbox(): Promise<OutboxMessage[]>;
  getOutboxMessage(messageId: string): Promise<OutboxMessage | undefined>;
  saveOutboxMessage(message: OutboxMessage): Promise<void>;
}
