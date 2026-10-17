# Work Log

> บันทึกนี้เป็น append-oriented log สำหรับสรุปสิ่งที่ทำ การตัดสินใจ หลักฐานการตรวจ และสิ่งที่ต้องทำต่อ ห้ามใช้แทน Git history แต่ต้องอัปเดตทุกช่วงงานที่มีสาระสำคัญ

## รูปแบบรายการ

```text
## YYYY-MM-DD — ชื่อช่วงงาน
- เป้าหมาย:
- งานที่ทำ:
- ไฟล์ที่เปลี่ยน:
- การตัดสินใจ:
- การตรวจสอบ:
- ปัญหา/ความเสี่ยง:
- งานถัดไป:
```

## 2026-10-17 — Project discovery และ product foundation

- เป้าหมาย: ทำความเข้าใจ comprehensive brief และยืนยันแนวทางระบบ
- งานที่ทำ:
  - อ่านบรีฟ Voice-to-ICS & Smart Inventory
  - ตรวจ workspace พบว่าเป็น greenfield project
  - ยืนยันกับผู้ใช้ให้ใช้ Node.js + Express, custom Web Dashboard และต้อง deploy ใช้งานจริง
  - เพิ่มข้อกำหนด production readiness เช่น human review, audit trail, idempotency, retry และ RBAC
- ไฟล์ที่เปลี่ยน:
  - `PRODUCT.md`
- การตัดสินใจ:
  - Google Sheets เป็น data store ช่วงแรก แต่ต้องเข้าผ่าน repository abstraction
  - AI ทำ extraction; deterministic rules และเจ้าหน้าที่เป็นผู้ตัดสินผลที่กระทบมาตรฐาน
  - Web Dashboard เป็น responsive web application
- การตรวจสอบ:
  - ตรวจว่า `PRODUCT.md` มี product schema, platform, stack, users, constraints และ accessibility baseline
- ปัญหา/ความเสี่ยง:
  - ยังไม่มีรายการสารที่ได้รับอนุญาต/ห้ามใช้ฉบับรับรอง
  - ยังไม่มีบัญชี LINE OA, Google service account, domain และ production secrets
- งานถัดไป:
  - ยืนยันทิศทาง UX/UI
  - ออกแบบ architecture และเริ่ม scaffold หลัง design gate

## 2026-10-17 — Impeccable direction exploration

- เป้าหมาย: สร้างตัวเลือกโลกการออกแบบสำหรับ Dashboard
- งานที่ทำ:
  - รัน Impeccable context และ direction concept seed ในโหมด `operate`
  - สร้างตัวเลือก คลังเมล็ดพันธุ์ชุมชน, สมุดตรวจสหกรณ์, เส้นทางหลักฐาน และ dashboard มาตรฐาน
  - สร้าง HTML sketches สำหรับ first viewport
- ไฟล์ที่เปลี่ยน:
  - `.impeccable/mocks/decision/direction-options.json`
  - `.impeccable/mocks/decision/seed-archive.html`
  - `.impeccable/mocks/decision/cooperative-ledger.html`
  - `.impeccable/mocks/decision/ticket-journey.html`
  - `.impeccable/mocks/decision/canon.html`
- การตัดสินใจ:
  - build path สำหรับ app screen เป็น code-first
- การตรวจสอบ:
  - decision server เริ่มทำงานแต่ไม่สามารถเปิดค้างเพื่อรับคำตอบใน environment นี้ จึงเสนอทางเลือกผ่านแชต
- ปัญหา/ความเสี่ยง:
  - รอผู้ใช้เลือกทิศทางก่อน implement UI
- งานถัดไป:
  - รับคำยืนยันตัวเลือกดีไซน์

## 2026-10-17 — System flow และ project governance docs

- เป้าหมาย: จัดทำ flow สำหรับการนำเสนอ และสร้างเอกสารถาวรสำหรับฟีเจอร์ งาน และบันทึกการทำงาน
- งานที่ทำ:
  - วาดภาพรวมระบบและ flow ย่อยด้วย Mermaid
  - ระบุ state machines ของ processing และ inventory
  - เพิ่ม flow human review, failure handling, authentication, traceability และ deployment
  - สร้าง feature registry พร้อมลำดับความสำคัญและ acceptance summary
  - สร้าง task roadmap ตั้งแต่ foundation ถึง handover
  - กำหนดรูปแบบ work log สำหรับการอัปเดตครั้งต่อไป
