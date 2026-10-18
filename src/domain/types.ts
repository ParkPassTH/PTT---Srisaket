export type ProcessingStatus =
  | "RECEIVED"
  | "PROCESSING"
  | "NEEDS_CONFIRMATION"
  | "NEEDS_REVIEW"
  | "AWAITING_FARMER"
  | "COMPLETED"
  | "FAILED_RETRYABLE"
  | "FAILED_FINAL"
  | "DEAD_LETTER";

export type RiskStatus =
  | "PROVISIONALLY_CLEAR"
  | "NEEDS_REVIEW"
  | "FLAGGED_HIGH"
  | "APPROVED"
  | "REJECTED";

export type InventoryStatus =
  | "DRAFT"
  | "IN_STOCK"
  | "RESERVED"
  | "SHIPPED"
  | "VOID"
  | "RECALLED";

export type ReviewDecision = "APPROVE" | "FLAG" | "REQUEST_INFO" | "VOID";
export type UserRole = "REVIEWER" | "WAREHOUSE" | "ADMIN" | "AUDITOR";

export interface Farmer {
  farmerId: string;
  memberCode: string;
  displayName: string;
  lineUserId?: string;
  status: "ACTIVE" | "INACTIVE";
  address?: string;
  phone?: string;
  registeredAt?: string;
  totalAreaRai?: number;
}

export interface Plot {
  plotId: string;
  farmerId: string;
  name: string;
  crop: string;
  status: "ACTIVE" | "INACTIVE";
  areaRai?: number;
  gpsLat?: number;
  gpsLng?: number;
  certificationStatus?: "ORGANIC" | "CONVERSION" | "CONVENTIONAL";
  conversionStartedAt?: string;
  conversionEndsAt?: string;
  previousChemicalUse?: string;
  estimatedYield?: number;
  estimatedYieldUnit?: string;
}

export interface ExtractedActivity {
  plotId?: string;
  crop?: string;
  activityType?: string;
  inputsUsed?: string;
  harvestAmount?: number;
  harvestUnit?: string;
  isHarvesting: boolean;
  fieldConfidence: Record<string, number>;
}

export interface RuleResult {
  riskStatus: RiskStatus;
  reasons: string[];
  matchedTerms: string[];
  ruleVersion: string;
  missingFields: string[];
}

export interface Activity {
  activityId: string;
  sourceEventId: string;
  sourceEventIds?: string[];
  farmerId: string;
  farmerName: string;
  plotId?: string;
  plotName?: string;
  crop?: string;
  occurredAt: string;
  receivedAt: string;
  transcript?: string;
  audioContentId?: string;
  activityType?: string;
  inputsUsed?: string;
  harvestAmount?: number;
  harvestUnit?: string;
  processingStatus: ProcessingStatus;
  riskStatus: RiskStatus;
  confidence: number;
  flagReasons: string[];
  matchedTerms: string[];
  createdLotId?: string;
  updatedAt: string;
}

export interface Review {
  reviewId: string;
  activityId: string;
  reviewerId: string;
  decision: ReviewDecision;
  reason: string;
  reviewedAt: string;
}

export interface Lot {
  lotId: string;
  activityId: string;
  farmerId: string;
  farmerName: string;
  plotName: string;
  crop: string;
  quantity: number;
  unit: string;
  harvestDate: string;
  inventoryStatus: InventoryStatus;
  traceToken: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEvent {
  auditId: string;
  entityType: "ACTIVITY" | "LOT" | "FARMER" | "PLOT" | "REPORT" | "USER" | "RULE";
  entityId: string;
  actorId: string;
  action: string;
  reason?: string;
  before?: unknown;
  after?: unknown;
  occurredAt: string;
}

export interface SessionUser {
  userId: string;
  email: string;
  displayName: string;
  roles: UserRole[];
}
