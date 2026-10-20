# Project Tasks

> ทุก task ต้องอ้างอิง Feature ID เมื่อเกี่ยวข้อง และอัปเดตสถานะพร้อม `WORKLOG.md`
>
> อัปเดตล่าสุด: 19 ตุลาคม 2569

## สถานะ

- `[ ]` ยังไม่เริ่ม
- `[-]` กำลังทำ
- `[x]` เสร็จและตรวจแล้ว
- `[!]` ติดปัญหา
- `[~]` เลื่อนออกไป

## Phase 0 — Discovery และข้อกำหนด

- [x] T-001 อ่าน comprehensive brief
- [x] T-002 ยืนยัน stack: Node.js + Express + custom Web Dashboard
- [x] T-003 ยืนยันเป้าหมาย: production-ready และ deploy ได้
- [x] T-004 สร้าง `PRODUCT.md`
- [x] T-005 สร้าง system flow สำหรับนำเสนอ
- [x] T-006 สร้างทะเบียนฟีเจอร์และขอบเขต
- [x] T-007 เลือกทิศทาง UX/UI ตาม Impeccable — สมุดตรวจสหกรณ์
- [ ] T-008 ยืนยันรายการสาร กฎ และผู้มีอำนาจอนุมัติ
- [ ] T-009 ยืนยัน privacy/retention policy ของเสียงและข้อมูลเกษตรกร
- [ ] T-010 ให้ผู้จัดการ ICS/หน่วยรับรองอนุมัติ checklist, controlled input list และ sanction matrix ใน `docs/ICS_RECORDING_GUIDE.md`
- [ ] T-011 สัมภาษณ์ผู้ถือข้อมูลและทำ data inventory: กระดาษ, Excel/CSV, Google Sheets, โปรแกรมเดิม — F-035
- [ ] T-012 ขอ sample ที่ปกปิดข้อมูลและหนังสืออนุญาตใช้ในการ PoC — F-035, F-044
- [ ] T-013 ทำ field mapping/data contract และนิยาม required fields, วันที่, หน่วย, T1/T2 กับผู้รับผิดชอบ — F-035, F-041
- [ ] T-014 เก็บ baseline กระบวนการเดิม: เวลา, จุดกรอกซ้ำ, ข้อมูลขาด, จำนวนครั้งแก้ และความคลาดเคลื่อนล็อต — F-043, F-044

## Phase 1 — Architecture และ Foundation

- [ ] T-101 สรุป architecture decision records
- [x] T-102 สร้าง project scaffold และ workspace scripts
- [x] T-103 สร้าง environment schema และ `.env.example` — F-028
- [x] T-104 สร้าง domain entities และ repository contracts — F-023
- [x] T-105 สร้าง Google Sheets adapter — F-023
- [x] T-105A จัดทำคู่มือต่อ Sheets/LINE/OpenAI และ acceptance tests — F-023, F-029, F-030
- [x] T-106 สร้าง error model และ structured logging — F-025, F-026
- [~] T-107 สร้าง authentication/session และ RBAC — ย้ายเป็นงานลำดับสุดท้ายตามคำขอผู้ใช้; คงระบบเปิดด้วยบัญชีผู้ดูแลเดิมก่อน
- [x] T-108 ตั้งค่า unit/integration test และ CI — local suite และ GitHub Actions พร้อม

## Phase 2 — LINE และ Voice Pipeline

- [x] T-201 LINE webhook + signature tests — handler และ signed pipeline tests
- [x] T-202 idempotency store — source event lookup บน Google Sheets
- [x] T-203 farmer account linking — F-003
- [x] T-204 audio download/validation — F-004
- [x] T-205 speech-to-text adapter — F-005 (Gemini)
- [x] T-205A AI provider contract และ Gemini adapter — F-005A (OpenAI adapter ยังไม่รวม)
- [x] T-206 structured extraction + schema validation — F-006
- [-] T-207 deterministic ICS rule engine + test fixtures — engine พร้อม รอ approved rules
- [x] T-208 confirmation and correction conversation — กดยืนยัน/ขอแก้ไขผ่าน LINE และเสียงถัดไปเติมรายการเดิม — F-008
- [x] T-209 Flex Message templates + accessible wording — สรุปข้อมูลและสถานะด้วยข้อความพร้อมปุ่ม ไม่พึ่งสี — F-009
- [-] T-210 retry/outbox/dead-letter workflow — LINE outbox, backoff, dead-letter และหน้ากู้พร้อม; รอ cron worker — F-024
- [x] T-211 audit snapshots ของ LINE lifecycle และ account linking — F-022
- [x] T-212 ผูกเสียงตอบข้อมูลเพิ่มเข้ากับ activity ที่รอเกษตรกรล่าสุด — F-032
- [x] T-213 จับคู่รหัส/ชื่อ/เลขแปลงและเติมพืชจากทะเบียนก่อนตรวจข้อมูลครบ — F-033
- [x] T-214 แก้กิจกรรมเดิมด้วยเสียงหลังยืนยัน พร้อม correction session, revision, diff และ audit — F-008, F-107

