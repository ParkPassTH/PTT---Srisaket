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
## 2026-10-18 — Vercel startup diagnostics

- เพิ่ม startup fallback ที่รายงานชื่อ environment field ที่ผิดโดยไม่เปิดเผยค่า secret
- เปลี่ยนกรณี configuration ผิดจาก `FUNCTION_INVOCATION_FAILED` เป็น JSON 503 ที่แก้ไขได้
- ใช้เพื่อวินิจฉัย deployment `ptt-srisaket.vercel.app` ซึ่ง `/health` ตอบ 500 ก่อนเข้า Express route
- Function Logs ยืนยันสาเหตุจริง: Express framework auto-detection เลือก `src/app.ts` แทน `api/index.ts`
- ปิด framework preset ด้วย `framework: null` เพื่อให้ Vercel ใช้ function entrypoint ที่กำหนดไว้
- เพิ่ม original-path forwarding สำหรับ `/health`, `/api/*` และ `/webhooks/*` เพราะ Vercel internal rewrite ส่ง destination path เข้า backend

## 2026-10-18 — Implement Gate A–C

- สร้าง `GoogleSheetsRepository` ตาม Repository contract พร้อมสร้าง worksheet/header อัตโนมัติและ upsert ข้อมูลหลัก
- เพิ่ม LINE account linking ด้วยคำสั่ง `ลงทะเบียน <รหัสสมาชิก>` โดยจับคู่ `member_code`
- เพิ่ม LINE Content API สำหรับดาวน์โหลดเสียง และ Reply API สำหรับแจ้งผล/ข้อผิดพลาด
- เพิ่ม `VoiceAnalyzer` contract และ Gemini adapter ที่ถอดเสียงภาษาไทยพร้อม structured extraction ในคำขอเดียว
- ตรวจ structured output ด้วย Zod แล้วใช้ deterministic ICS rules ตัดสินสถานะ; AI ไม่เป็นผู้อนุมัติ ICS
- บันทึก lifecycle `PROCESSING` → `NEEDS_CONFIRMATION`/`NEEDS_REVIEW` หรือ `FAILED_RETRYABLE` ลง Activities
- เพิ่ม signed integration tests สำหรับ registration และ voice pipeline; test รวมผ่าน 12/12, typecheck/build ผ่าน
- ล้าง secret ออกจาก `.env.example` ในเครื่อง โดยไม่แก้ `.env.local`
- เพิ่ม Vercel function duration เป็น 60 วินาทีสำหรับ audio pipeline
- credential smoke test ในเครื่องยังรันจริงไม่ได้ เพราะ `.env.local` มีเฉพาะ `VERCEL_OIDC_TOKEN`; `vercel env ls` ไม่พบ project variables จึงต้องตั้งค่าใน Vercel ก่อนทดสอบภายนอก
- push commit `7bd2409` ไป `main`; Vercel production build สำเร็จและ `https://ptt-srisaket.vercel.app/health` ตอบ HTTP 200

## 2026-10-18 — Remove runtime mock data

- ลบ demo farmers, activities และ lots ออกจาก `MemoryRepository`; repository เริ่มต้นว่างเสมอ
- ย้ายข้อมูลสำหรับทดสอบให้สร้างใน test setup เท่านั้น จึงไม่สามารถปรากฏบนเว็บ production
- เพิ่ม `dataSource` ใน Dashboard API และแสดงว่าเชื่อม Google Sheets หรือใช้หน่วยความจำชั่วคราว
- ปรับ empty state ให้แนะนำการส่งเสียงจริงผ่าน LINE และแยกจากกรณีค้นหาไม่พบ
- เปลี่ยนคำอธิบาย “ข้อมูลตัวอย่าง” เป็น “ข้อมูลจริงที่รับจาก LINE”

## 2026-10-18 — Production dashboard workflows

- เพิ่มทะเบียนเกษตรกรและแปลงจาก Dashboard พร้อม validation, duplicate member-code protection และ audit trail
- เพิ่ม worksheet `Plots` ที่สร้าง header อัตโนมัติใน Google Sheets
- เพิ่มหน้าสถานะการเชื่อมต่อที่รายงาน Sheets, LINE, Gemini และ public trace โดยไม่ส่งค่า secret กลับ browser
- เปิดเมนูกิจกรรม งานตรวจ เกษตรกร/แปลง ล็อต/คลัง รายงาน และการเชื่อมต่อให้ทำงานจริง
- เพิ่ม lot eligibility, UUID Lot ID, inventory transition, recall/void, QR PNG และ public trace page แบบไม่เปิดเผย PII
- เพิ่ม CSV export ตามสิทธิ์พร้อม audit event
- เพิ่มคำสั่ง `ยืนยัน <Activity ID>` ผ่าน LINE และแจ้งขอข้อมูลเพิ่มกลับไปยัง LINE เมื่อมีบัญชีที่ผูกไว้
- ลบข้อมูลล็อกอินตัวอย่างที่กรอกค้างไว้บนหน้า production
- automated tests ผ่าน 17 รายการก่อนเพิ่ม QR และอยู่ระหว่าง final verification

