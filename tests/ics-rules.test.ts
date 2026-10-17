import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateIcsRisk } from "../src/domain/ics-rules.js";
import type { ExtractedActivity } from "../src/domain/types.js";

const completeActivity: ExtractedActivity = {
  plotId: "P-001",
  crop: "ถั่วเหลือง",
  activityType: "บำรุงดิน",
  inputsUsed: "ปุ๋ยคอก 2 กระสอบ",
  isHarvesting: false,
  fieldConfidence: { plotId: 0.95, crop: 0.94, activityType: 0.9, inputsUsed: 0.88 }
};

describe("evaluateIcsRisk", () => {
  it("flags controlled high-risk terms with an explainable reason", () => {
    const result = evaluateIcsRisk(
      { ...completeActivity, inputsUsed: "ยาฆ่าหญ้า 1 ขวด" },
      "วันนี้ฉีดยาฆ่าหญ้าที่แปลงหนึ่ง"
    );
    assert.equal(result.riskStatus, "FLAGGED_HIGH");
    assert.ok(result.matchedTerms.includes("ยาฆ่าหญ้า"));
    assert.match(result.reasons[0] ?? "", /ความเสี่ยงสูง/);
  });

  it("routes incomplete data to human review", () => {
    const { plotId: _plotId, ...activityWithoutPlot } = completeActivity;
    const result = evaluateIcsRisk(
      { ...activityWithoutPlot, fieldConfidence: { crop: 0.9, activityType: 0.9 } },
      "ใส่ปุ๋ยคอก"
    );
    assert.equal(result.riskStatus, "NEEDS_REVIEW");
    assert.ok(result.missingFields.includes("plotId"));
  });

  it("uses a provisional clear state instead of claiming certification", () => {
    const result = evaluateIcsRisk(completeActivity, "ใส่ปุ๋ยคอกสองกระสอบที่แปลงหนึ่ง");
    assert.equal(result.riskStatus, "PROVISIONALLY_CLEAR");
    assert.match(result.reasons[0] ?? "", /ผลเบื้องต้น/);
  });
});