## Phase 3 — Dashboard

- [x] T-301 สร้าง design tokens และ app shell — F-027
- [x] T-302 login/session screens — F-010
- [x] T-303 overview dashboard — F-012
- [-] T-304 review queue/filter — risk/text พร้อม รอ filter ที่เหลือ
- [-] T-305 review detail/evidence player — หลักฐานพร้อม รอ audio player
- [-] T-306 review actions and audit — flow หลักพร้อม รอ void confirmation
- [x] T-307 activity registry — F-016
- [x] T-308 farmer/plot registry — เพิ่มสมาชิก/แปลงจากเว็บ, Google Sheets persistence และ audit — F-003, F-016
- [x] T-310 integration status panel — ตรวจ Sheets, LINE, AI และ public trace โดยไม่เผย secret — F-106
- [-] T-309 responsive and accessibility verification — desktop/mobile captures พร้อม รอ formal audit

## Phase 3A — Legacy Data Migration และ Data Quality

- [x] T-351 ออกแบบ import batch/domain และ staging repository แยกจากข้อมูลใช้งานจริง — F-036, F-038
- [x] T-352 รองรับ CSV/XLSX upload ไม่เกิน 2 MiB/500 แถว/50 คอลัมน์ พร้อมป้องกันชนิดไฟล์และ formula injection ในรายงาน — F-036
- [x] T-353 ทำ column mapping/เดาหัวคอลัมน์และหน้าเลือก/บันทึก template พร้อม audit — F-036
- [x] T-354 ทำ Import Preview สำหรับ FARMER แสดง valid/error/duplicate/skipped ก่อน commit พร้อม UI — F-036, F-037
- [-] T-355 ตรวจ required fields, stable ID, duplicate และ farmer–plot relation สำหรับ FARMER/PLOT แล้ว; รอ schema กิจกรรม/ล็อตหากขยาย import — F-037
- [x] T-356 ทำ error report ดาวน์โหลดได้ พร้อมเลขแถว สาเหตุ และวิธีแก้ — F-037
- [-] T-357 ทำ dry run, batch checksum, READY-only idempotent commit และ pre-commit void แล้ว; รอ compensating rollback หลัง commit — F-038
- [x] T-358 เก็บ provenance, source row, importer, reviewer, imported_at และ verification status พร้อม audit — F-039
- [x] T-359 เพิ่ม API และหน้า human review queue สำหรับ list/filter/verify/reject พร้อม provenance — F-039
- [ ] T-360 ทำ OCR-assisted staging หลัง CSV path ผ่าน โดยบังคับเทียบต้นฉบับ — F-109
- [ ] T-361 ประเมิน legacy API/export หลังชุมชนยืนยันระบบและสิทธิ์ — F-110

## Phase 4 — Inventory และ Traceability

- [x] T-401 harvest eligibility service — ต้องระบุว่าเก็บเกี่ยว ได้รับอนุมัติ และข้อมูลพืช/แปลง/ปริมาณ/หน่วยครบ — F-017
- [x] T-402 unique Lot ID generator — UUID-based — F-018
- [x] T-403 QR/trace token service — random trace token และ PNG download — F-019
- [x] T-404 inventory workflow — ตรวจ transition และบังคับเหตุผล — F-020
- [x] T-405 lot dashboard/detail — สร้างล็อต ดูสถานะ และเปลี่ยนสถานะ — F-020
- [x] T-406 public trace page — privacy-safe UI พร้อม invalid/void/recall states — F-021
- [x] T-407 recall/void scenarios — terminal states พร้อม audit — F-108
- [x] T-408 storage location registry/assignment/movement — Google Sheets, reusable selection และ audit — F-034
- [x] T-409 ออกแบบและพัฒนา StockMovement แบบ append-only: RECEIVE/RESERVE/RELEASE/SHIP/ADJUST/RECALL พร้อม audit/backup — F-040
- [x] T-410 คำนวณ on-hand, reserved, available จาก ledger และห้ามติดลบ — F-040, F-042
- [-] T-411 เพิ่ม framework controlled definitions และประวัติมาตรฐานล็อตแล้ว; รอ ICS อนุมัตินิยามจริง — F-041
- [x] T-412 ทำ lifecycle จอง/ปลดจอง/จ่าย/หมดอายุ พร้อมผู้รับผิดชอบ ผู้รับสินค้า เอกสารอ้างอิง และวันหมดอายุ — F-042
- [x] T-413 กันล็อต VOID/RECALLED/พักใช้/ไม่ผ่านมาตรฐานออกจาก available quantity — F-041, F-042
- [x] T-414 เพิ่ม lot ledger แสดงยอดคงเหลือ การจอง movement เวลาล่าสุด และสถานะมาตรฐาน — F-040, F-041, F-042
- [x] T-415 ทดสอบ reconciliation, idempotency, unit mismatch, over-reserve/release/ship และ recall — F-040

