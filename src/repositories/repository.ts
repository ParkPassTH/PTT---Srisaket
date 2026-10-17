import type { Activity, AuditEvent, Farmer, Lot, Review } from "../domain/types.js";

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
  saveReview(review: Review): Promise<void>;
  listLots(): Promise<Lot[]>;
  getLot(lotId: string): Promise<Lot | undefined>;
  getLotByTraceToken(traceToken: string): Promise<Lot | undefined>;
  saveLot(lot: Lot): Promise<void>;
  getFarmerByLineUserId(lineUserId: string): Promise<Farmer | undefined>;
  saveAuditEvent(event: AuditEvent): Promise<void>;
  listAuditEvents(entityId: string): Promise<AuditEvent[]>;
}