- ไฟล์ที่เปลี่ยน:
  - `docs/SYSTEM_FLOW.md`
  - `FEATURES.md`
  - `TASKS.md`
  - `WORKLOG.md`
- การตัดสินใจ:
  - ทุก feature change ต้องอัปเดต `FEATURES.md`
  - ทุก milestone หรือการเปลี่ยนแปลงสำคัญต้องอัปเดต `TASKS.md` และ append `WORKLOG.md`
  - การลบข้อมูลสำคัญใช้ void/archive แทน hard delete
- การตรวจสอบ:
  - ตรวจ coverage ของ actor, happy path, review path, harvest/lot, trace, failure, security และ deployment
- ปัญหา/ความเสี่ยง:
  - Mermaid rendering ขึ้นกับ Markdown viewer แต่ source อ่านเป็นข้อความได้เสมอ
- งานถัดไป:
  - ให้ผู้ใช้ตรวจ flow และเลือกทิศทาง UX/UI

## 2026-10-17 — Foundation implementation milestone

- เป้าหมาย: เริ่มระบบที่รัน ทดสอบ และตรวจหน้าจอได้จริง
- งานที่ทำ:
  - สร้าง Express + TypeScript application และ environment validation
  - สร้าง domain model, repository contract, memory fixture repository และ deterministic ICS rules
  - สร้าง login/session, RBAC middleware, review actions และ audit event
  - สร้าง LINE webhook signature entry point และ duplicate event check
  - สร้าง privacy-safe trace API
  - สร้าง Dashboard responsive ตามทิศทาง “สมุดตรวจสหกรณ์”
  - เพิ่ม automated tests, production build, audit และ headless visual capture
  - เพิ่ม Render Blueprint, deployment guide และ troubleshooting runbook
- ไฟล์ที่เปลี่ยน:
  - `package.json`, `tsconfig.json`, `.env.example`, `.node-version`, `render.yaml`
  - `src/**`, `public/**`, `tests/**`, `scripts/**`
  - `README.md`, `docs/DEPLOYMENT.md`, `docs/TROUBLESHOOTING.md`
  - `FEATURES.md`, `TASKS.md`, `WORKLOG.md`
- การตัดสินใจ:
  - ใช้ native `node:test` แทน Vitest เพื่อลด dependency และหลีกเลี่ยง advisory/runtime conflict
  - หน้า trace สาธารณะไม่ส่งชื่อหรือรหัสเกษตรกร
  - Render Free ใช้ได้เฉพาะ pilot เพราะมี cold start, ephemeral filesystem และไม่มี production SLA
  - Node 22 เป็น runtime ที่แนะนำ แต่โค้ดยังรองรับ Node 20–24
- การตรวจสอบ:
  - TypeScript typecheck ผ่าน
  - automated tests 10/10 ผ่าน
  - production build ผ่าน
  - production dependency audit: 0 vulnerabilities
  - จับภาพ login/dashboard ที่ 1440×900 และ 390×844 สำเร็จ
- ปัญหา/ความเสี่ยง:
  - OpenAI Developer Docs MCP ติดตั้งแล้วแต่ต้องเริ่ม session ใหม่จึงจะใช้เครื่องมือได้ รอบนี้อ้างอิงเอกสาร OpenAI ทางการผ่านเว็บ
  - ยังไม่มี credentials จริง จึงยังไม่ทดสอบ LINE/OpenAI/Google Sheets end-to-end
  - มี `node_modules.previous/` เป็น dependency backup ชั่วคราวและถูก gitignore
- งานถัดไป:
  - สร้าง Google Sheets repository adapter
  - เชื่อม LINE audio download, OpenAI transcription/structured extraction และ LINE reply
  - เพิ่ม durable job/outbox และทดสอบด้วย credentials จริง
## 2026-10-17 — Impeccable finish review

- เป้าหมาย: ตรวจคุณภาพ Dashboard ทั้ง desktop/mobile ก่อนปิด milestone แรก
- งานที่ทำ:
  - ปรับสถานะเป็นตราประทับแบบเอกสารตรวจ
  - จัด mobile metrics แบบ 2×2 และนำคิวตรวจไว้ก่อน fold
  - คง trace, สถานะ และปุ่มเปิดรายละเอียดไว้บนมือถือ
  - เพิ่มข้อความแจ้งส่วนที่อยู่ระหว่างพัฒนาให้ navigation
  - ทำ review drawer เป็น modal ที่รองรับ focus trap, Escape, inert background และคืน focus
  - ปรับสีข้อความรองให้ผ่าน contrast อย่างน้อย 4.5:1
