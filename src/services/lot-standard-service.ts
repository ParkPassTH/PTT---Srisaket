import type { LotStandardCode, LotStandardDefinition, LotStandardHistory } from "../domain/types.js";
import type { Repository } from "../repositories/repository.js";
import { HttpError } from "../lib/http-error.js";
import { createId } from "../lib/ids.js";

export class LotStandardService {
  constructor(private readonly repository:Repository) {}

  async listDefinitions(){ return this.repository.listLotStandardDefinitions(); }

  async saveDefinition(input:{definitionId?:string;code:LotStandardCode;name:string;description:string;active:boolean},actorId:string){
    const existing=input.definitionId?await this.repository.getLotStandardDefinition(input.definitionId):undefined;
    const duplicate=(await this.repository.listLotStandardDefinitions()).find((x)=>x.code===input.code&&x.definitionId!==input.definitionId);
    if(duplicate) throw new HttpError(409,"STANDARD_CODE_EXISTS","มีคำนิยามสถานะนี้แล้ว กรุณาแก้ไขรายการเดิม");
    const now=new Date().toISOString();
    const definition:LotStandardDefinition={definitionId:existing?.definitionId??createId("STD"),code:input.code,name:input.name.trim(),description:input.description.trim(),active:input.active,createdBy:existing?.createdBy??actorId,createdAt:existing?.createdAt??now,updatedBy:actorId,updatedAt:now};
    await this.repository.saveLotStandardDefinition(definition);
    await this.repository.saveAuditEvent({auditId:createId("AUD"),entityType:"STANDARD_DEFINITION",entityId:definition.definitionId,actorId,action:existing?"UPDATE":"CREATE",...(existing?{before:existing}:{}),after:definition,occurredAt:now});
    return definition;
  }

  async getLotStandard(lotId:string){
    if(!await this.repository.getLot(lotId)) throw new HttpError(404,"LOT_NOT_FOUND","ไม่พบล็อตที่ค้นหา");
    const [definitions,history]=await Promise.all([this.repository.listLotStandardDefinitions(),this.repository.listLotStandardHistory(lotId)]);
    const current=[...history].sort((a,b)=>b.effectiveAt.localeCompare(a.effectiveAt)||b.recordedAt.localeCompare(a.recordedAt))[0];
    return { definitions:definitions.filter((x)=>x.active), history, current, availabilityEligible:current? !["ON_HOLD","REJECTED"].includes(current.status):null };
  }

  async record(lotId:string,input:{definitionId:string;reason:string;evidenceReference:string;effectiveAt:string},actorId:string){
    if(!await this.repository.getLot(lotId)) throw new HttpError(404,"LOT_NOT_FOUND","ไม่พบล็อตที่ค้นหา");
    const definition=await this.repository.getLotStandardDefinition(input.definitionId);
    if(!definition||!definition.active) throw new HttpError(409,"STANDARD_NOT_CONFIGURED","สถานะนี้ยังไม่ได้กำหนดหรือถูกพักใช้โดย ICS");
    const recordedAt=new Date().toISOString();
    const history:LotStandardHistory={historyId:createId("STDH"),lotId,definitionId:definition.definitionId,status:definition.code,actorId,reason:input.reason.trim(),evidenceReference:input.evidenceReference.trim(),effectiveAt:input.effectiveAt,recordedAt};
    await this.repository.appendLotStandardHistory(history);
    await this.repository.saveAuditEvent({auditId:createId("AUD"),entityType:"LOT_STANDARD",entityId:lotId,actorId,action:`STANDARD_${definition.code}`,reason:history.reason,after:history,occurredAt:recordedAt});
    return {recorded:history,...await this.getLotStandard(lotId)};
  }
}
