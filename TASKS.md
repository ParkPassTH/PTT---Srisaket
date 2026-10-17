# Project Tasks

> ทุก task ต้องอ้างอิง Feature ID เมื่อเกี่ยวข้อง และอัปเดตสถานะพร้อม `WORKLOG.md`
>
> อัปเดตล่าสุด: 18 ตุลาคม 2569

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

## Phase 1 — Architecture และ Foundation

- [ ] T-101 สรุป architecture decision records
- [x] T-102 สร้าง project scaffold และ workspace scripts
- [x] T-103 สร้าง environment schema และ `.env.example` — F-028
- [x] T-104 สร้าง domain entities และ repository contracts — F-023
- [x] T-105 สร้าง Google Sheets adapter — F-023
- [x] T-105A จัดทำคู่มือต่อ Sheets/LINE/OpenAI และ acceptance tests — F-023, F-029, F-030
- [x] T-106 สร้าง error model และ structured logging — F-025, F-026
- [-] T-107 สร้าง authentication/session และ RBAC — local session พร้อม รอ durable user store
- [-] T-108 ตั้งค่า unit/integration test และ CI — local suite พร้อม รอ hosted CI

## Phase 2 — LINE และ Voice Pipeline

- [x] T-201 LINE webhook + signature tests — handler และ signed pipeline tests
- [x] T-202 idempotency store — source event lookup บน Google Sheets
- [x] T-203 farmer account linking — F-003
- [x] T-204 audio download/validation — F-004
- [x] T-205 speech-to-text adapter — F-005 (Gemini)
- [x] T-205A AI provider contract และ Gemini adapter — F-005A (OpenAI adapter ยังไม่รวม)
- [x] T-206 structured extraction + schema validation — F-006
- [-] T-207 deterministic ICS rule engine + test fixtures — engine พร้อม รอ approved rules
- [-] T-208 confirmation and correction conversation — ยืนยันรายการผ่าน LINE พร้อม; รอแก้ไขรายช่อง — F-008
- [ ] T-209 Flex Message templates + accessible wording — F-009
- [ ] T-210 retry/outbox/dead-letter workflow — F-024

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

## Phase 4 — Inventory และ Traceability

- [x] T-401 harvest eligibility service — อนุมัติและข้อมูลเก็บเกี่ยวครบก่อนสร้าง — F-017
- [x] T-402 unique Lot ID generator — UUID-based — F-018
- [x] T-403 QR/trace token service — random trace token และ PNG download — F-019
- [x] T-404 inventory workflow — ตรวจ transition และบังคับเหตุผล — F-020
- [x] T-405 lot dashboard/detail — สร้างล็อต ดูสถานะ และเปลี่ยนสถานะ — F-020
- [x] T-406 public trace page — privacy-safe UI พร้อม invalid/void/recall states — F-021
- [x] T-407 recall/void scenarios — terminal states พร้อม audit — F-108

## Phase 5 — Operations และ Deployment

- [-] T-501 health/readiness endpoints — `/health` พร้อม รอ dependency readiness
- [ ] T-502 backup/export/restore drill — F-031
- [x] T-503 free-tier hosting selection and config — Render Blueprint พร้อม พร้อมระบุข้อจำกัด
- [ ] T-504 CI deployment pipeline — F-029, F-030
- [ ] T-505 LINE production webhook setup guide — F-030
- [ ] T-506 monitoring, quota and cost alerts — F-025
- [ ] T-507 rollback and incident runbook — F-030

## Phase 6 — Verification และ Handover

- [x] T-601 unit tests for rules/domain
- [-] T-602 integration tests for LINE/Gemini/Sheets adapters — LINE pipeline ผ่าน mock integration; รอ credential smoke test จริง
- [-] T-603 end-to-end critical paths — login/dashboard/review visual flow ผ่าน
- [ ] T-604 security review
- [ ] T-605 accessibility audit
- [x] T-606 desktop/mobile visual QA
- [-] T-607 operator manual — integration/testing guide พร้อม; กำลังเพิ่ม dashboard operations
- [x] T-608 troubleshooting guide
- [ ] T-609 deployment verification checklist
- [ ] T-610 final feature/task reconciliation

## Current Gate

ทดสอบ production end-to-end ด้วยข้อมูลจริง: เพิ่มสมาชิก/แปลงจาก Dashboard → ลงทะเบียน LINE → ส่งเสียง → ยืนยัน/ตรวจสอบ → สร้างล็อต → ดาวน์โหลด QR → เปิด public trace
