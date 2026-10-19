import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import type { Farmer, ImportBatch, ImportIssue, ImportRow } from "../domain/types.js";
import { HttpError } from "../lib/http-error.js";
import { createId } from "../lib/ids.js";
import type { Repository } from "../repositories/repository.js";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 500;
const MAX_COLUMNS = 50;
const MAX_CELL_LENGTH = 500;
const FARMER_FIELDS = ["memberCode", "displayName", "lineUserId", "status", "address", "phone", "registeredAt", "totalAreaRai"] as const;
type FarmerField = typeof FARMER_FIELDS[number];
type ImportMapping = Partial<Record<FarmerField, string>>;

const aliases: Record<FarmerField, string[]> = {
  memberCode: ["membercode", "member_code", "farmer_id", "รหัสสมาชิก", "รหัสเกษตรกร"],
  displayName: ["displayname", "display_name", "full_name", "name", "ชื่อ", "ชื่อเกษตรกร"],
  lineUserId: ["lineuserid", "line_user_id", "ไลน์ไอดี"],
  status: ["status", "สถานะ"],
  address: ["address", "ที่อยู่"],
  phone: ["phone", "telephone", "เบอร์โทร", "โทรศัพท์"],
  registeredAt: ["registeredat", "registered_at", "วันที่ลงทะเบียน"],
  totalAreaRai: ["totalarearai", "total_area_rai", "พื้นที่รวม", "พื้นที่รวมไร่"]
};

export interface ParsedImportFile {
  sourceName: string;
  sourceType: "CSV" | "XLSX";
  headers: string[];
  rows: Record<string, unknown>[];
  suggestedMapping: ImportMapping;
}

export class ImportService {
  constructor(private readonly repository: Repository) {}

  async parseFile(input: { sourceName: string; contentBase64: string }): Promise<ParsedImportFile> {
    const sourceType = fileType(input.sourceName);
    const buffer = decodeBase64(input.contentBase64);
    if (buffer.length > MAX_FILE_BYTES) throw new HttpError(413, "IMPORT_FILE_TOO_LARGE", "ไฟล์ต้องมีขนาดไม่เกิน 2 MB");
    const matrix = sourceType === "CSV" ? parseCsv(buffer) : await parseXlsx(buffer);
    const { headers, rows } = matrixToRecords(matrix);
    return { sourceName: input.sourceName, sourceType, headers, rows, suggestedMapping: suggestMapping(headers) };
  }

  async preview(
    input: { sourceName: string; sourceType?: "CSV" | "XLSX" | undefined; rows: Record<string, unknown>[]; mapping?: ImportMapping | undefined },
    actorId: string
  ) {
    if (!input.rows.length || input.rows.length > MAX_ROWS) throw new HttpError(400, "IMPORT_ROW_LIMIT", "ไฟล์ตัวอย่างต้องมี 1–500 แถว");
    const mapping = input.mapping ?? {};
    validateMapping(mapping, input.rows);
    const normalized = input.rows.map((raw) => normalizeFarmer(raw, mapping));
    const checksum = createHash("sha256").update(JSON.stringify(canonical({ entityType:"FARMER", normalized }))).digest("hex");
    const existing = await this.repository.getImportBatchByChecksum(checksum, "FARMER");
    if (existing) return { batch:existing, rows:await this.repository.listImportRows(existing.batchId), reused:true };

    const farmers = await this.repository.listFarmers();
    const known = new Set(farmers.map((x) => x.memberCode.toLocaleLowerCase("en-US")));
    const seen = new Set<string>();
    const now = new Date().toISOString();
    const staged: ImportRow[] = input.rows.map((raw, index) => {
      const data = normalized[index]!;
      const issues = validateFarmer(data);
      const key = data.memberCode.toLocaleLowerCase("en-US");
      const duplicate = Boolean(key) && (known.has(key) || seen.has(key));
      if (key) seen.add(key);
      if (duplicate) issues.push({ field:"memberCode", code:"DUPLICATE", message:"รหัสสมาชิกซ้ำกับระบบหรือแถวก่อนหน้า" });
      return {
        importRowId:createId("IMR"), batchId:"", sourceRowNumber:index + 2, rawData:safeRecord(raw), normalizedData:{...data},
        rowStatus:duplicate ? "DUPLICATE" : issues.length ? "ERROR" : "VALID", issues, verificationStatus:"NOT_REQUIRED", createdAt:now, updatedAt:now
      };
    });
    const batchId = createId("IMP");
    staged.forEach((row) => { row.batchId = batchId; });
    const batch: ImportBatch = {
      batchId, sourceName:input.sourceName, sourceType:input.sourceType ?? "CSV", entityType:"FARMER", checksum,
      status:staged.every((row) => row.rowStatus === "VALID") ? "READY" : "PREVIEW", totalRows:staged.length,
      validRows:staged.filter((row) => row.rowStatus === "VALID").length,
      errorRows:staged.filter((row) => row.rowStatus === "ERROR").length,
      duplicateRows:staged.filter((row) => row.rowStatus === "DUPLICATE").length,
      createdBy:actorId, createdAt:now, updatedAt:now
    };
    await this.repository.saveImportBatch(batch);
    for (const row of staged) await this.repository.saveImportRow(row);
    await this.repository.saveAuditEvent({ auditId:createId("AUD"), entityType:"IMPORT_BATCH", entityId:batchId, actorId, action:"IMPORT_PREVIEW_CREATED", after:{ batch, mapping }, occurredAt:now });
    return { batch, rows:staged, reused:false };
  }

