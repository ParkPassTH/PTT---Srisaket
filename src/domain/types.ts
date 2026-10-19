export type ProcessingStatus =
  | "RECEIVED"
  | "PROCESSING"
  | "NEEDS_CONFIRMATION"
  | "CORRECTION_PENDING"
  | "CORRECTION_CONFIRMATION"
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
  revision?: number;
  correctionRequestedAt?: string;
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
  storageLocationId?: string;
  storageLocationName?: string;
}

export interface StorageLocation {
  locationId: string;
  name: string;
  locationType?: string;
  address?: string;
  zone?: string;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  updatedAt: string;
}

export type StockMovementType = "RECEIVE" | "RESERVE" | "RELEASE" | "SHIP" | "ADJUST" | "RECALL";

/** Append-only inventory fact. Existing movements must never be overwritten. */
export interface StockMovement {
  movementId: string;
  lotId: string;
  movementType: StockMovementType;
  /** Positive for every type except ADJUST, which may be positive or negative. */
  quantity: number;
  unit: string;
  actorId: string;
  reason: string;
  /** Caller-owned idempotency key, scoped to the lot. */
  reference: string;
  occurredAt: string;
}

export interface StockBalance {
  lotId: string;
  unit: string;
  onHand: number;
  reserved: number;
  available: number;
  recalled: boolean;
  updatedAt?: string;
}

export interface ImportIssue { field?: string; code: string; message: string; }
export interface ImportBatch {
  batchId:string; sourceName:string; sourceType:"CSV"|"XLSX"|"OCR"|"API"; entityType:"FARMER";
  checksum:string; status:"PREVIEW"|"READY"|"COMMITTED"|"VOID"; totalRows:number; validRows:number; errorRows:number; duplicateRows:number;
  createdBy:string; createdAt:string; updatedAt:string;
}
export interface ImportRow {
  importRowId:string; batchId:string; sourceRowNumber:number; rawData:Record<string,unknown>; normalizedData:Record<string,unknown>;
  rowStatus:"VALID"|"ERROR"|"DUPLICATE"|"SKIPPED"|"COMMITTED"; issues:ImportIssue[]; targetEntityId?:string;
  importedBy?:string; importedAt?:string; verificationStatus:"NOT_REQUIRED"|"PENDING"|"VERIFIED"|"REJECTED";
  reviewerId?:string; reviewedAt?:string; reviewReason?:string; createdAt:string; updatedAt:string;
}

export type FarmerImportField = "memberCode" | "displayName" | "lineUserId" | "status" | "address" | "phone" | "registeredAt" | "totalAreaRai";
export type FarmerImportMapping = Partial<Record<FarmerImportField, string>>;
export interface ImportMappingTemplate {
  templateId:string; name:string; sourceName:string; entityType:"FARMER"; headers:string[]; mapping:FarmerImportMapping;
  createdBy:string; updatedBy:string; createdAt:string; updatedAt:string;
}

export interface AuditEvent {
  auditId: string;
  entityType: "ACTIVITY" | "LOT" | "STOCK_MOVEMENT" | "FARMER" | "PLOT" | "STORAGE_LOCATION" | "IMPORT_BATCH" | "IMPORT_MAPPING_TEMPLATE" | "REPORT" | "USER" | "RULE" | "OUTBOX";
  entityId: string;
  actorId: string;
  action: string;
  reason?: string;
  before?: unknown;
  after?: unknown;
  occurredAt: string;
}

export interface OutboxMessage {
  messageId: string;
  channel: "LINE";
  recipient: string;
  body: string;
  lineMessage?: Record<string, unknown>;
  relatedEntityId?: string;
  status: "PENDING" | "DELIVERED" | "DEAD_LETTER";
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SessionUser {
  userId: string;
  email: string;
  displayName: string;
  roles: UserRole[];
}
