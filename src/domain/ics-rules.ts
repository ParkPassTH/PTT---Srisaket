import type { ExtractedActivity, RuleResult } from "./types.js";

export const ICS_RULE_VERSION = "2026.10-draft.1";

// Draft terms only. Production must replace these with an approved controlled list.
export const DEFAULT_HIGH_RISK_TERMS = [
  "ยาฆ่าหญ้า",
  "ยาฆ่าแมลง",
  "สารเคมี",
  "ปุ๋ยเคมี",
  "พาราควอต",
  "ไกลโฟเซต"
];

export const DEFAULT_AMBIGUOUS_TERMS = [
  "น้ำหมักไม่ทราบสูตร",
  "น้ำยา",
  "ยาฉีด",
  "ปุ๋ยไม่ทราบชื่อ"
];

const REQUIRED_FIELDS = ["plotId", "crop", "activityType"] as const;

export function evaluateIcsRisk(
  extracted: ExtractedActivity,
  transcript: string,
  confidenceThreshold = 0.75
): RuleResult {
  const normalized = `${transcript} ${extracted.inputsUsed ?? ""}`.toLocaleLowerCase("th-TH");
  const missingFields = REQUIRED_FIELDS.filter((field) => !extracted[field]);
  const lowConfidenceFields = Object.entries(extracted.fieldConfidence)
    .filter(([, confidence]) => confidence < confidenceThreshold)
    .map(([field]) => field);

  const highRiskMatches = DEFAULT_HIGH_RISK_TERMS.filter((term) => normalized.includes(term));
  const ambiguousMatches = DEFAULT_AMBIGUOUS_TERMS.filter((term) => normalized.includes(term));
  const reasons: string[] = [];

  if (highRiskMatches.length > 0) {
    reasons.push(`พบคำที่ตรงกับรายการความเสี่ยงสูง: ${highRiskMatches.join(", ")}`);
    return {
      riskStatus: "FLAGGED_HIGH",
      reasons,
      matchedTerms: highRiskMatches,
      ruleVersion: ICS_RULE_VERSION,
      missingFields: [...new Set([...missingFields, ...lowConfidenceFields])]
    };
  }

  if (ambiguousMatches.length > 0) {
    reasons.push(`พบชื่อวัสดุที่ต้องยืนยัน: ${ambiguousMatches.join(", ")}`);
  }
  if (missingFields.length > 0) {
    reasons.push(`ข้อมูลบังคับไม่ครบ: ${missingFields.join(", ")}`);
  }
  if (lowConfidenceFields.length > 0) {
    reasons.push(`ข้อมูลที่ความมั่นใจต่ำ: ${lowConfidenceFields.join(", ")}`);
  }

  if (reasons.length > 0) {
    return {
      riskStatus: "NEEDS_REVIEW",
      reasons,
      matchedTerms: ambiguousMatches,
      ruleVersion: ICS_RULE_VERSION,
      missingFields: [...new Set([...missingFields, ...lowConfidenceFields])]
    };
  }

  return {
    riskStatus: "PROVISIONALLY_CLEAR",
    reasons: ["ผลเบื้องต้นไม่พบเงื่อนไขเสี่ยงจากกฎฉบับปัจจุบัน ต้องยืนยันข้อมูลก่อนบันทึกสมบูรณ์"],
    matchedTerms: [],
    ruleVersion: ICS_RULE_VERSION,
    missingFields: []
  };
}
