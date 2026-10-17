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
| F-003 | ผูก LINE account กับ Farmer ID | เกษตรกร/Admin | Planned | ไม่ใช้ display name เป็น primary identity |
| F-004 | รับและดาวน์โหลดข้อความเสียง | เกษตรกร | Planned | รองรับชนิดไฟล์ที่ LINE ส่งและจำกัดขนาด/เวลา |
| F-005 | ถอดเสียงภาษาไทย | ระบบ | Planned | เก็บ transcript และสถานะ error โดยไม่ทำ token รั่ว |
| F-005A | AI provider abstraction (OpenAI/Gemini) | ระบบ/Developer | Planned | เลือก provider ผ่าน config และผ่าน contract tests ชุดเดียวกัน โดยไม่เปลี่ยน domain/ICS rules |
| F-006 | สกัดข้อมูลกิจกรรมตาม schema | ระบบ | Planned | output ผ่าน validation; invalid output เข้าคิวตรวจ |
| F-007 | ICS deterministic rule engine | ICS | In Progress | engine และ tests พร้อม; รอรายการสารฉบับอนุมัติ |
| F-008 | Farmer confirmation ผ่าน LINE | เกษตรกร | Planned | ยืนยัน แก้ หรือขอความช่วยเหลือได้ |
| F-009 | Flex Message ผลสำเร็จ/ต้องตรวจ/ผิดพลาด | เกษตรกร | Planned | ภาษาไทยชัดเจน ไม่กล่าวโทษ และไม่พึ่งสีอย่างเดียว |
| F-010 | Authentication สำหรับ Dashboard | เจ้าหน้าที่ | In Progress | local secure session พร้อม; รอ durable session/identity provider |
| F-011 | Role-based access control | เจ้าหน้าที่ | In Progress | API role checks พร้อม; รอ user management |
| F-012 | Dashboard ภาพรวม | เจ้าหน้าที่ | Done | แสดงคิวเร่งด่วน งานค้าง สุขภาพระบบ และ drill-down ได้ |
| F-013 | Review queue และ filter | ICS | In Progress | ค้น/กรอง risk และข้อความได้; รอ date/status filters |
| F-014 | Review detail พร้อมหลักฐาน | ICS | In Progress | transcript/extraction/rule/audit พร้อม; รอ audio player |
| F-015 | Approve / Flag / Request info / Void | ICS | In Progress | approve/flag/request พร้อม; รอ void confirmation flow |
| F-016 | Activity registry | ICS | Done | ค้น กรอง และเปิดรายละเอียดกิจกรรมได้ |
| F-017 | สร้างล็อตจากกิจกรรมเก็บเกี่ยว | ICS/Warehouse | Planned | ตรวจข้อมูลครบและ block เมื่อมี risk เปิดอยู่ |
| F-018 | Lot ID ที่ไม่ซ้ำ | ระบบ | Planned | concurrent creation ไม่สร้างรหัสซ้ำ |
| F-019 | QR และ trace URL | Warehouse | Planned | QR ไม่มี PII/secret และเปิดหน้า trace ได้ |
| F-020 | Inventory status workflow | Warehouse | Planned | transition ตามกฎและเก็บเหตุผล/ผู้ดำเนินการ |
| F-021 | Public trace page | ผู้ตรวจสอบ | In Progress | privacy-safe API พร้อม; รอหน้า UI และ invalid/void states |
| F-022 | Audit trail | Auditor/Admin | In Progress | review audit พร้อม; รอครอบคลุมทุก entity |
| F-023 | Google Sheets repository adapter | ระบบ | Planned | domain service ไม่ import Sheets SDK โดยตรง |
| F-024 | Retry, outbox และ dead-letter handling | ระบบ/Admin | Planned | งานชั่วคราว retry; งานเกินกำหนดกู้จาก Dashboard ได้ |
| F-025 | Health check และ structured logs | Admin | In Progress | API health/log พร้อม; รอ dependency/worker health |
| F-026 | Validation และ error handling | ทุกคน | Done | error ให้ next step และ API ใช้รูปแบบคงที่ |
| F-027 | Responsive + WCAG 2.2 AA baseline | เจ้าหน้าที่ | In Progress | keyboard/focus/44px/mobile พร้อม; รอ formal audit |
| F-028 | Environment configuration | Developer | Done | `.env.example`, startup validation, no secret in repo |
| F-029 | Automated tests และ CI | Developer | In Progress | tests/build พร้อม; รอ hosted CI workflow |
| F-030 | Free-tier deployment guide | Developer/Admin | In Progress | Render guide/blueprint พร้อม; รอ deploy จริงและ verify |
| F-031 | Backup/export และ restore drill | Admin | Planned | export ได้และมีขั้นตอนทดสอบ restore |

## P1 — ควรมีหลังแกนหลักเสถียร

| ID | ฟีเจอร์ | ผู้ใช้ | สถานะ | หมายเหตุ |
|---|---|---|---|---|
| F-101 | Rich Menu สำหรับ LINE | เกษตรกร | Planned | บันทึกเสียง / บันทึกของฉัน / ช่วยเหลือ |
| F-102 | Farmer history ผ่าน LINE | เกษตรกร | Planned | แสดงเฉพาะข้อมูลของบัญชีที่ผูกแล้ว |
| F-103 | Notification escalation | ICS/Admin | Planned | แจ้งรายการ high risk ตาม SLA |
| F-104 | Reports และ CSV export | ICS/Auditor | Planned | export ตามสิทธิ์และ log การดาวน์โหลด |
| F-105 | Rule management UI | Admin | Planned | draft/publish/version/rollback |
| F-106 | System status panel | Admin | Planned | queue depth, sync lag, failures, quota |
| F-107 | Data correction workflow | ICS | Planned | correction ไม่เขียนทับหลักฐานต้นทาง |
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
| 17 ต.ค. 2569 | เพิ่มคู่มือ integration แบบแบ่ง Gate A–D โดยไม่เปลี่ยนขอบเขตฟีเจอร์ | ทำให้แยกสถานะ memory demo ออกจาก Sheets/LINE/OpenAI จริงและทดสอบระดับถัดไปได้ | Codex |
| 18 ต.ค. 2569 | เพิ่ม Gemini เป็นทางเลือก Gate C ผ่าน provider abstraction | ลด vendor lock-in; Gemini รองรับ audio transcription และ structured output แต่ยังไม่ implement adapter | Codex |