  async getBatch(batchId: string) {
    const batch = await this.requireBatch(batchId);
    return { batch, rows:await this.repository.listImportRows(batchId) };
  }

  async commit(batchId: string, actorId: string, reason: string) {
    const batch = await this.requireBatch(batchId);
    if (batch.status === "COMMITTED") { const rows=await this.repository.listImportRows(batchId); return { batch, rows, committedRows:rows.length, reused:true }; }
    if (batch.status !== "READY") throw new HttpError(409, "IMPORT_NOT_READY", "แก้ข้อมูลผิดพลาดหรือข้อมูลซ้ำให้เรียบร้อยก่อนนำเข้า");
    const rows = await this.repository.listImportRows(batchId);
    if (rows.length !== batch.totalRows || rows.some((row) => row.rowStatus !== "VALID" && row.rowStatus !== "COMMITTED")) {
      throw new HttpError(409, "IMPORT_ROWS_CHANGED", "ข้อมูล staging ไม่ตรงกับผล Preview กรุณาสร้าง Preview ใหม่");
    }
    const committedAt = new Date().toISOString();
    for (const row of rows) {
      const data = row.normalizedData as unknown as NormalizedFarmer;
      const farmerId = row.targetEntityId ?? deterministicFarmerId(batchId, row.sourceRowNumber);
      const existing = await this.repository.getFarmerByMemberCode(data.memberCode);
      if (existing && existing.farmerId !== farmerId) throw new HttpError(409, "IMPORT_MEMBER_CONFLICT", `รหัสสมาชิก ${data.memberCode} ถูกสร้างหลัง Preview`, { sourceRowNumber:row.sourceRowNumber });
      const farmer: Farmer = {
        farmerId, memberCode:data.memberCode, displayName:data.displayName, status:data.status,
        ...(data.lineUserId ? { lineUserId:data.lineUserId } : {}), ...(data.address ? { address:data.address } : {}),
        ...(data.phone ? { phone:data.phone } : {}), ...(data.registeredAt ? { registeredAt:data.registeredAt } : {}),
        ...(data.totalAreaRai !== undefined ? { totalAreaRai:data.totalAreaRai } : {})
      };
      await this.repository.saveFarmer(farmer);
      row.rowStatus = "COMMITTED"; row.targetEntityId = farmerId; row.importedBy = actorId; row.importedAt = committedAt;
      row.verificationStatus = "PENDING"; row.updatedAt = committedAt;
      await this.repository.saveImportRow(row);
      await this.repository.saveAuditEvent({ auditId:createId("AUD"), entityType:"FARMER", entityId:farmerId, actorId, action:"IMPORT_CREATE", reason, after:farmer, occurredAt:committedAt });
    }
    const committed: ImportBatch = { ...batch, status:"COMMITTED", updatedAt:committedAt };
    await this.repository.saveImportBatch(committed);
    await this.repository.saveAuditEvent({ auditId:createId("AUD"), entityType:"IMPORT_BATCH", entityId:batchId, actorId, action:"IMPORT_COMMITTED", reason, before:{ status:batch.status }, after:{ status:"COMMITTED", committedRows:rows.length }, occurredAt:committedAt });
    return { batch:committed, rows, committedRows:rows.length, reused:false };
  }

