import type { Allocation, AllocationEvent, AllocationEventType, AllocationStatus } from "../domain/types.js";
import { HttpError } from "../lib/http-error.js";
import { createId } from "../lib/ids.js";
import type { Repository } from "../repositories/repository.js";
import { StockService } from "./stock-service.js";
import { createHash } from "node:crypto";

export interface CreateAllocationInput {
  lotId:string; quantity:number; unit:string; responsibleName:string; recipientName:string; orderReference:string;
  documentReference?:string|undefined; expiresAt:string; reason:string; reference:string;
}

export class AllocationService {
  private readonly stock:StockService;
  constructor(private readonly repository:Repository){ this.stock=new StockService(repository); }

  async list(filters:{lotId?:string;status?:AllocationStatus}={}) {
    const allocations=deriveAllocations(await this.repository.listAllocationEvents(filters.lotId));
    return allocations.filter((item)=>!filters.status||item.status===filters.status).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  }

  async create(input:CreateAllocationInput,actorId:string,now=new Date()) {
    const replay=await this.repository.getAllocationEventByReference(input.reference.trim());
    if(replay) {
      if(replay.eventType!=="ALLOCATE"||replay.lotId!==input.lotId||replay.quantity!==input.quantity||replay.unit!==input.unit||replay.responsibleName!==input.responsibleName.trim()||replay.recipientName!==input.recipientName.trim()||replay.orderReference!==input.orderReference.trim()||(replay.documentReference??"")!==(input.documentReference?.trim()??"")||Date.parse(replay.expiresAt)!==Date.parse(input.expiresAt)||replay.reason!==input.reason.trim()) throw referenceConflict();
      return {allocation:await this.requireAllocation(replay.allocationId),balance:await this.stock.getBalance(replay.lotId),created:false};
    }
    const lot=await this.repository.getLot(input.lotId);
    if(!lot) throw new HttpError(404,"LOT_NOT_FOUND","ไม่พบล็อตที่ค้นหา");
    const standardHistory=await this.repository.listLotStandardHistory(lot.lotId);
    const currentStandard=[...standardHistory].sort((a,b)=>b.effectiveAt.localeCompare(a.effectiveAt)||b.recordedAt.localeCompare(a.recordedAt))[0];
    if(currentStandard&&["ON_HOLD","REJECTED"].includes(currentStandard.status)) throw new HttpError(409,"LOT_STANDARD_BLOCKED","ล็อตถูกพักใช้หรือไม่ผ่านมาตรฐาน จึงไม่สามารถจัดสรรได้");
    if(!Number.isFinite(input.quantity)||input.quantity<=0) throw new HttpError(400,"INVALID_ALLOCATION_QUANTITY","จำนวนที่จองต้องมากกว่า 0");
    if(input.unit.trim()!==lot.unit) throw new HttpError(409,"ALLOCATION_UNIT_MISMATCH",`หน่วยต้องตรงกับล็อต (${lot.unit})`);
    const expiresAt=new Date(input.expiresAt);
    if(Number.isNaN(expiresAt.getTime())||expiresAt.getTime()<=now.getTime()) throw new HttpError(400,"ALLOCATION_EXPIRY_INVALID","วันหมดอายุต้องเป็นเวลาในอนาคต");
    const allocationId=deterministicAllocationId(input.reference.trim());
    const stockResult=await this.stock.record({lotId:lot.lotId,movementType:"RESERVE",quantity:input.quantity,unit:lot.unit,actorId,reason:input.reason,reference:`allocation:${allocationId}:reserve`,occurredAt:now.toISOString()});
    const event=this.event({allocationId,lotId:lot.lotId,eventType:"ALLOCATE",quantity:input.quantity,unit:lot.unit,responsibleName:input.responsibleName,recipientName:input.recipientName,orderReference:input.orderReference,...(input.documentReference?{documentReference:input.documentReference}:{}),expiresAt:expiresAt.toISOString(),reason:input.reason,reference:input.reference,actorId,stockMovementId:stockResult.movement.movementId,occurredAt:now.toISOString()});
    await this.appendAndAudit(event);
    return {allocation:toAllocation(event,"ACTIVE"),balance:stockResult.balance,created:true};
  }

  async release(allocationId:string,actorId:string,reason:string,reference:string,now=new Date()) {
    return this.transition(allocationId,"RELEASE",actorId,reason,reference,now);
  }

  async ship(allocationId:string,actorId:string,reason:string,reference:string,now=new Date()) {
    return this.transition(allocationId,"SHIP",actorId,reason,reference,now);
  }

  async processExpired(now=new Date(),actorId="system-allocation-expiry") {
    const active=(await this.list({status:"ACTIVE"})).filter((item)=>Date.parse(item.expiresAt)<=now.getTime());
    const allocations:Allocation[]=[];
    for(const item of active) {
      const result=await this.transition(item.allocationId,"EXPIRE",actorId,"หมดเวลาจองอัตโนมัติ",`allocation-expire:${item.allocationId}`,now);
      allocations.push(result.allocation);
    }
    return {processed:allocations.length,allocations};
  }

