import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryRepository } from "../src/repositories/memory-repository.js";
import { BackupService } from "../src/services/backup-service.js";

describe("backup and merge restore", () => {
  it("exports all entities with a verifiable checksum", async () => {
    const repository=new MemoryRepository();
    await repository.saveFarmer({ farmerId:"F-1", memberCode:"M1", displayName:"ผู้ทดสอบ", status:"ACTIVE" });
    await repository.savePlot({ plotId:"P-1", farmerId:"F-1", name:"แปลงหนึ่ง", crop:"ข้าว", status:"ACTIVE" });
    const service=new BackupService(repository);
    const archive=await service.export();
    const validated=service.validate(archive);
    assert.equal(validated.counts.farmers,1);
    assert.equal(validated.counts.plots,1);
    assert.equal(archive.checksum.length,64);
  });

  it("rejects an archive modified after export", async () => {
    const service=new BackupService(new MemoryRepository());
    const archive=await service.export();
    archive.entities.farmers.push({ farmerId:"F-X", memberCode:"MX", displayName:"แก้ไฟล์", status:"ACTIVE" });
    assert.throws(() => service.validate(archive), /checksum/);
  });

  it("merges without duplicating append-only review and audit records", async () => {
    const source=new MemoryRepository();
    await source.saveFarmer({ farmerId:"F-1", memberCode:"M1", displayName:"ผู้ทดสอบ", status:"ACTIVE" });
    await source.saveReview({ reviewId:"REV-1", activityId:"ACT-1", reviewerId:"ADMIN", decision:"APPROVE", reason:"ข้อมูลครบถ้วน", reviewedAt:new Date().toISOString() });
    await source.saveAuditEvent({ auditId:"AUD-1", entityType:"FARMER", entityId:"F-1", actorId:"ADMIN", action:"CREATE", occurredAt:new Date().toISOString() });
    const archive=await new BackupService(source).export();
    const target=new MemoryRepository(); const restore=new BackupService(target);
    await restore.merge(archive,"ADMIN","ทดสอบกู้คืนข้อมูล");
    await restore.merge(archive,"ADMIN","ทดสอบกู้คืนซ้ำ");
    assert.equal((await target.listFarmers()).length,1);
    assert.equal((await target.listAllReviews()).length,1);
    assert.equal((await target.listAllAuditEvents()).filter((item) => item.auditId === "AUD-1").length,1);
  });
});
