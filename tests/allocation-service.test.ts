import assert from "node:assert/strict";
import { describe,it } from "node:test";
import { MemoryRepository } from "../src/repositories/memory-repository.js";
import { AllocationService } from "../src/services/allocation-service.js";
import { StockService } from "../src/services/stock-service.js";

const t0=new Date("2026-10-20T00:00:00.000Z");
async function fixture(){
  const repository=new MemoryRepository();
  await repository.saveLot({lotId:"LOT-A",activityId:"ACT-A",farmerId:"F-A",farmerName:"Farmer",plotName:"Plot",crop:"Rice",quantity:100,unit:"kg",harvestDate:"2026-10-20",inventoryStatus:"IN_STOCK",traceToken:"allocation-token",createdAt:t0.toISOString(),updatedAt:t0.toISOString()});
  await new StockService(repository).record({lotId:"LOT-A",movementType:"RECEIVE",quantity:100,unit:"kg",actorId:"warehouse",reason:"receive harvested lot",reference:"receive:LOT-A",occurredAt:"2026-10-19T23:59:00.000Z"});
  return {repository,service:new AllocationService(repository)};
}
const createInput={lotId:"LOT-A",quantity:30,unit:"kg",responsibleName:"Warehouse A",recipientName:"Community buyer",orderReference:"ORDER-001",documentReference:"DOC-001",expiresAt:"2026-10-20T02:00:00.000Z",reason:"reserve for confirmed order",reference:"request:reserve:001"};

describe("AllocationService",()=>{
  it("reserves and releases through linked idempotent stock movements",async()=>{
    const {repository,service}=await fixture();
    const created=await service.create(createInput,"warehouse",t0);
    assert.equal(created.allocation.status,"ACTIVE"); assert.equal(created.balance.reserved,30);
    const replay=await service.create(createInput,"warehouse",t0);
    assert.equal(replay.created,false); assert.equal(replay.allocation.allocationId,created.allocation.allocationId);
    const released=await service.release(created.allocation.allocationId,"warehouse","customer cancelled order","request:release:001",new Date("2026-10-20T01:00:00.000Z"));
    assert.equal(released.allocation.status,"RELEASED"); assert.equal(released.balance.reserved,0);
    const releaseReplay=await service.release(created.allocation.allocationId,"warehouse","customer cancelled order","request:release:001",new Date("2026-10-20T01:00:00.000Z"));
    assert.equal(releaseReplay.created,false);
    await assert.rejects(()=>service.release(created.allocation.allocationId,"warehouse","duplicate release blocked","request:release:002"),/สิ้นสุดแล้ว/);
    assert.equal((await repository.listAllocationEvents()).length,2);
    assert.equal((await repository.listStockMovements("LOT-A")).length,3);
  });

  it("ships an active allocation and consumes its reservation",async()=>{
    const {service}=await fixture(); const created=await service.create(createInput,"warehouse",t0);
    const shipped=await service.ship(created.allocation.allocationId,"warehouse","dispatch with document","request:ship:001",new Date("2026-10-20T01:00:00.000Z"));
    assert.equal(shipped.allocation.status,"SHIPPED"); assert.equal(shipped.balance.onHand,70); assert.equal(shipped.balance.reserved,0);
  });

  it("expires allocations once and releases stock idempotently",async()=>{
    const {repository,service}=await fixture(); await service.create({...createInput,expiresAt:"2026-10-20T00:30:00.000Z"},"warehouse",t0);
    const first=await service.processExpired(new Date("2026-10-20T01:00:00.000Z"));
    const second=await service.processExpired(new Date("2026-10-20T02:00:00.000Z"));
    assert.equal(first.processed,1); assert.equal(first.allocations[0]?.status,"EXPIRED"); assert.equal(second.processed,0);
    assert.equal((await repository.listAllocationEvents()).filter((item)=>item.eventType==="EXPIRE").length,1);
    assert.equal((await new StockService(repository).getBalance("LOT-A")).reserved,0);
  });

  it("rejects expired shipment, insufficient stock and reference conflicts",async()=>{
    const {service}=await fixture(); const created=await service.create(createInput,"warehouse",t0);
    await assert.rejects(()=>service.ship(created.allocation.allocationId,"warehouse","late shipment blocked","request:ship:late",new Date("2026-10-20T03:00:00.000Z")),/หมดอายุ/);
    await assert.rejects(()=>service.create({...createInput,quantity:80,reference:"request:reserve:002"},"warehouse",t0),/ยอดพร้อมใช้/);
    await assert.rejects(()=>service.create({...createInput,quantity:10},"warehouse",t0),/reference/);
  });
});
