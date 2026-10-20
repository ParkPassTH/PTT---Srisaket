import assert from "node:assert/strict";
import { describe,it } from "node:test";
import { MemoryRepository } from "../src/repositories/memory-repository.js";
import { StockService } from "../src/services/stock-service.js";

async function fixture() {
  const repository=new MemoryRepository();
  await repository.saveLot({lotId:"LOT-STOCK",activityId:"ACT-STOCK",farmerId:"F-1",farmerName:"Farmer",plotName:"Plot",crop:"Rice",quantity:100,unit:"kg",harvestDate:"2026-10-19",inventoryStatus:"IN_STOCK",traceToken:"stock-token",createdAt:"2026-10-19T01:00:00.000Z",updatedAt:"2026-10-19T01:00:00.000Z"});
  return {repository,service:new StockService(repository)};
}

describe("StockService",()=>{
  it("derives on-hand, reserved and available balances from append-only movements",async()=>{
    const {repository,service}=await fixture();
    await service.receiveLot("LOT-STOCK","warehouse","lot-create:ACT-STOCK");
    await service.record({lotId:"LOT-STOCK",movementType:"RESERVE",quantity:30,unit:"kg",actorId:"warehouse",reason:"reserve order 1",reference:"order:1:reserve"});
    const shipped=await service.record({lotId:"LOT-STOCK",movementType:"SHIP",quantity:20,unit:"kg",actorId:"warehouse",reason:"ship order 1",reference:"order:1:ship"});
    assert.deepEqual({...shipped.balance,updatedAt:undefined},{lotId:"LOT-STOCK",unit:"kg",onHand:80,reserved:10,available:70,recalled:false,updatedAt:undefined});
    assert.equal((await repository.listStockMovements("LOT-STOCK")).length,3);
    assert.equal((await repository.listAuditEvents(shipped.movement.movementId))[0]?.action,"STOCK_SHIP");
  });

  it("returns the original movement for an idempotent reference and rejects conflicting reuse",async()=>{
    const {repository,service}=await fixture();
    const first=await service.receiveLot("LOT-STOCK","warehouse","lot-create:ACT-STOCK");
    const replay=await service.receiveLot("LOT-STOCK","warehouse","lot-create:ACT-STOCK");
    assert.equal(replay.created,false);
    assert.equal(replay.movement.movementId,first.movement.movementId);
    assert.equal((await repository.listStockMovements("LOT-STOCK")).length,1);
    await assert.rejects(()=>service.record({lotId:"LOT-STOCK",movementType:"RECEIVE",quantity:1,unit:"kg",actorId:"warehouse",reason:"conflicting retry",reference:"lot-create:ACT-STOCK"}),/reference/);
  });

  it("rejects over-reservation, over-release, negative stock and unit mismatch",async()=>{
    const {service}=await fixture();
    await service.receiveLot("LOT-STOCK","warehouse","receive:1");
    await assert.rejects(()=>service.record({lotId:"LOT-STOCK",movementType:"RESERVE",quantity:101,unit:"kg",actorId:"warehouse",reason:"too much reserve",reference:"reserve:too-much"}),/ยอดพร้อมใช้/);
    await assert.rejects(()=>service.record({lotId:"LOT-STOCK",movementType:"RELEASE",quantity:1,unit:"kg",actorId:"warehouse",reason:"nothing reserved",reference:"release:none"}),/ยอด/);
    await assert.rejects(()=>service.record({lotId:"LOT-STOCK",movementType:"SHIP",quantity:101,unit:"kg",actorId:"warehouse",reason:"too much ship",reference:"ship:too-much"}),/ติดลบ|ยอดคงเหลือ/);
    await assert.rejects(()=>service.record({lotId:"LOT-STOCK",movementType:"ADJUST",quantity:1,unit:"ton",actorId:"warehouse",reason:"wrong unit",reference:"adjust:wrong-unit"}),/หน่วย/);
  });

  it("sets available to zero after recall and blocks subsequent inventory operations",async()=>{
    const {service}=await fixture();
    await service.receiveLot("LOT-STOCK","warehouse","receive:1");
    const recalled=await service.record({lotId:"LOT-STOCK",movementType:"RECALL",quantity:100,unit:"kg",actorId:"warehouse",reason:"quality recall",reference:"recall:1"});
    assert.equal(recalled.balance.onHand,100);
    assert.equal(recalled.balance.available,0);
    assert.equal(recalled.balance.recalled,true);
    await assert.rejects(()=>service.record({lotId:"LOT-STOCK",movementType:"SHIP",quantity:1,unit:"kg",actorId:"warehouse",reason:"blocked shipment",reference:"ship:blocked"}),/เรียกคืน/);
  });

  it("excludes held or rejected lots from available stock",async()=>{
    const {repository,service}=await fixture();
    await service.receiveLot("LOT-STOCK","warehouse","receive:held");
    await repository.appendLotStandardHistory({historyId:"STDH-HOLD",lotId:"LOT-STOCK",definitionId:"STD-HOLD",status:"ON_HOLD",actorId:"ics",reason:"awaiting investigation",evidenceReference:"inspection:1",effectiveAt:"2026-10-20T00:00:00.000Z",recordedAt:"2026-10-20T00:00:00.000Z"});
    assert.equal((await service.getBalance("LOT-STOCK")).available,0);
    await assert.rejects(()=>service.record({lotId:"LOT-STOCK",movementType:"RESERVE",quantity:1,unit:"kg",actorId:"warehouse",reason:"must be blocked",reference:"reserve:held"}),/พร้อมใช้|available/);
  });
});
