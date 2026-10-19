import { createHash } from "node:crypto";
import type { ImportBatch, ImportIssue, ImportRow } from "../domain/types.js";
import { HttpError } from "../lib/http-error.js";
import { createId } from "../lib/ids.js";
import type { Repository } from "../repositories/repository.js";

export class ImportService {
  constructor(private readonly repository:Repository){}
  async preview(input:{sourceName:string;rows:Record<string,unknown>[]},actorId:string){
    if(!input.rows.length||input.rows.length>500) throw new HttpError(400,"IMPORT_ROW_LIMIT","ไฟล์ตัวอย่างต้องมี 1–500 แถว");
    const checksum=createHash("sha256").update(JSON.stringify(canonical(input.rows))).digest("hex");
    const existing=await this.repository.getImportBatchByChecksum(checksum,"FARMER");
    if(existing) return {batch:existing,rows:await this.repository.listImportRows(existing.batchId),reused:true};
    const farmers=await this.repository.listFarmers(); const known=new Set(farmers.map((x)=>x.memberCode.toLowerCase())); const seen=new Set<string>(); const now=new Date().toISOString();
    const staged:ImportRow[]=input.rows.map((raw,index)=>{
      const memberCode=String(raw.member_code??raw.memberCode??"").trim(); const displayName=String(raw.display_name??raw.displayName??raw.full_name??"").trim(); const issues:ImportIssue[]=[];
      if(!memberCode) issues.push({field:"member_code",code:"REQUIRED",message:"ไม่มีรหัสสมาชิก"});
      else if(!/^[A-Za-z0-9_-]{2,30}$/.test(memberCode)) issues.push({field:"member_code",code:"FORMAT",message:"รหัสสมาชิกต้องมี 2–30 ตัวและใช้ตัวอักษร ตัวเลข _ -"});
      if(!displayName) issues.push({field:"display_name",code:"REQUIRED",message:"ไม่มีชื่อเกษตรกร"});
      const duplicate=Boolean(memberCode)&&(known.has(memberCode.toLowerCase())||seen.has(memberCode.toLowerCase())); if(memberCode) seen.add(memberCode.toLowerCase());
      if(duplicate) issues.push({field:"member_code",code:"DUPLICATE",message:"รหัสสมาชิกซ้ำกับระบบหรือแถวก่อนหน้า"});
      return {importRowId:createId("IMR"),batchId:"",sourceRowNumber:index+2,rawData:raw,normalizedData:{memberCode,displayName,status:"ACTIVE"},rowStatus:duplicate?"DUPLICATE":issues.length?"ERROR":"VALID",issues,createdAt:now,updatedAt:now};
    });
    const batchId=createId("IMP"); staged.forEach((x)=>x.batchId=batchId);
    const batch:ImportBatch={batchId,sourceName:input.sourceName,sourceType:"CSV",entityType:"FARMER",checksum,status:staged.every((x)=>x.rowStatus==="VALID")?"READY":"PREVIEW",totalRows:staged.length,validRows:staged.filter((x)=>x.rowStatus==="VALID").length,errorRows:staged.filter((x)=>x.rowStatus==="ERROR").length,duplicateRows:staged.filter((x)=>x.rowStatus==="DUPLICATE").length,createdBy:actorId,createdAt:now,updatedAt:now};
    await this.repository.saveImportBatch(batch); for(const row of staged) await this.repository.saveImportRow(row);
    await this.repository.saveAuditEvent({auditId:createId("AUD"),entityType:"IMPORT_BATCH",entityId:batchId,actorId,action:"IMPORT_PREVIEW_CREATED",after:{batch},occurredAt:now});
    return {batch,rows:staged,reused:false};
  }
}
function canonical(value:unknown):unknown{if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)]));return value;}
