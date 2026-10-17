# Voice-to-ICS & Smart Inventory

ระบบต้นแบบที่พัฒนาเพื่อให้เกษตรกรกลุ่มผักไหมบันทึกกิจกรรมแปลงด้วยเสียงผ่าน LINE และให้เจ้าหน้าที่ ICS ตรวจหลักฐาน จัดการความเสี่ยง และติดตามล็อตสินค้าผ่าน Web Dashboard

## สถานะปัจจุบัน

Foundation milestone พร้อมใช้งานในโหมดข้อมูลทดสอบ:

- Express + TypeScript API
- Dashboard responsive ภาษาไทย
- Login/session และ role checks
- Activity review พร้อม audit event
- ICS rule engine ที่แยกจาก AI และมี automated tests
- LINE webhook signature/idempotency entry point
- Privacy-safe public trace API
- Health check, rate limit, security headers และ structured errors

ยังไม่ถือว่า production launch complete จนกว่าจะเชื่อม Google Sheets, OpenAI, LINE reply, approved ICS rule list และทดสอบกับ credentials จริง

## เริ่มใช้งานในเครื่อง

ต้องมี Node.js 20 ขึ้นไป แนะนำ Node.js 22 ตาม `.node-version`

```bash
npm install
copy .env.example .env
npm run dev
```

เปิด `http://localhost:3000`

บัญชีทดสอบจาก `.env.example`:

```text
admin@example.com
change-this-before-deploy
```

ห้ามใช้ค่าดังกล่าวบนระบบที่เปิดให้อินเทอร์เน็ตเข้าถึง

## ตรวจสอบก่อน commit/deploy

```bash
npm run check
npm audit --omit=dev
node scripts/visual-check.mjs
```

## เอกสารโครงการ

- `PRODUCT.md` — ข้อเท็จจริงและหลักการผลิตภัณฑ์
- `FEATURES.md` — ทะเบียนฟีเจอร์และสถานะ
- `TASKS.md` — แผนงานและ task ปัจจุบัน
- `WORKLOG.md` — บันทึกการทำงานและผลตรวจ
- `docs/SYSTEM_FLOW.md` — flow และ architecture สำหรับนำเสนอ
- `docs/DEPLOYMENT.md` — ขั้นตอน deploy และตั้งค่า LINE
- `docs/NEXT_STAGE_INTEGRATION.md` — คู่มือต่อ Google Sheets, LINE และ OpenAI พร้อม acceptance tests
- `docs/TROUBLESHOOTING.md` — แนวทางวิเคราะห์และแก้ปัญหา

## ความปลอดภัย

- เก็บ secret ใน environment variables เท่านั้น
- LINE webhook ตรวจ HMAC signature ก่อนอ่าน event
- Dashboard API ต้องผ่าน session และ role authorization
- หน้า trace สาธารณะไม่คืนชื่อหรือรหัสเกษตรกร
- AI output ต้องผ่าน schema และ deterministic rules ก่อนเข้าสู่ workflow
- ผล `PROVISIONALLY_CLEAR` ไม่ใช่การรับรองมาตรฐาน

## หมายเหตุเรื่องข้อมูลทดสอบ

ชื่อเกษตรกร แปลง และล็อตที่เห็นในระบบปัจจุบันเป็นข้อมูลสมมติสำหรับตรวจ UI/flow ไม่ใช่ข้อมูลจริงของชุมชน
