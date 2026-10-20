import assert from "node:assert/strict";
import { describe,it } from "node:test";
import { MemoryRepository } from "../src/repositories/memory-repository.js";
import { LotStandardService } from "../src/services/lot-standard-service.js";
import { ImpactService } from "../src/services/impact-service.js";

async function repositoryWithLot(){
  const repository=new MemoryRepository();
  await repository.saveLot({lotId:"LOT-1",activityId:"ACT-1",farmerId:"F-1",farmerName:"ผู้ทดสอบ",plotName:"แปลง 1",crop:"ข้าว",quantity:100,unit:"กก.",harvestDate:"2026-10-19",inventoryStatus:"IN_STOCK",traceToken:"trace-1",createdAt:"2026-10-19T00:00:00.000Z",updatedAt:"2026-10-19T00:00:00.000Z"});
  return repository;
}

describe("controlled lot standards",()=>{
  it("requires a configured definition and preserves append-only history",async()=>{
    const repository=await repositoryWithLot(); const service=new LotStandardService(repository);
    await assert.rejects(()=>service.record("LOT-1",{definitionId:"missing",reason:"หลักฐานยังไม่ครบ",evidenceReference:"DOC-1",effectiveAt:"2026-10-19T01:00:00.000Z"},"ics-1"),/ยังไม่ได้กำหนด/);
    const hold=await service.saveDefinition({code:"ON_HOLD",name:"พักการจัดสรร",description:"ใช้เมื่อเจ้าหน้าที่ต้องตรวจหลักฐานเพิ่มเติม",active:true},"admin-1");
    const passed=await service.saveDefinition({code:"PASSED",name:"ผ่านการตรวจ",description:"เจ้าหน้าที่ ICS ยืนยันหลักฐานครบแล้ว",active:true},"admin-1");
    const first=await service.record("LOT-1",{definitionId:hold.definitionId,reason:"รอตรวจเอกสารแปลง",evidenceReference:"DOC-2",effectiveAt:"2026-10-19T02:00:00.000Z"},"ics-1");
    assert.equal(first.availabilityEligible,false);
    const second=await service.record("LOT-1",{definitionId:passed.definitionId,reason:"ตรวจเอกสารฉบับจริงแล้ว",evidenceReference:"DOC-3",effectiveAt:"2026-10-19T03:00:00.000Z"},"ics-1");
    assert.equal(second.availabilityEligible,true); assert.equal(second.history.length,2); assert.equal(second.current?.status,"PASSED");
    assert.equal((await repository.listAuditEvents("LOT-1")).length,2);
  });
});

describe("measured impact",()=>{
  it("reports observed counts and no invented baseline",async()=>{
    const repository=await repositoryWithLot();
    await repository.saveActivity({activityId:"ACT-1",sourceEventId:"EV-1",farmerId:"F-1",farmerName:"ผู้ทดสอบ",occurredAt:"2026-10-19T00:00:00.000Z",receivedAt:"2026-10-19T00:01:00.000Z",processingStatus:"NEEDS_REVIEW",riskStatus:"NEEDS_REVIEW",confidence:.8,flagReasons:[],matchedTerms:[],updatedAt:"2026-10-19T00:01:00.000Z"});
    await repository.saveAuditEvent({auditId:"AUD-1",entityType:"ACTIVITY",entityId:"ACT-1",actorId:"reviewer",action:"MANUAL_CORRECTION",occurredAt:"2026-10-19T00:02:00.000Z"});
    const result=await new ImpactService(repository).measure();
    assert.equal(result.baseline,null); assert.equal(result.activities.total,1); assert.equal(result.activities.missingRequired,1); assert.equal(result.activities.reworkCount,1); assert.equal(result.activities.medianReviewMinutes,null);
  });
});
