import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryRepository } from "../src/repositories/memory-repository.js";
import { BackupService } from "../src/services/backup-service.js";
import { createHash } from "node:crypto";

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

  it("backs up mapping templates and accepts archives created before that additive entity",async()=>{
    const source=new MemoryRepository();
    await source.saveImportMappingTemplate({templateId:"IMPMAP-1",name:"Members",sourceName:"members.csv",entityType:"FARMER",headers:["id","name"],mapping:{memberCode:"id",displayName:"name"},createdBy:"ADMIN",updatedBy:"ADMIN",createdAt:"2026-10-20T00:00:00.000Z",updatedAt:"2026-10-20T00:00:00.000Z"});
    const service=new BackupService(source); const archive=await service.export();
    assert.equal(archive.entities.importMappingTemplates.length,1);
    const legacy=structuredClone(archive) as unknown as {checksum:string;entities:Record<string,unknown>;[key:string]:unknown};
    delete legacy.entities.importMappingTemplates;
    const {checksum:discarded,...payload}=legacy; void discarded;
    legacy.checksum=createHash("sha256").update(JSON.stringify(canonical(payload))).digest("hex");
    const validated=service.validate(legacy);
    assert.equal(validated.archive.entities.importMappingTemplates.length,0);
  });

  it("backs up and restores append-only allocation events without duplication",async()=>{
    const source=new MemoryRepository();
    await source.appendAllocationEvent({eventId:"ALE-1",allocationId:"ALLOC-1",lotId:"LOT-1",eventType:"ALLOCATE",quantity:5,unit:"kg",responsibleName:"Warehouse",recipientName:"Buyer",orderReference:"ORDER-1",expiresAt:"2026-10-21T00:00:00.000Z",reason:"confirmed order",reference:"allocation:create:1",actorId:"ADMIN",stockMovementId:"MOV-1",occurredAt:"2026-10-20T00:00:00.000Z"});
    const archive=await new BackupService(source).export(); assert.equal(archive.entities.allocationEvents.length,1);
    const target=new MemoryRepository(); const restore=new BackupService(target);
    await restore.merge(archive,"ADMIN","restore allocation evidence"); await restore.merge(archive,"ADMIN","repeat restore allocation evidence");
    assert.equal((await target.listAllocationEvents()).length,1);
  });
});

function canonical(value:unknown):unknown {
  if(Array.isArray(value)) return value.map(canonical);
  if(value&&typeof value==="object") return Object.fromEntries(Object.entries(value).filter(([,item])=>item!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)]));
  return value;
}
