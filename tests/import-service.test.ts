import assert from "node:assert/strict";
import { describe, it } from "node:test";
import ExcelJS from "exceljs";
import { HttpError } from "../src/lib/http-error.js";
import { MemoryRepository } from "../src/repositories/memory-repository.js";
import { ImportService } from "../src/services/import-service.js";

describe("ImportService", () => {
  it("parses CSV and XLSX without persistence", async () => {
    const repository = new MemoryRepository();
    const service = new ImportService(repository);
    const csv = '\uFEFFmember_code,full_name,address\r\nM-001,"สมชาย, ทดสอบ",ศรีสะเกษ\r\n';
    const parsed = await service.parseFile({ sourceName:"members.csv", contentBase64:Buffer.from(csv).toString("base64") });
    assert.equal(parsed.rows[0]?.full_name, "สมชาย, ทดสอบ");
    assert.equal(parsed.suggestedMapping.memberCode, "member_code");

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("members");
    sheet.addRow(["รหัสสมาชิก", "ชื่อเกษตรกร", "พื้นที่รวมไร่"]);
    sheet.addRow(["M-002", "สมหญิง", 4.5]);
    const content = await workbook.xlsx.writeBuffer();
    const xlsx = await service.parseFile({ sourceName:"members.xlsx", contentBase64:Buffer.from(content).toString("base64") });
    assert.equal(xlsx.rows[0]?.["พื้นที่รวมไร่"], "4.5");
    assert.equal(xlsx.suggestedMapping.displayName, "ชื่อเกษตรกร");
    assert.equal((await repository.listImportBatches()).length, 0);
  });

  it("validates mapped rows and produces an error report", async () => {
    const repository = new MemoryRepository();
    await repository.saveFarmer({ farmerId:"F-OLD", memberCode:"M-OLD", displayName:"สมาชิกเดิม", status:"ACTIVE" });
    const service = new ImportService(repository);
    const result = await service.preview({
      sourceName:"members.csv", mapping:{memberCode:"รหัส",displayName:"ชื่อ",registeredAt:"วันที่"},
      rows:[{รหัส:"M-NEW",ชื่อ:"สมาชิกใหม่",วันที่:"2026-10-19"},{รหัส:"M-OLD",ชื่อ:"ซ้ำ",วันที่:""},{รหัส:"",ชื่อ:"",วันที่:"19/10/2026"}]
    }, "admin");
    assert.deepEqual([result.batch.validRows,result.batch.duplicateRows,result.batch.errorRows],[1,1,1]);
    assert.match(await service.errorReportCsv(result.batch.batchId), /REQUIRED/);
    assert.equal((await repository.listFarmers()).length, 1);
  });

  it("commits a READY batch idempotently", async () => {
    const repository = new MemoryRepository();
    const service = new ImportService(repository);
    const preview = await service.preview({ sourceName:"members.csv", rows:[{member_code:"M-NEW",full_name:"สมาชิกใหม่",total_area_rai:"3.5"}] }, "admin");
    const committed = await service.commit(preview.batch.batchId, "admin", "ตรวจสอบไฟล์ต้นทางแล้ว");
    assert.equal(committed.batch.status, "COMMITTED");
    assert.equal((await repository.listFarmers())[0]?.totalAreaRai, 3.5);
    const retried = await service.commit(preview.batch.batchId, "admin", "ส่งซ้ำหลังเครือข่ายขาด");
    assert.equal(retried.reused, true);
    assert.equal((await repository.listFarmers()).length, 1);
  });

  it("records importer provenance and review decisions with audit snapshots", async () => {
    const repository = new MemoryRepository();
    const service = new ImportService(repository);
    const preview = await service.preview({ sourceName:"members.csv", rows:[{member_code:"M-REVIEW",full_name:"สมาชิกตรวจสอบ"}] }, "importer-1");
    const committed = await service.commit(preview.batch.batchId, "importer-1", "ตรวจไฟล์ต้นทางแล้ว");
    const committedRow = committed.rows[0]!;
    assert.equal(committedRow.importedBy, "importer-1");
    assert.ok(committedRow.importedAt);
    assert.equal(committedRow.verificationStatus, "PENDING");

    const verified = await service.reviewRow(preview.batch.batchId, committedRow.importRowId, "VERIFIED", "reviewer-1", "เทียบเอกสารต้นฉบับแล้ว");
    assert.equal(verified.row.verificationStatus, "VERIFIED");
    assert.equal(verified.row.reviewerId, "reviewer-1");
    assert.ok(verified.row.reviewedAt);
    assert.equal((await service.reviewRow(preview.batch.batchId, committedRow.importRowId, "VERIFIED", "reviewer-1", "ตรวจซ้ำเพื่อยืนยัน")).reused, true);

    const rejected = await service.reviewRow(preview.batch.batchId, committedRow.importRowId, "REJECTED", "reviewer-2", "ข้อมูลไม่ตรงเอกสารฉบับจริง");
    assert.equal(rejected.row.verificationStatus, "REJECTED");
    const audits = (await repository.listAuditEvents(preview.batch.batchId)).filter((event)=>event.action.startsWith("IMPORT_ROW_"));
    assert.equal(audits.length, 2);
    assert.equal((audits[1]?.before as {verificationStatus:string}).verificationStatus, "VERIFIED");
    assert.equal((audits[1]?.after as {verificationStatus:string}).verificationStatus, "REJECTED");
    assert.equal((await service.listBatches({verificationStatus:"REJECTED"})).batches[0]?.verification.rejected, 1);
  });

  it("rejects verification before commit or for an unknown row", async () => {
    const service = new ImportService(new MemoryRepository());
    const preview = await service.preview({ sourceName:"members.csv", rows:[{member_code:"M-PENDING",full_name:"สมาชิกรอตรวจ"}] }, "admin");
    await assert.rejects(() => service.reviewRow(preview.batch.batchId, preview.rows[0]!.importRowId, "VERIFIED", "reviewer", "ยังไม่ได้นำเข้า"), (error:unknown)=>error instanceof HttpError && error.code === "IMPORT_NOT_COMMITTED");
    await service.commit(preview.batch.batchId, "admin", "ตรวจไฟล์พร้อมนำเข้าแล้ว");
    await assert.rejects(() => service.reviewRow(preview.batch.batchId, "IMR-MISSING", "VERIFIED", "reviewer", "ไม่พบแถวข้อมูล"), (error:unknown)=>error instanceof HttpError && error.code === "IMPORT_ROW_NOT_FOUND");
  });

  it("voids only uncommitted batches", async () => {
    const repository = new MemoryRepository();
    const service = new ImportService(repository);
    const first = await service.preview({ sourceName:"a.csv", rows:[{member_code:"M-A",full_name:"สมาชิกเอ"}] }, "admin");
    assert.equal((await service.void(first.batch.batchId, "admin", "เลือกไฟล์ผิดชุด")).batch.status, "VOID");
    const second = await service.preview({ sourceName:"b.csv", rows:[{member_code:"M-B",full_name:"สมาชิกบี"}] }, "admin");
    await service.commit(second.batch.batchId, "admin", "ตรวจข้อมูลเรียบร้อย");
    await assert.rejects(() => service.void(second.batch.batchId, "admin", "ยกเลิกภายหลัง"), (error:unknown) => error instanceof HttpError && error.code === "IMPORT_ALREADY_COMMITTED");
  });

  it("rejects invalid file inputs", async () => {
    const service = new ImportService(new MemoryRepository());
    await assert.rejects(() => service.parseFile({ sourceName:"members.xls", contentBase64:"YQ==" }), (error:unknown) => error instanceof HttpError && error.status === 415);
    await assert.rejects(() => service.parseFile({ sourceName:"members.csv", contentBase64:"%%%" }), (error:unknown) => error instanceof HttpError && error.code === "IMPORT_BASE64");
  });
});