  async listBatches(input: { verificationStatus?: ImportRow["verificationStatus"]; limit?: number } = {}) {
    const batches = (await this.repository.listImportBatches()).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
    const results = [];
    for (const batch of batches) {
      const rows = await this.repository.listImportRows(batch.batchId);
      const verification = {
        pending:rows.filter((row)=>row.verificationStatus === "PENDING").length,
        verified:rows.filter((row)=>row.verificationStatus === "VERIFIED").length,
        rejected:rows.filter((row)=>row.verificationStatus === "REJECTED").length,
        notRequired:rows.filter((row)=>row.verificationStatus === "NOT_REQUIRED").length
      };
      if (input.verificationStatus && !rows.some((row)=>row.verificationStatus===input.verificationStatus)) continue;
      results.push({ batch, verification });
      if (results.length >= (input.limit ?? 50)) break;
    }
    return { batches:results };
  }

  async reviewRow(batchId:string, rowId:string, decision:"VERIFIED"|"REJECTED", reviewerId:string, reason:string) {
    const batch = await this.requireBatch(batchId);
    if (batch.status !== "COMMITTED") throw new HttpError(409,"IMPORT_NOT_COMMITTED","ตรวจยืนยันได้เฉพาะรายการที่นำเข้าแล้ว");
    const row = (await this.repository.listImportRows(batchId)).find((item)=>item.importRowId===rowId);
    if (!row) throw new HttpError(404,"IMPORT_ROW_NOT_FOUND","ไม่พบแถวข้อมูลนำเข้า");
    if (row.rowStatus !== "COMMITTED" || !row.targetEntityId) throw new HttpError(409,"IMPORT_ROW_NOT_COMMITTED","แถวนี้ยังไม่มีข้อมูลปลายทางให้ตรวจยืนยัน");
    if (row.verificationStatus === decision) return { row, reused:true };
    const before = structuredClone(row);
    const reviewedAt = new Date().toISOString();
    const updated:ImportRow = { ...row, verificationStatus:decision, reviewerId, reviewedAt, reviewReason:reason, updatedAt:reviewedAt };
    await this.repository.saveImportRow(updated);
    await this.repository.saveAuditEvent({
      auditId:createId("AUD"), entityType:"IMPORT_BATCH", entityId:batchId, actorId:reviewerId,
      action:decision === "VERIFIED" ? "IMPORT_ROW_VERIFIED" : "IMPORT_ROW_REJECTED", reason,
      before, after:updated, occurredAt:reviewedAt
    });
    return { row:updated, reused:false };
  }

  async void(batchId: string, actorId: string, reason: string) {
    const batch = await this.requireBatch(batchId);
    if (batch.status === "VOID") return { batch, reused:true };
    if (batch.status === "COMMITTED") throw new HttpError(409, "IMPORT_ALREADY_COMMITTED", "batch ที่นำเข้าแล้วต้องแก้ด้วยกระบวนการชดเชย ห้ามลบประวัติ");
    const now = new Date().toISOString();
    const voided: ImportBatch = { ...batch, status:"VOID", updatedAt:now };
    await this.repository.saveImportBatch(voided);
    await this.repository.saveAuditEvent({ auditId:createId("AUD"), entityType:"IMPORT_BATCH", entityId:batchId, actorId, action:"IMPORT_VOIDED", reason, before:{ status:batch.status }, after:{ status:"VOID" }, occurredAt:now });
    return { batch:voided, reused:false };
  }

