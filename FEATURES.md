# Feature Registry

> Source of truth สำหรับฟีเจอร์ทั้งหมดของระบบ การเพิ่ม ลด หรือเปลี่ยนขอบเขตต้องอัปเดตไฟล์นี้พร้อม `TASKS.md` และ `WORKLOG.md`
>
> เวอร์ชัน: 0.1.0 · อัปเดตล่าสุด: 17 ตุลาคม 2569

## สถานะ

- `Proposed` — อยู่ในแนวคิด ยังไม่ยืนยันขอบเขต
- `Planned` — อยู่ในขอบเขตและมีแผนพัฒนา
- `In Progress` — กำลังพัฒนา
- `Blocked` — มีสิ่งที่ต้องรอก่อนดำเนินการ
- `Done` — พัฒนาและผ่านเกณฑ์ยอมรับแล้ว
- `Deferred` — เลื่อนไปหลัง production รุ่นแรก
- `Removed` — ถอนออก พร้อมเหตุผลใน Change Log

## P0 — จำเป็นสำหรับเปิดใช้งานจริง

| ID | ฟีเจอร์ | ผู้ใช้ | สถานะ | เกณฑ์ยอมรับโดยย่อ |
|---|---|---|---|---|
| F-001 | ตรวจสอบ LINE webhook signature | ระบบ | In Progress | signature ผิดถูกปฏิเสธ และมี automated test |
| F-002 | ป้องกัน webhook/event ซ้ำ | ระบบ | In Progress | event เดิมไม่สร้าง activity หรือล็อตซ้ำ |
| F-003 | ผูก LINE account กับ Farmer ID | เกษตรกร/Admin | Implemented | ส่ง `ลงทะเบียน <รหัสสมาชิก>`; ไม่ใช้ display name เป็น identity |
| F-004 | รับและดาวน์โหลดข้อความเสียง | เกษตรกร | Implemented | LINE Content API, timeout และขนาด inline ไม่เกิน 18 MB |
| F-005 | ถอดเสียงภาษาไทย | ระบบ | Implemented | Gemini multimodal; เก็บ transcript และ error โดยไม่เปิดเผย token |
| F-005A | AI provider abstraction (OpenAI/Gemini) | ระบบ/Developer | Partial | มี VoiceAnalyzer contract และ Gemini adapter; OpenAI adapter ยังไม่เชื่อม |
| F-006 | สกัดข้อมูลกิจกรรมตาม schema | ระบบ | Implemented | Gemini structured JSON + Zod validation; invalid output เป็น FAILED_RETRYABLE |
| F-007 | ICS deterministic rule engine | ICS | In Progress | engine และ tests พร้อม; รอรายการสารฉบับอนุมัติ |
| F-008 | Farmer confirmation ผ่าน LINE | เกษตรกร | Done | กดยืนยัน/แก้ไขจากการ์ด หรือส่ง `แก้ไขล่าสุด`; เสียงแก้ไขเติมรายการเดิม มี revision และ audit |
| F-009 | Flex Message ผลสำเร็จ/ต้องตรวจ/ผิดพลาด | เกษตรกร | Done | การ์ดภาษาไทยสรุปแปลง พืช กิจกรรม สถานะ พร้อมปุ่มที่มีข้อความกำกับ ไม่พึ่งสีอย่างเดียว |
| F-010 | Authentication สำหรับ Dashboard | เจ้าหน้าที่ | Deferred | local secure session พร้อม; ผู้ใช้ขอพัก durable user store ไว้ก่อน |
| F-011 | Role-based access control | เจ้าหน้าที่ | Deferred | API role checks เดิมยังทำงาน; พัก user management ตามคำขอผู้ใช้ |
| F-012 | Dashboard ภาพรวม | เจ้าหน้าที่ | Done | แสดงคิวเร่งด่วน งานค้าง สุขภาพระบบ และ drill-down ได้ |
| F-013 | Review queue และ filter | ICS | In Progress | ค้น/กรอง risk และข้อความได้; รอ date/status filters |
| F-014 | Review detail พร้อมหลักฐาน | ICS | In Progress | transcript/extraction/rule/audit พร้อม; รอ audio player |
| F-015 | Approve / Flag / Request info / Void | ICS | In Progress | approve/flag/request พร้อม; รอ void confirmation flow |
| F-016 | Activity registry | ICS | Done | ค้น กรอง และเปิดรายละเอียดกิจกรรมได้ |
| F-017 | สร้างล็อตจากกิจกรรมเก็บเกี่ยว | ICS/Warehouse | Done | ต้องอนุมัติและมีพืช แปลง ปริมาณ หน่วยครบ |
| F-018 | Lot ID ที่ไม่ซ้ำ | ระบบ | Done | UUID-based ID และป้องกันสร้างซ้ำจากกิจกรรมเดียว |
| F-019 | QR และ trace URL | Warehouse | Done | ดาวน์โหลด QR PNG ที่บรรจุ opaque trace token ไม่มี PII |
| F-020 | Inventory status workflow | Warehouse | Done | transition ตามกฎ เก็บเหตุผล ผู้ทำ และ audit |
| F-021 | Public trace page | ผู้ตรวจสอบ | Done | privacy-safe UI รองรับ invalid/void/recall states |
| F-022 | Audit trail | Auditor/Admin | In Progress | review audit พร้อม; รอครอบคลุมทุก entity |
| F-023 | Google Sheets repository adapter | ระบบ | Implemented | สร้าง headers อัตโนมัติและอ่าน/เขียนผ่าน Repository contract |
| F-024 | Retry, outbox และ dead-letter handling | ระบบ/Admin | In Progress | LINE outbox/retry/dead-letter และหน้ากู้พร้อม; รอ cron worker แยกสำหรับ retry ตามเวลาแม้ไม่มี traffic |
| F-025 | Health check และ structured logs | Admin | In Progress | API health/log พร้อม; รอ dependency/worker health |
| F-026 | Validation และ error handling | ทุกคน | Done | error ให้ next step และ API ใช้รูปแบบคงที่ |
| F-027 | Responsive + WCAG 2.2 AA baseline | เจ้าหน้าที่ | In Progress | keyboard/focus/44px/mobile พร้อม; รอ formal audit |
| F-028 | Environment configuration | Developer | Done | `.env.example`, startup validation, no secret in repo |
| F-029 | Automated tests และ CI | Developer | Done | GitHub Actions ตรวจ typecheck, tests และ production build ทุก push/PR |
| F-030 | Free-tier deployment guide | Developer/Admin | In Progress | Render guide/blueprint พร้อม; รอ deploy จริงและ verify |
| F-031 | Backup/export และ restore drill | Admin | Done | JSON ครบทุก entity, SHA-256 checksum, validate-first และ merge-only restore พร้อม audit |
| F-032 | ต่อบทสนทนาในกิจกรรมเดิม | เกษตรกร | Implemented | หลังเจ้าหน้าที่ขอข้อมูล เสียงถัดไปเติม activity เดิมและเก็บ source event ทุกครั้ง |
| F-033 | จับคู่แปลงอัตโนมัติจากทะเบียน | เกษตรกร/ICS | Implemented | รองรับรหัส ชื่อ “แปลง 1/แปลงหนึ่ง” และเลือกแปลงเดียวอัตโนมัติ พร้อมเติมพืชจากทะเบียน |