## Phase 5 — Operations และ Deployment

- [-] T-501 health/readiness endpoints — `/health` และ `/ready` ตรวจ data store/config พร้อม; รอ active probe LINE/AI
- [x] T-502 backup/export/restore drill — JSON checksum, validate-first, merge-only restore และ audit พร้อม — F-031
- [x] T-503 free-tier hosting selection and config — Render Blueprint พร้อม พร้อมระบุข้อจำกัด
- [x] T-504 CI verification pipeline — GitHub Actions รัน `npm ci` และ `npm run check` ทุก push/PR — F-029
- [ ] T-505 LINE production webhook setup guide — F-030
- [ ] T-506 monitoring, quota and cost alerts — F-025
- [ ] T-507 rollback and incident runbook — F-030

## Phase 6 — Verification และ Handover

- [x] T-601 unit tests for rules/domain
- [-] T-602 integration tests for LINE/Gemini/Sheets adapters — LINE pipeline ผ่าน mock integration; รอ credential smoke test จริง
- [-] T-603 end-to-end critical paths — login/dashboard/review visual flow ผ่าน
- [-] T-604 security review — headers/auth/backup limits และ dependency audit ผ่าน; รอ penetration review ภายนอก
- [ ] T-605 accessibility audit
- [x] T-606 desktop/mobile visual QA
- [-] T-607 operator manual — integration/testing guide พร้อม; กำลังเพิ่ม dashboard operations
- [x] T-608 troubleshooting guide
- [ ] T-609 deployment verification checklist
- [ ] T-610 final feature/task reconciliation
- [x] T-611 สร้าง Impact Dashboard จากข้อมูลวัดจริงและแสดงว่าไม่มี baseline โดยไม่สร้างเปอร์เซ็นต์สมมติ — F-043
- [x] T-612 จัดทำ Process Map แบบ As-Is/To-Be พร้อม owner, handoff, pain point และ control — F-044
- [x] T-613 จัดทำ Test Report ระบุ input, expected, actual, pass/fail, defect และหลักฐาน — F-044
- [ ] T-614 ทำ controlled pilot กลุ่มเล็กด้วย consent และ rollback criteria — F-044
- [ ] T-615 เปรียบเทียบ baseline/after ด้วยชุดข้อมูลเดียวกันและรายงานข้อจำกัด — F-043, F-044
- [x] T-616 จัดชุดเอกสารนำเสนอกรรมการ: Process Map, Working PoC scope, Test Report และ Implementation/Pilot Plan — F-044

## Current Gate

Gate ถัดไปคือ **ยืนยันแหล่งข้อมูลจริงและ sample ที่ได้รับอนุญาต** ก่อนสร้าง importer จากนั้นทำ CSV/XLSX Preview + Data Quality + controlled commit ให้ผ่านด้วยข้อมูลจำลองและ sample ที่ปกปิดแล้ว จึงพัฒนา stock ledger/T1–T2/allocation และวัดผล pilot; ห้ามกล่าวอ้างว่าลดการกรอกซ้ำหรือยอดล็อตถูกต้องจนกว่าจะมีผลทดสอบก่อน–หลัง

## Efficiency Review — 18 ต.ค. 2569

- [x] ตัดการสร้าง activity ใหม่เมื่อเสียงเป็นคำตอบของรายการ `AWAITING_FARMER`
- [x] ตัดการให้เกษตรกรพูด Activity ID ซ้ำ; ระบบเลือกงานค้างล่าสุดของบัญชี LINE ให้อัตโนมัติ
- [x] ตัดการกรอกชื่อพืชซ้ำเมื่อจับคู่แปลงในทะเบียนได้และเสียงไม่ได้ระบุพืช
- [x] รองรับชื่อแปลงที่พูดต่างรูป เช่น `แปลง 1` และ `แปลงหนึ่ง`
- [x] เก็บทุก webhook event ID และ snapshot ก่อน/หลังไว้ตรวจย้อนหลัง แม้อัปเดตรายการเดิม
- [ ] รายการซ้ำที่เกิดก่อนการแก้ไขยังต้องให้เจ้าหน้าที่ตรวจว่าเป็นกิจกรรมเดียวกันก่อนรวม เพื่อไม่ทำลายหลักฐาน