  async errorReportCsv(batchId: string) {
    const { batch, rows } = await this.getBatch(batchId);
    const lines = [["batch_id", "source_row", "status", "field", "code", "message"]];
    for (const row of rows) {
      if (!row.issues.length) continue;
      for (const issue of row.issues) lines.push([batch.batchId, String(row.sourceRowNumber), row.rowStatus, issue.field ?? "", issue.code, issue.message]);
    }
    return `\uFEFF${lines.map((line) => line.map(csvCell).join(",")).join("\r\n")}\r\n`;
  }

  private async requireBatch(batchId: string) {
    const batch = await this.repository.getImportBatch(batchId);
    if (!batch) throw new HttpError(404, "IMPORT_BATCH_NOT_FOUND", "ไม่พบ Import batch");
    return batch;
  }
}

interface NormalizedFarmer { memberCode:string; displayName:string; lineUserId:string; status:"ACTIVE"|"INACTIVE"; address:string; phone:string; registeredAt:string; totalAreaRai?:number; }

function normalizeFarmer(raw: Record<string, unknown>, mapping: ImportMapping): NormalizedFarmer {
  const read = (field: FarmerField) => {
    const mapped = mapping[field];
    if (mapped) return raw[mapped];
    const wanted = new Set(aliases[field]);
    const key = Object.keys(raw).find((candidate) => wanted.has(normalizeHeader(candidate)));
    return key ? raw[key] : undefined;
  };
  const areaText = text(read("totalAreaRai"));
  const statusText = text(read("status")).toUpperCase();
  return {
    memberCode:text(read("memberCode")), displayName:text(read("displayName")), lineUserId:text(read("lineUserId")),
    status:statusText === "INACTIVE" || statusText === "ไม่ใช้งาน" ? "INACTIVE" : "ACTIVE",
    address:text(read("address")), phone:text(read("phone")), registeredAt:normalizeDate(read("registeredAt")),
    ...(areaText ? { totalAreaRai:Number(areaText.replace(/,/g, "")) } : {})
  };
}

function validateFarmer(data: NormalizedFarmer): ImportIssue[] {
  const issues: ImportIssue[] = [];
  if (!data.memberCode) issues.push({ field:"memberCode", code:"REQUIRED", message:"ไม่มีรหัสสมาชิก" });
  else if (!/^[A-Za-z0-9_-]{2,30}$/.test(data.memberCode)) issues.push({ field:"memberCode", code:"FORMAT", message:"รหัสสมาชิกต้องมี 2–30 ตัวและใช้ตัวอักษร ตัวเลข _ -" });
  if (!data.displayName) issues.push({ field:"displayName", code:"REQUIRED", message:"ไม่มีชื่อเกษตรกร" });
  else if (data.displayName.length > 120) issues.push({ field:"displayName", code:"MAX_LENGTH", message:"ชื่อเกษตรกรยาวเกิน 120 ตัวอักษร" });
  if (data.registeredAt && !/^\d{4}-\d{2}-\d{2}$/.test(data.registeredAt)) issues.push({ field:"registeredAt", code:"DATE_FORMAT", message:"วันที่ต้องเป็น YYYY-MM-DD" });
  if (data.totalAreaRai !== undefined && (!Number.isFinite(data.totalAreaRai) || data.totalAreaRai < 0)) issues.push({ field:"totalAreaRai", code:"NUMBER", message:"พื้นที่รวมต้องเป็นเลขตั้งแต่ 0 ขึ้นไป" });
  if (data.phone.length > 30) issues.push({ field:"phone", code:"MAX_LENGTH", message:"เบอร์โทรยาวเกิน 30 ตัวอักษร" });
  return issues;
}