  private async transition(allocationId:string,eventType:Exclude<AllocationEventType,"ALLOCATE">,actorId:string,reason:string,reference:string,now:Date) {
    const replay=await this.repository.getAllocationEventByReference(reference.trim());
    if(replay) {
      if(replay.allocationId!==allocationId||replay.eventType!==eventType||replay.reason!==reason.trim()) throw referenceConflict();
      return {allocation:await this.requireAllocation(allocationId),balance:await this.stock.getBalance(replay.lotId),created:false};
    }
    const allocation=await this.requireAllocation(allocationId);
    if(allocation.status!=="ACTIVE") throw new HttpError(409,"ALLOCATION_ALREADY_TERMINAL",`รายการจองสิ้นสุดแล้วด้วยสถานะ ${allocation.status}`);
    if(eventType==="SHIP"&&Date.parse(allocation.expiresAt)<=now.getTime()) throw new HttpError(409,"ALLOCATION_EXPIRED","รายการจองหมดอายุแล้ว ต้องประมวลผลปลดจองก่อน");
    const movementType=eventType==="SHIP"?"SHIP":"RELEASE";
    const suffix=eventType.toLocaleLowerCase("en-US");
    const stockResult=await this.stock.record({lotId:allocation.lotId,movementType,quantity:allocation.quantity,unit:allocation.unit,actorId,reason,reference:`allocation:${allocationId}:${suffix}`,occurredAt:now.toISOString()});
    const event=this.event({...allocation,eventType,reason,reference,actorId,stockMovementId:stockResult.movement.movementId,occurredAt:now.toISOString()});
    await this.appendAndAudit(event);
    return {allocation:toAllocation(event,statusFor(eventType),allocation.createdAt),balance:stockResult.balance,created:true};
  }

  private async requireAllocation(allocationId:string) {
    const item=deriveAllocations(await this.repository.listAllocationEvents()).find((value)=>value.allocationId===allocationId);
    if(!item) throw new HttpError(404,"ALLOCATION_NOT_FOUND","ไม่พบรายการจองสินค้า");
    return item;
  }

  private event(input:Omit<AllocationEvent,"eventId">):AllocationEvent {
    return {eventId:createId("ALE"),...input,responsibleName:input.responsibleName.trim(),recipientName:input.recipientName.trim(),orderReference:input.orderReference.trim(),...(input.documentReference?.trim()?{documentReference:input.documentReference.trim()}:{}),reason:input.reason.trim(),reference:input.reference.trim()};
  }

  private async appendAndAudit(event:AllocationEvent) {
    await this.repository.appendAllocationEvent(event);
    await this.repository.saveAuditEvent({auditId:createId("AUD"),entityType:"ALLOCATION",entityId:event.allocationId,actorId:event.actorId,action:`ALLOCATION_${event.eventType}`,reason:event.reason,after:event,occurredAt:event.occurredAt});
  }
}

export function deriveAllocations(events:AllocationEvent[]):Allocation[] {
  const groups=new Map<string,AllocationEvent[]>();
  for(const event of events){ const group=groups.get(event.allocationId)??[]; group.push(event); groups.set(event.allocationId,group); }
  const result:Allocation[]=[];
  for(const [allocationId,group] of groups){
    const ordered=[...group].sort((a,b)=>a.occurredAt.localeCompare(b.occurredAt)||a.eventId.localeCompare(b.eventId));
    const initial=ordered.find((item)=>item.eventType==="ALLOCATE"); if(!initial) continue;
    const last=ordered.at(-1)!; result.push(toAllocation(last,statusFor(last.eventType),initial.occurredAt));
  }
  return result;
}

function toAllocation(event:AllocationEvent,status:AllocationStatus,createdAt=event.occurredAt):Allocation {
  return {allocationId:event.allocationId,lotId:event.lotId,quantity:event.quantity,unit:event.unit,responsibleName:event.responsibleName,recipientName:event.recipientName,orderReference:event.orderReference,...(event.documentReference?{documentReference:event.documentReference}:{}),expiresAt:event.expiresAt,status,createdAt,updatedAt:event.occurredAt,lastEventId:event.eventId};
}
function statusFor(type:AllocationEventType):AllocationStatus { return type==="ALLOCATE"?"ACTIVE":type==="RELEASE"?"RELEASED":type==="SHIP"?"SHIPPED":"EXPIRED"; }
function referenceConflict(){ return new HttpError(409,"ALLOCATION_REFERENCE_CONFLICT","reference นี้ถูกใช้กับรายการ allocation อื่นแล้ว"); }
function deterministicAllocationId(reference:string){ return `ALLOC-${createHash("sha256").update(reference).digest("hex").slice(0,20).toUpperCase()}`; }