- การตรวจสอบ:
  - Impeccable finish reviewer: `ship`
  - automated tests 10/10, typecheck และ production build ผ่าน
  - production dependency audit: 0 vulnerabilities
  - viewport 390px ไม่มี horizontal overflow
- งานถัดไป:
  - เชื่อมบริการจริงและทำ production end-to-end verification
## 2026-10-17 — Next-stage integration guide

- เป้าหมาย: อธิบายบทบาท Google Sheets และเตรียมคู่มือต่อระบบภายนอก
- งานที่ทำ:
  - ยืนยันจากโค้ดว่าปัจจุบันใช้ `MemoryRepository`; ยังไม่มีการอ่าน/เขียน Google Sheets จริง
  - กำหนด worksheet สำหรับ Farmers, Activities, Reviews, Lots, AuditEvents, ProcessedEvents และ Outbox
  - จัดลำดับการทดสอบ Google Sheets, LINE, OpenAI และ end-to-end staging เป็น Gate A–D
  - เพิ่ม acceptance tests, security boundaries และรายการ credentials/นโยบายที่เจ้าของระบบต้องเตรียม
- ไฟล์ที่เปลี่ยน:
  - `docs/NEXT_STAGE_INTEGRATION.md`
  - `README.md`, `FEATURES.md`, `TASKS.md`, `WORKLOG.md`
- งานถัดไป:
  - implement Google Sheets adapter และ persistence integration tests ตาม Gate A
## 2026-10-18 — Gate A credential sourcing

- เพิ่มตารางระบุที่มาของ `DATA_DRIVER`, `GOOGLE_SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL` และ `GOOGLE_PRIVATE_KEY`
- เพิ่มขั้นตอนสร้าง service account, key JSON, เปิด Sheets API และ Share spreadsheet แบบ least privilege
- ย้ำว่า Google Cloud IAM role ไม่แทนการ Share Google Sheet โดยตรง และห้ามเก็บ key JSON ใน repository
- ไฟล์ที่เปลี่ยน: `docs/NEXT_STAGE_INTEGRATION.md`, `WORKLOG.md`
## 2026-10-18 — Gemini option for Gate C

- ตรวจเอกสารทางการและยืนยันว่า Gemini API รองรับ audio transcription และ structured output
- ตัดสินใจออกแบบเป็น provider abstraction; Gemini key ใช้แทน OpenAI key ตรง ๆ ไม่ได้
- เพิ่ม planned environment, feature F-005A และ task T-205A โดยยังไม่อ้างว่า adapter พร้อมใช้
- กำหนดให้เก็บ verbatim transcript และให้ deterministic ICS rules เป็นผู้ตัดสินความเสี่ยง
- ไฟล์ที่เปลี่ยน: `.env.example`, `docs/NEXT_STAGE_INTEGRATION.md`, `FEATURES.md`, `TASKS.md`, `WORKLOG.md`
## 2026-10-18 — GitHub/Vercel webhook preparation

- เพิ่ม Vercel Express function entrypoint และ rewrite สำหรับ `/api/*` กับ `/webhooks/*`
- เพิ่มคำเตือนว่า Vercel preview ยังใช้ memory store และยังไม่ใช่ voice pipeline แบบครบวงจร
- ป้องกัน local agent configuration และ Impeccable session artifacts ไม่ให้เข้า Git
- เป้าหมาย repository: `ParkPassTH/PTT---Srisaket`
- ล้างค่าจริงออกจาก `.env.example` หลัง GitHub Push Protection ตรวจพบก่อนรับ push; remote ไม่ได้รับ commit ที่มี secret
- push สำเร็จที่ branch `main` commit `c7dd0c1`
## 2026-10-18 — Vercel TypeScript build compatibility

- แก้ conditional ESM/CJS export ของ Helmet ให้ Vercel และ local TypeScript มอง callable middleware ตรงกัน
- pin TypeScript/Helmet ตาม lockfile เพื่อให้ build ทำซ้ำได้
- สาเหตุจาก Vercel build รายงาน `TS2349` ที่ `src/app.ts`
