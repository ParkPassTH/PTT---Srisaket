import type { Activity, AuditEvent, Farmer, Lot, Review } from "../domain/types.js";
import type { ActivityFilters, Repository } from "./repository.js";

const today = new Date().toISOString();

const demoActivities: Activity[] = [
  {
    activityId: "ACT-691017-024",
    sourceEventId: "demo-event-024",
    farmerId: "F-001",
    farmerName: "สมพร ใจดี",
    plotId: "P-KHOK",
    plotName: "แปลงโคก",
    crop: "ถั่วเหลือง",
    occurredAt: today,
    receivedAt: today,
    transcript: "เมื่อเช้าฉีดยาฆ่าหญ้าที่แปลงโคก แต่จำชื่อยาไม่ได้",
    activityType: "ฉีดพ่น",
    inputsUsed: "ยาฆ่าหญ้า ไม่ทราบชื่อและปริมาณ",
    processingStatus: "NEEDS_REVIEW",
    riskStatus: "FLAGGED_HIGH",
    confidence: 0.86,
    flagReasons: ["พบคำที่ตรงกับรายการความเสี่ยงสูง: ยาฆ่าหญ้า"],
    matchedTerms: ["ยาฆ่าหญ้า"],
    updatedAt: today
  },
  {
    activityId: "ACT-691017-025",
    sourceEventId: "demo-event-025",
    farmerId: "F-002",
    farmerName: "จำนง ทองดี",
    plotId: "P-002",
    plotName: "แปลง 2",
    crop: "ปอเทือง",
    occurredAt: today,
    receivedAt: today,
    transcript: "วันนี้ใส่น้ำหมักที่แปลงสอง",
    activityType: "บำรุงดิน",
    inputsUsed: "น้ำหมัก ไม่ระบุปริมาณ",
    processingStatus: "NEEDS_REVIEW",
    riskStatus: "NEEDS_REVIEW",
    confidence: 0.71,
    flagReasons: ["ข้อมูลปริมาณไม่ครบ ต้องให้เกษตรกรยืนยัน"],
    matchedTerms: [],
    updatedAt: today
  },
  {
    activityId: "ACT-691017-026",
    sourceEventId: "demo-event-026",
    farmerId: "F-003",
    farmerName: "ลำดวน แสงดี",
    plotId: "P-NORTH",
    plotName: "แปลงเหนือ",
    crop: "ถั่วเหลือง",
    occurredAt: today,
    receivedAt: today,
    transcript: "เก็บถั่วเหลืองแปลงเหนือได้ห้าสิบกิโลกรัม",
    activityType: "เก็บเกี่ยว",
    inputsUsed: "",
    harvestAmount: 50,
    harvestUnit: "กก.",
    processingStatus: "NEEDS_CONFIRMATION",
    riskStatus: "PROVISIONALLY_CLEAR",
    confidence: 0.94,
    flagReasons: [],
    matchedTerms: [],
    updatedAt: today
  }
];

const demoLots: Lot[] = [
  {
    lotId: "SOY-691016-LD-01",
    activityId: "ACT-691016-018",
    farmerId: "F-003",
    farmerName: "ลำดวน แสงดี",
    plotName: "แปลงเหนือ",
    crop: "ถั่วเหลือง",
    quantity: 42,
    unit: "กก.",
    harvestDate: "2026-10-16",
    inventoryStatus: "IN_STOCK",
    traceToken: "demo-soy-691016-ld-01",
    createdAt: today,
    updatedAt: today
  }
];

const demoFarmers: Farmer[] = [
  { farmerId: "F-001", memberCode: "M001", displayName: "สมพร ใจดี", lineUserId: "U-DEMO-001", status: "ACTIVE" },
  { farmerId: "F-002", memberCode: "M002", displayName: "จำนง ทองดี", lineUserId: "U-DEMO-002", status: "ACTIVE" },
  { farmerId: "F-003", memberCode: "M003", displayName: "ลำดวน แสงดี", lineUserId: "U-DEMO-003", status: "ACTIVE" }
];

export class MemoryRepository implements Repository {
  private activities = new Map(demoActivities.map((item) => [item.activityId, structuredClone(item)]));
  private lots = new Map(demoLots.map((item) => [item.lotId, structuredClone(item)]));
  private farmers = new Map(demoFarmers.map((item) => [item.farmerId, structuredClone(item)]));
  private reviews: Review[] = [];
  private auditEvents: AuditEvent[] = [];

  async getDashboardSummary() {
    const activities = [...this.activities.values()];
    const lots = [...this.lots.values()];
    return {
      pendingReview: activities.filter((item) => item.processingStatus === "NEEDS_REVIEW").length,
      highRisk: activities.filter((item) => item.riskStatus === "FLAGGED_HIGH").length,
      recordedToday: activities.length,
      lotsInStock: lots.filter((item) => item.inventoryStatus === "IN_STOCK").length,
      queueHealth: "HEALTHY" as const
    };
  }

  async listActivities(filters: ActivityFilters = {}) {
    const query = filters.query?.toLocaleLowerCase("th-TH");
    return [...this.activities.values()]
      .filter((item) => !filters.status || item.processingStatus === filters.status)
      .filter((item) => !filters.risk || item.riskStatus === filters.risk)
      .filter((item) => !query || [item.activityId, item.farmerName, item.plotName, item.crop, item.activityType]
        .some((value) => value?.toLocaleLowerCase("th-TH").includes(query)))
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
      .map((item) => structuredClone(item));
  }

  async getActivity(activityId: string) {
    const item = this.activities.get(activityId);
    return item ? structuredClone(item) : undefined;
  }

  async findActivityBySourceEvent(sourceEventId: string) {
    return structuredClone([...this.activities.values()].find((item) => item.sourceEventId === sourceEventId));
  }

  async saveActivity(activity: Activity) {
    this.activities.set(activity.activityId, structuredClone(activity));
  }

  async listReviews(activityId: string) {
    return this.reviews.filter((item) => item.activityId === activityId).map((item) => structuredClone(item));
  }

  async saveReview(review: Review) {
    this.reviews.push(structuredClone(review));
  }

  async listLots() {
    return [...this.lots.values()].map((item) => structuredClone(item));
  }

  async getLot(lotId: string) {
    const item = this.lots.get(lotId);
    return item ? structuredClone(item) : undefined;
  }

  async getLotByTraceToken(traceToken: string) {
    const item = [...this.lots.values()].find((lot) => lot.traceToken === traceToken);
    return item ? structuredClone(item) : undefined;
  }

  async saveLot(lot: Lot) {
    this.lots.set(lot.lotId, structuredClone(lot));
  }

  async getFarmerByLineUserId(lineUserId: string) {
    const item = [...this.farmers.values()].find((farmer) => farmer.lineUserId === lineUserId);
    return item ? structuredClone(item) : undefined;
  }

  async saveAuditEvent(event: AuditEvent) {
    this.auditEvents.push(structuredClone(event));
  }

  async listAuditEvents(entityId: string) {
    return this.auditEvents.filter((item) => item.entityId === entityId).map((item) => structuredClone(item));
  }
}