## P1 — ควรมีหลังแกนหลักเสถียร

| ID | ฟีเจอร์ | ผู้ใช้ | สถานะ | หมายเหตุ |
|---|---|---|---|---|
| F-101 | Rich Menu สำหรับ LINE | เกษตรกร | Planned | บันทึกเสียง / บันทึกของฉัน / ช่วยเหลือ |
| F-102 | Farmer history ผ่าน LINE | เกษตรกร | Planned | แสดงเฉพาะข้อมูลของบัญชีที่ผูกแล้ว |
| F-103 | Notification escalation | ICS/Admin | Planned | แจ้งรายการ high risk ตาม SLA |
| F-104 | Reports และ CSV export | ICS/Auditor | Done | export CSV ตามสิทธิ์และบันทึก audit |
| F-105 | Rule management UI | Admin | Planned | draft/publish/version/rollback |
| F-106 | System status panel | Admin | Partial | แสดง readiness ของ Sheets, LINE, AI, trace; รอ quota/queue metrics |
| F-107 | Data correction workflow | เกษตรกร/ICS | Done | แก้รายการเดิมด้วยเสียง แสดงก่อน–หลัง เพิ่ม revision และเก็บ audit; รายการที่สร้างล็อตแล้วส่งให้เจ้าหน้าที่ |
| F-108 | Lot recall workflow | Warehouse/Admin | Planned | RECALL พร้อมเหตุผลและผลกระทบ |

## Deferred