## 2026-10-18 — Google Sheets schema compatibility and Gemini normalization

- ตรวจ Production log พบ Gemini ส่ง confidence เป็นเปอร์เซ็นต์ เช่น `94` แทนทศนิยม `0.94`; เพิ่ม normalization 0–100 เป็น 0–1 และกำชับ prompt
- เพิ่ม Gemini timeout จาก 45 เป็น 52 วินาที หลังพบคำขอบางครั้งถูก abort ที่ 45 วินาที
- ยืนยันจากภาพ Google Sheets ว่า workbook ใช้ headers รุ่นเดิม ซึ่งไม่ตรงกับ repository schema ปัจจุบัน
- เปลี่ยน Sheets adapter ให้อ่าน header จริงตามชื่อ เพิ่มเฉพาะ canonical columns ที่ขาด และรักษาคอลัมน์/ข้อมูลเดิมโดยไม่ลบหรือเลื่อนข้อมูล
- เพิ่ม legacy mapping สำหรับ `full_name`, member code ที่อยู่ใน `line_user_id` และ LINE user ID ที่อยู่ใน `plots`
- typecheck, tests 17/17 และ production build ผ่าน

## 2026-10-18 — Three-minute processing and full change snapshots

- ตั้ง Vercel function duration เป็น 180 วินาที และ Gemini request timeout เป็น 165 วินาที
- เปลี่ยน LINE flow ให้ตอบรับไฟล์ทันที แล้วใช้ Push API แจ้งผลภายหลัง เพื่อไม่พึ่ง reply token ระหว่างงานยาว
- เพิ่ม audit snapshot `before`/`after` สำหรับรับเสียง ประมวลผลสำเร็จ ล้มเหลว ยืนยันโดยเกษตรกร และเชื่อมบัญชี LINE
- เพิ่ม snapshot ฝั่ง Activity เมื่อเชื่อมกับล็อต
- เพิ่มการตรวจ ownership/status ของแปลงและตรวจพืชจากเสียงเทียบกับทะเบียนแปลง
- เพิ่ม `docs/ICS_RECORDING_GUIDE.md` เป็น checklist เบื้องต้น โดยรอผู้จัดการ ICS/หน่วยรับรองอนุมัติกฎจริง

## 2026-10-18 — Conversation continuity and automatic plot resolution

- ตรวจพบว่าระบบเดิมทำ idempotency ได้เฉพาะ webhook ซ้ำ แต่เสียงตอบคำถามเป็น event ใหม่จึงสร้าง activity ใหม่
- เปลี่ยนเสียงถัดไปของเกษตรกรที่มีรายการ `AWAITING_FARMER` ให้เติม activity เดิม โดยคง `activity_id` เดิม
- เพิ่ม `source_event_ids` เพื่อกัน webhook ซ้ำทุกช่วงของบทสนทนา และเพิ่ม audit `FOLLOWUP_VOICE_RECEIVED` / `FOLLOWUP_MERGED`
- เพิ่มการจับคู่แปลงจากรหัส ชื่อ รูปแบบเลขไทยพูดเป็นคำ และกรณีมีแปลงใช้งานเพียงแปลงเดียว
- เติมพืชจากทะเบียนอัตโนมัติก่อนตรวจ required fields เมื่อเสียงไม่ได้พูดพืช ลดคำถามที่ไม่จำเป็น
- ปรับข้อความขอข้อมูลเพิ่มให้เกษตรกรส่งเสียงตอบได้ทันที ไม่ต้องพูด Activity ID
- เพิ่ม regression tests สำหรับ `แปลง 1` ↔ `แปลงหนึ่ง` และการรวม follow-up; test ผ่าน 19/19

## 2026-10-18 — Durable LINE notification outbox

- เพิ่ม worksheet `Outbox` ที่สร้าง schema อัตโนมัติใน Google Sheets
- บันทึกข้อความก่อนเรียก LINE Push API และเก็บสถานะ `PENDING`, `DELIVERED`, `DEAD_LETTER`
- เพิ่ม exponential backoff สูงสุด 30 นาทีและย้ายเข้า dead letter หลังล้มเหลว 5 ครั้ง
- retry งานที่ถึงเวลาแบบ opportunistic เมื่อ LINE webhook ถัดไปเข้ามา
- เพิ่ม Admin API และหน้า Dashboard สำหรับดูจำนวนค้าง ลองส่งงานที่ถึงเวลา และกู้ข้อความรายรายการ
- เพิ่ม `/ready` เพื่อตรวจ data store และความครบถ้วนของ LINE/AI configuration โดยไม่เปิดเผย secret
- เพิ่ม audit snapshot เมื่อ Admin สั่ง process/retry คิว
- เพิ่ม automated tests กรณีส่งล้มเหลว ส่งซ้ำสำเร็จโดยไม่สร้างรายการซ้ำ และเข้าสู่ dead letter
