import type { FarmerImportMapping, ImportMappingTemplate } from "../domain/types.js";
import { HttpError } from "../lib/http-error.js";
import { createId } from "../lib/ids.js";
import type { Repository } from "../repositories/repository.js";

export interface ImportMappingTemplateInput {
  name:string;
  sourceName:string;
  entityType:"FARMER";
  headers:string[];
  mapping:FarmerImportMapping;
}
export type ImportMappingTemplatePatch = { [K in keyof ImportMappingTemplateInput]?: ImportMappingTemplateInput[K] | undefined };

export class ImportMappingTemplateService {
  constructor(private readonly repository:Repository) {}

  async list(){ return this.repository.listImportMappingTemplates(); }

  async create(input:ImportMappingTemplateInput,actorId:string) {
    const normalized=normalizeAndValidate(input);
    await this.assertUniqueName(normalized.name);
    const now=new Date().toISOString();
    const template:ImportMappingTemplate={templateId:createId("IMPMAP"),...normalized,createdBy:actorId,updatedBy:actorId,createdAt:now,updatedAt:now};
    await this.repository.saveImportMappingTemplate(template);
    await this.repository.saveAuditEvent({auditId:createId("AUD"),entityType:"IMPORT_MAPPING_TEMPLATE",entityId:template.templateId,actorId,action:"IMPORT_MAPPING_TEMPLATE_CREATED",after:template,occurredAt:now});
    return template;
  }

  async update(templateId:string,input:ImportMappingTemplatePatch,actorId:string) {
    const before=await this.repository.getImportMappingTemplate(templateId);
    if(!before) throw new HttpError(404,"IMPORT_MAPPING_TEMPLATE_NOT_FOUND","ไม่พบแม่แบบการจับคู่คอลัมน์");
    const normalized=normalizeAndValidate({name:input.name??before.name,sourceName:input.sourceName??before.sourceName,entityType:input.entityType??before.entityType,headers:input.headers??before.headers,mapping:input.mapping??before.mapping});
    await this.assertUniqueName(normalized.name,templateId);
    const template:ImportMappingTemplate={...before,...normalized,updatedBy:actorId,updatedAt:new Date().toISOString()};
    await this.repository.saveImportMappingTemplate(template);
    await this.repository.saveAuditEvent({auditId:createId("AUD"),entityType:"IMPORT_MAPPING_TEMPLATE",entityId:templateId,actorId,action:"IMPORT_MAPPING_TEMPLATE_UPDATED",before,after:template,occurredAt:template.updatedAt});
    return template;
  }

  private async assertUniqueName(name:string,exceptId?:string) {
    const duplicate=(await this.repository.listImportMappingTemplates()).find((item)=>item.templateId!==exceptId&&item.name.toLocaleLowerCase("th-TH")===name.toLocaleLowerCase("th-TH"));
    if(duplicate) throw new HttpError(409,"IMPORT_MAPPING_TEMPLATE_NAME_EXISTS","มีชื่อแม่แบบนี้อยู่แล้ว");
  }
}

function normalizeAndValidate(input:ImportMappingTemplateInput):Pick<ImportMappingTemplate,"name"|"sourceName"|"entityType"|"headers"|"mapping"> {
  const name=input.name.trim(); const sourceName=input.sourceName.trim();
  if(!name || !sourceName) throw new HttpError(400,"IMPORT_MAPPING_TEMPLATE_INVALID","ชื่อแม่แบบและชื่อแหล่งข้อมูลต้องไม่ว่าง");
  const headers=input.headers.map((header)=>header.trim()).filter(Boolean);
  if(!headers.length || new Set(headers).size!==headers.length) throw new HttpError(400,"IMPORT_TEMPLATE_HEADERS_INVALID","รายการหัวคอลัมน์ต้องไม่ว่างและห้ามซ้ำกัน");
  const mapping=Object.fromEntries(Object.entries(input.mapping).map(([field,header])=>[field,header?.trim()]).filter((entry):entry is [string,string]=>Boolean(entry[1]))) as FarmerImportMapping;
  if(!mapping.memberCode || !mapping.displayName) throw new HttpError(400,"IMPORT_TEMPLATE_REQUIRED_MAPPING","ต้องจับคู่ memberCode และ displayName");
  const mapped=Object.values(mapping);
  if(new Set(mapped).size!==mapped.length) throw new HttpError(400,"IMPORT_TEMPLATE_DUPLICATE_MAPPING","หัวคอลัมน์หนึ่งช่องจับคู่ได้เพียงหนึ่งฟิลด์");
  const headerSet=new Set(headers);
  const missing=mapped.filter((header)=>!headerSet.has(header));
  if(missing.length) throw new HttpError(400,"IMPORT_TEMPLATE_HEADER_NOT_FOUND",`ไม่พบหัวคอลัมน์ในไฟล์: ${missing.join(", ")}`);
  return {name,sourceName,entityType:"FARMER",headers,mapping};
}