function validateMapping(mapping: ImportMapping, rows: Record<string, unknown>[]) {
  const unknown = Object.keys(mapping).filter((key) => !FARMER_FIELDS.includes(key as FarmerField));
  if (unknown.length) throw new HttpError(400, "IMPORT_MAPPING_FIELD", "mapping มีชื่อช่องปลายทางที่ไม่รองรับ", { fields:unknown });
  const headers = new Set(rows.flatMap((row) => Object.keys(row)));
  const missing = Object.values(mapping).filter((header): header is string => Boolean(header) && !headers.has(header));
  if (missing.length) throw new HttpError(400, "IMPORT_MAPPING_HEADER", "ไม่พบคอลัมน์ต้นทางตาม mapping", { headers:missing });
  const used = Object.values(mapping).filter(Boolean);
  if (new Set(used).size !== used.length) throw new HttpError(400, "IMPORT_MAPPING_DUPLICATE", "หนึ่งคอลัมน์ต้นทางจับคู่ได้กับช่องปลายทางเดียว");
}

function fileType(sourceName: string): "CSV"|"XLSX" {
  const lower = sourceName.toLocaleLowerCase("en-US");
  if (lower.endsWith(".csv")) return "CSV";
  if (lower.endsWith(".xlsx")) return "XLSX";
  throw new HttpError(415, "IMPORT_FILE_TYPE", "รองรับเฉพาะไฟล์ .csv และ .xlsx");
}

function decodeBase64(value: string) {
  if (!value || value.length > Math.ceil(MAX_FILE_BYTES / 3) * 4 + 16 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new HttpError(400, "IMPORT_BASE64", "ข้อมูลไฟล์ base64 ไม่ถูกต้อง");
  const buffer = Buffer.from(value, "base64");
  if (!buffer.length || buffer.toString("base64").replace(/=+$/, "") !== value.replace(/=+$/, "")) throw new HttpError(400, "IMPORT_BASE64", "ข้อมูลไฟล์ base64 ไม่ถูกต้อง");
  return buffer;
}

function parseCsv(buffer: Buffer): string[][] {
  const decoded = buffer.toString("utf8").replace(/^\uFEFF/, "");
  if (decoded.includes("\uFFFD")) throw new HttpError(400, "IMPORT_CSV_ENCODING", "CSV ต้องเข้ารหัสแบบ UTF-8");
  const rows:string[][]=[]; let row:string[]=[]; let cell=""; let quoted=false;
  for(let i=0;i<decoded.length;i++){
    const char=decoded[i]!;
    if(quoted){ if(char==='"'&&decoded[i+1]==='"'){cell+='"';i++;}else if(char==='"')quoted=false;else cell+=char; }
    else if(char==='"'&&!cell)quoted=true;
    else if(char===","){row.push(cell);cell="";}
    else if(char==="\n"){row.push(cell.replace(/\r$/, ""));rows.push(row);row=[];cell="";}
    else cell+=char;
    if(cell.length>MAX_CELL_LENGTH) throw new HttpError(400,"IMPORT_CELL_TOO_LONG",`ข้อมูลในหนึ่งช่องต้องไม่เกิน ${MAX_CELL_LENGTH} ตัวอักษร`);
  }
  if(quoted) throw new HttpError(400,"IMPORT_CSV_QUOTE","CSV มีเครื่องหมายคำพูดที่ปิดไม่ครบ");
  if(cell||row.length){row.push(cell.replace(/\r$/, ""));rows.push(row);}
  return rows;
}

async function parseXlsx(buffer: Buffer): Promise<string[][]> {
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) throw new HttpError(400, "IMPORT_XLSX_SIGNATURE", "เนื้อหาไฟล์ XLSX ไม่ถูกต้อง");
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    if (workbook.worksheets.length !== 1) throw new HttpError(400, "IMPORT_XLSX_SHEETS", "ไฟล์ XLSX ต้องมี worksheet เดียว");
    const sheet=workbook.worksheets[0]!; const rows:string[][]=[];
    sheet.eachRow({includeEmpty:true},(excelRow)=>{ const values:string[]=[]; for(let col=1;col<=excelRow.cellCount;col++) values.push(cellText(excelRow.getCell(col).value)); rows.push(values); });
    return rows;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "IMPORT_XLSX_INVALID", "ไม่สามารถอ่านไฟล์ XLSX ได้");
  }
}