| ID | ฟีเจอร์ | สถานะ | เหตุผล |
|---|---|---|---|
| F-201 | Offline-first Dashboard | Deferred | เพิ่มความซับซ้อนสูง; LINE ยังเป็นช่องทางหลักภาคสนาม |
| F-202 | Native mobile app | Deferred | Web responsive และ LINE เพียงพอสำหรับรุ่นแรก |
| F-203 | Computer vision ตรวจรูปสาร/ฉลาก | Deferred | ต้องมี dataset และกระบวนการ validation เพิ่มเติม |
| F-204 | Marketplace/การขายสินค้า | Deferred | นอกเป้าหมาย ICS และ traceability รุ่นแรก |
| F-205 | Multi-tenant หลายสหกรณ์ | Deferred | ออกแบบ domain เผื่อไว้ แต่ไม่เปิดในรุ่นแรก |

## Non-features / Boundaries

- AI ไม่ออกใบรับรองมาตรฐานและไม่แทนผู้ตรวจ ICS
- ระบบไม่ควรประกาศว่า “ปลอดภัย” เพียงเพราะไม่พบคำเสี่ยง
- Google Sheets ไม่ใช่แหล่งทำ authentication หรือเก็บ password
- QR ไม่เก็บข้อมูลส่วนบุคคลหรือข้อมูลที่แก้ไขไม่ได้
- การลบข้อมูลสำคัญใช้สถานะ void/archived และ audit trail แทน hard delete

## Feature Change Log

| วันที่ | การเปลี่ยนแปลง | เหตุผล | ผู้บันทึก |
|---|---|---|---|
| 17 ต.ค. 2569 | สร้างทะเบียนฟีเจอร์เริ่มต้น F-001 ถึง F-205 | แปลง comprehensive brief ให้เป็น scope ที่ตรวจสอบและพัฒนาได้ | Codex |
| 17 ต.ค. 2569 | เพิ่ม human review, audit, retry, idempotency, RBAC และ privacy | จำเป็นต่อความน่าเชื่อถือและ production readiness | Codex |
| 17 ต.ค. 2569 | เริ่ม foundation implementation และอัปเดตสถานะ F-001–F-030 ตามหลักฐานจริง | Dashboard/API/test milestone แรกพร้อม แต่ integration ภายนอกยังไม่ครบ | Codex |
| 18 ต.ค. 2569 | Implement Gate A–C: Google Sheets, LINE linking/audio และ Gemini pipeline | พร้อม deploy และทดสอบด้วย credentials จริง; OpenAI adapter/outbox ยังอยู่นอกขอบเขตรอบนี้ | Codex |
| 18 ต.ค. 2569 | ลบข้อมูล mock ออกจาก runtime และเพิ่ม empty state/ป้ายแหล่งข้อมูล | Dashboard แสดงเฉพาะข้อมูลจริงจาก repository; test fixtures อยู่เฉพาะใน tests | Codex |
| 17 ต.ค. 2569 | เพิ่มคู่มือ integration แบบแบ่ง Gate A–D โดยไม่เปลี่ยนขอบเขตฟีเจอร์ | ทำให้แยกสถานะ memory demo ออกจาก Sheets/LINE/OpenAI จริงและทดสอบระดับถัดไปได้ | Codex |
| 18 ต.ค. 2569 | เพิ่ม Gemini เป็นทางเลือก Gate C ผ่าน provider abstraction | ลด vendor lock-in; Gemini รองรับ audio transcription และ structured output แต่ยังไม่ implement adapter | Codex |
| 18 ต.ค. 2569 | เพิ่มการต่อบทสนทนาในรายการเดิมและจับคู่แปลงอัตโนมัติ | ลดรายการซ้ำและไม่ถามข้อมูลที่มีอยู่แล้วในทะเบียน | Codex |
| 18 ต.ค. 2569 | เพิ่ม LINE Outbox, retry, dead-letter และ readiness | ป้องกันข้อความแจ้งเตือนหายเมื่อ LINE ล่มและให้ Admin กู้คิวได้ | Codex |
| 18 ต.ค. 2569 | พัก multi-user/RBAC และเพิ่ม backup/restore กับ CI | จัดลำดับตามคำขอผู้ใช้ โดยเร่งความปลอดภัยข้อมูลและการตรวจ build ก่อน | Codex |
| 18 ต.ค. 2569 | เพิ่ม LINE Flex Message และ correction flow แบบกดปุ่ม | ลดการพิมพ์ Activity ID และให้เสียงแก้ไขกลับเข้า activity เดิมโดยอัตโนมัติ | Codex |
| 18 ต.ค. 2569 | ขยาย correction workflow ให้แก้รายการที่ยืนยันแล้ว | รองรับ `แก้ไขล่าสุด`, session 30 นาที, revision, เปรียบเทียบก่อน–หลัง และป้องกันแก้รายการที่สร้างล็อตแล้ว | Codex |
