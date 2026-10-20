import type { Repository } from "../repositories/repository.js";
import type { StockBalance, StockMovement, StockMovementType } from "../domain/types.js";
import { HttpError } from "../lib/http-error.js";
import { createId } from "../lib/ids.js";

const round = (value:number) => Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;

export interface RecordStockMovementInput {
  lotId:string;
  movementType:StockMovementType;
  quantity:number;
  unit:string;
  actorId:string;
  reason:string;
  reference:string;
  occurredAt?:string;
}

export class StockService {
  constructor(private readonly repository:Repository) {}

  async getBalance(lotId:string):Promise<StockBalance> {
    const lot=await this.repository.getLot(lotId);
    if(!lot) throw new HttpError(404,"LOT_NOT_FOUND","ไม่พบล็อตที่ค้นหา");
    const balance=deriveStockBalance(lotId,lot.unit,await this.repository.listStockMovements(lotId));
    const standards=await this.repository.listLotStandardHistory(lotId);
    const current=[...standards].sort((a,b)=>b.effectiveAt.localeCompare(a.effectiveAt)||b.recordedAt.localeCompare(a.recordedAt))[0];
    const unavailable=["VOID","RECALLED"].includes(lot.inventoryStatus)||Boolean(current&&["ON_HOLD","REJECTED"].includes(current.status));
    return unavailable?{...balance,available:0,recalled:balance.recalled||lot.inventoryStatus==="RECALLED"}:balance;
  }

  async record(input:RecordStockMovementInput):Promise<{movement:StockMovement;balance:StockBalance;created:boolean}> {
    const lot=await this.repository.getLot(input.lotId);
    if(!lot) throw new HttpError(404,"LOT_NOT_FOUND","ไม่พบล็อตที่ค้นหา");
    const reference=input.reference.trim();
    const existing=await this.repository.getStockMovementByReference(lot.lotId,reference);
    if(existing) {
      if(existing.movementType!==input.movementType || existing.quantity!==input.quantity || existing.unit!==input.unit) {
        throw new HttpError(409,"STOCK_REFERENCE_CONFLICT","reference นี้ถูกใช้กับรายการเคลื่อนไหวที่มีข้อมูลต่างกันแล้ว");
      }
      return {movement:existing,balance:await this.getBalance(lot.lotId),created:false};
    }
    if(input.unit.trim()!==lot.unit) throw new HttpError(409,"STOCK_UNIT_MISMATCH",`หน่วยต้องตรงกับล็อต (${lot.unit})`);
    if(!Number.isFinite(input.quantity) || input.quantity===0 || (input.movementType!=="ADJUST" && input.quantity<0)) {
      throw new HttpError(400,"INVALID_STOCK_QUANTITY","ปริมาณต้องมากกว่า 0; เฉพาะ ADJUST เท่านั้นที่เป็นค่าลบได้");
    }
    const before=await this.getBalance(lot.lotId);
    if(before.available===0 && ["RESERVE","SHIP"].includes(input.movementType) && ["VOID","RECALLED"].includes(lot.inventoryStatus)) {
      throw new HttpError(409,"LOT_NOT_AVAILABLE","ล็อตถูกระงับหรือเรียกคืน จึงไม่สามารถจองหรือจ่ายออกได้");
    }
    if(before.recalled && !["RELEASE","RECALL"].includes(input.movementType)) {
      throw new HttpError(409,"LOT_RECALLED","ล็อตถูกเรียกคืนแล้ว ไม่สามารถเคลื่อนไหวสินค้าเพิ่มได้");
    }
    const movement:StockMovement={movementId:createId("MOV"),lotId:lot.lotId,movementType:input.movementType,quantity:round(input.quantity),unit:lot.unit,actorId:input.actorId,reason:input.reason.trim(),reference,occurredAt:input.occurredAt ?? new Date().toISOString()};
    const after=deriveStockBalance(lot.lotId,lot.unit,[...(await this.repository.listStockMovements(lot.lotId)),movement]);
    validateTransition(input.movementType,before,after,input.quantity);
    await this.repository.appendStockMovement(movement);
    await this.repository.saveAuditEvent({auditId:createId("AUD"),entityType:"STOCK_MOVEMENT",entityId:movement.movementId,actorId:input.actorId,action:`STOCK_${input.movementType}`,reason:input.reason,before,after:{movement,balance:after},occurredAt:movement.occurredAt});
    return {movement,balance:after,created:true};
  }

  async receiveLot(lotId:string,actorId:string,reference:string) {
    const lot=await this.repository.getLot(lotId);
    if(!lot) throw new HttpError(404,"LOT_NOT_FOUND","ไม่พบล็อตที่ค้นหา");
    return this.record({lotId,movementType:"RECEIVE",quantity:lot.quantity,unit:lot.unit,actorId,reason:"รับผลผลิตจากกิจกรรมเก็บเกี่ยว",reference});
  }
}

export function deriveStockBalance(lotId:string,unit:string,movements:StockMovement[]):StockBalance {
  let onHand=0, reserved=0, recalled=false, updatedAt:string|undefined;
  for(const item of [...movements].sort((a,b)=>a.occurredAt.localeCompare(b.occurredAt)||a.movementId.localeCompare(b.movementId))) {
    if(item.unit!==unit) throw new HttpError(409,"STOCK_UNIT_MISMATCH",`พบรายการเคลื่อนไหวหน่วย ${item.unit} ซึ่งไม่ตรงกับล็อต ${unit}`);
    switch(item.movementType) {
      case "RECEIVE": onHand+=item.quantity; break;
      case "RESERVE": reserved+=item.quantity; break;
      case "RELEASE": reserved-=item.quantity; break;
      case "SHIP": { const againstReservation=Math.min(reserved,item.quantity); reserved-=againstReservation; onHand-=item.quantity; break; }
      case "ADJUST": onHand+=item.quantity; break;
      case "RECALL": recalled=true; break;
    }
    onHand=round(onHand); reserved=round(reserved); updatedAt=item.occurredAt;
    if(onHand<0 || reserved<0 || reserved>onHand) throw new HttpError(409,"NEGATIVE_STOCK_BALANCE","รายการเคลื่อนไหวทำให้ยอดคงเหลือหรือยอดพร้อมใช้ติดลบ");
  }
  return {lotId,unit,onHand,reserved,available:recalled?0:round(onHand-reserved),recalled,...(updatedAt?{updatedAt}:{})};
}

function validateTransition(type:StockMovementType,before:StockBalance,after:StockBalance,quantity:number) {
  if(type==="RELEASE" && quantity>before.reserved) throw new HttpError(409,"RELEASE_EXCEEDS_RESERVED","จำนวนที่ปลดจองมากกว่ายอดจอง");
  if(type==="RESERVE" && quantity>before.available) throw new HttpError(409,"RESERVE_EXCEEDS_AVAILABLE","จำนวนที่จองมากกว่ายอดพร้อมใช้");
  if(type==="SHIP" && quantity>before.onHand) throw new HttpError(409,"SHIP_EXCEEDS_ON_HAND","จำนวนที่จ่ายออกมากกว่ายอดคงเหลือ");
  if(after.onHand<0 || after.reserved<0 || after.available<0) throw new HttpError(409,"NEGATIVE_STOCK_BALANCE","รายการเคลื่อนไหวทำให้ยอดติดลบ");
}