function cellText(value: ExcelJS.CellValue): string {
  if(value===null||value===undefined) return "";
  if(value instanceof Date) return value.toISOString().slice(0,10);
  if(typeof value==="object") {
    if("text" in value) return String(value.text);
    if("result" in value) return text(value.result);
    if("richText" in value) return value.richText.map((part)=>part.text).join("");
    throw new HttpError(400,"IMPORT_XLSX_CELL_TYPE","พบชนิดข้อมูลใน XLSX ที่ไม่รองรับ");
  }
  return text(value);
}

function matrixToRecords(matrix: string[][]) {
  while(matrix.length && matrix[matrix.length-1]!.every((value)=>!value.trim())) matrix.pop();
  if(matrix.length<2) throw new HttpError(400,"IMPORT_EMPTY","ไฟล์ต้องมีหัวตารางและข้อมูลอย่างน้อย 1 แถว");
  if(matrix.length-1>MAX_ROWS) throw new HttpError(400,"IMPORT_ROW_LIMIT",`ไฟล์ต้องมีข้อมูลไม่เกิน ${MAX_ROWS} แถว`);
  const width=Math.max(...matrix.map((row)=>row.length));
  if(width>MAX_COLUMNS) throw new HttpError(400,"IMPORT_COLUMN_LIMIT",`ไฟล์ต้องมีไม่เกิน ${MAX_COLUMNS} คอลัมน์`);
  const headers=Array.from({length:width},(_,i)=>text(matrix[0]![i]));
  if(headers.some((header)=>!header)) throw new HttpError(400,"IMPORT_HEADER_EMPTY","หัวคอลัมน์ห้ามว่าง");
  if(new Set(headers.map(normalizeHeader)).size!==headers.length) throw new HttpError(400,"IMPORT_HEADER_DUPLICATE","หัวคอลัมน์ห้ามซ้ำกัน");
  if(headers.some((header)=>header.length>120)) throw new HttpError(400,"IMPORT_HEADER_LENGTH","หัวคอลัมน์ต้องไม่เกิน 120 ตัวอักษร");
  const rows=matrix.slice(1)
    .filter((row)=>row.some((value)=>value.trim()))
    .map((row)=>Object.fromEntries(headers.map((header,index)=>[header,text(row[index])] as const)));
  if(!rows.length) throw new HttpError(400,"IMPORT_EMPTY","ไม่พบแถวข้อมูลในไฟล์");
  return {headers,rows};
}

function suggestMapping(headers:string[]):ImportMapping { const result:ImportMapping={}; for(const field of FARMER_FIELDS){const match=headers.find((header)=>aliases[field].includes(normalizeHeader(header)));if(match)result[field]=match;} return result; }
function normalizeHeader(value:string){return value.trim().toLocaleLowerCase("en-US").replace(/[\s-]+/g,"_");}
function normalizeDate(value:unknown){if(value instanceof Date)return value.toISOString().slice(0,10);return text(value);}
function text(value:unknown){const result=value===null||value===undefined?"":String(value).trim();if(result.length>MAX_CELL_LENGTH)throw new HttpError(400,"IMPORT_CELL_TOO_LONG",`ข้อมูลในหนึ่งช่องต้องไม่เกิน ${MAX_CELL_LENGTH} ตัวอักษร`);return result;}
function safeRecord(value:Record<string,unknown>){return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,text(item)]));}
function deterministicFarmerId(batchId:string,row:number){return `FARM-IMP-${createHash("sha256").update(`${batchId}:${row}`).digest("hex").slice(0,24)}`;}
function csvCell(value:string){const protectedValue=/^[=+\-@\t\r]/.test(value)?`'${value}`:value;return `"${protectedValue.replace(/"/g,'""')}"`;}
function canonical(value:unknown):unknown{if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)]));return value;}
