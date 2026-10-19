import assert from "node:assert/strict";
import { describe,it } from "node:test";
import { MemoryRepository } from "../src/repositories/memory-repository.js";
import { ImportMappingTemplateService } from "../src/services/import-mapping-template-service.js";

const valid={name:"ทะเบียนสมาชิกเดิม",sourceName:"members.csv",entityType:"FARMER" as const,headers:["member_id","full_name","telephone"],mapping:{memberCode:"member_id",displayName:"full_name",phone:"telephone"}};

describe("ImportMappingTemplateService",()=>{
  it("creates, lists and updates a reusable audited mapping",async()=>{
    const repository=new MemoryRepository(); const service=new ImportMappingTemplateService(repository);
    const created=await service.create(valid,"admin-1");
    assert.equal((await service.list())[0]?.templateId,created.templateId);
    const updated=await service.update(created.templateId,{name:"ทะเบียนสมาชิกชุมชน"},"admin-2");
    assert.equal(updated.createdBy,"admin-1"); assert.equal(updated.updatedBy,"admin-2");
    const audit=await repository.listAuditEvents(created.templateId);
    assert.deepEqual(audit.map((item)=>item.action),["IMPORT_MAPPING_TEMPLATE_CREATED","IMPORT_MAPPING_TEMPLATE_UPDATED"]);
    assert.equal((audit[1]?.before as {name:string}).name,"ทะเบียนสมาชิกเดิม");
  });

  it("rejects missing required fields, unknown headers and ambiguous mappings",async()=>{
    const service=new ImportMappingTemplateService(new MemoryRepository());
    await assert.rejects(()=>service.create({...valid,mapping:{displayName:"full_name"}},"admin"),/memberCode/);
    await assert.rejects(()=>service.create({...valid,mapping:{memberCode:"missing",displayName:"full_name"}},"admin"),/ไม่พบหัวคอลัมน์/);
    await assert.rejects(()=>service.create({...valid,mapping:{memberCode:"member_id",displayName:"member_id"}},"admin"),/หนึ่งฟิลด์/);
  });

  it("rejects duplicate template names",async()=>{
    const service=new ImportMappingTemplateService(new MemoryRepository());
    await service.create(valid,"admin");
    await assert.rejects(()=>service.create({...valid,name:"ทะเบียนสมาชิกเดิม",sourceName:"other.xlsx"},"admin"),/ชื่อแม่แบบ/);
  });
});
