import type { Repository } from "../repositories/repository.js";
import type { ReviewDecision, SessionUser } from "../domain/types.js";
import { HttpError } from "../lib/http-error.js";
import { createId } from "../lib/ids.js";

export class ReviewService {
  constructor(private readonly repository: Repository) {}

  async reviewActivity(input: {
    activityId: string;
    decision: ReviewDecision;
    reason: string;
    user: SessionUser;
  }) {
    const activity = await this.repository.getActivity(input.activityId);
    if (!activity) throw new HttpError(404, "ACTIVITY_NOT_FOUND", "ไม่พบกิจกรรมที่ต้องการตรวจสอบ");
    if (input.reason.trim().length < 5) {
      throw new HttpError(400, "REASON_REQUIRED", "กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร");
    }

    const before = structuredClone(activity);
    const now = new Date().toISOString();
    switch (input.decision) {
      case "APPROVE":
        activity.riskStatus = "APPROVED";
        activity.processingStatus = "COMPLETED";
        break;
      case "FLAG":
        activity.riskStatus = "REJECTED";
        activity.processingStatus = "COMPLETED";
        activity.flagReasons = [...new Set([...activity.flagReasons, input.reason])];
        break;
      case "REQUEST_INFO":
        activity.processingStatus = "AWAITING_FARMER";
        break;
      case "VOID":
        activity.riskStatus = "REJECTED";
        activity.processingStatus = "COMPLETED";
        break;
    }
    activity.updatedAt = now;

    await this.repository.saveReview({
      reviewId: createId("REV"),
      activityId: activity.activityId,
      reviewerId: input.user.userId,
      decision: input.decision,
      reason: input.reason.trim(),
      reviewedAt: now
    });
    await this.repository.saveActivity(activity);
    await this.repository.saveAuditEvent({
      auditId: createId("AUD"),
      entityType: "ACTIVITY",
      entityId: activity.activityId,
      actorId: input.user.userId,
      action: `REVIEW_${input.decision}`,
      reason: input.reason.trim(),
      before,
      after: activity,
      occurredAt: now
    });
    return activity;
  }
}
