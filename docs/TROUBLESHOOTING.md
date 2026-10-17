# Troubleshooting & Incident Runbook

## หลักการวิเคราะห์

ตรวจจากต้นทางไปปลายทางและเก็บ `sourceEventId`, `activityId`, `lotId` เป็น correlation keys ห้ามแก้ข้อมูลใน Google Sheets โดยตรงโดยไม่บันทึก audit

## Dashboard เปิดไม่ได้

1. เปิด `/health`
2. ตรวจ Render deploy/log
3. ตรวจ `NODE_ENV`, `PORT` และ start command
4. ถ้า health ผ่านแต่หน้าเว็บ 500 ให้ตรวจว่า `dist/public/index.html` มีอยู่หลัง build
5. rollback หากเกิดหลัง deploy ล่าสุด

## เข้าสู่ระบบไม่ได้

- ตรวจ `ADMIN_EMAIL` และ `ADMIN_PASSWORD` ว่าถูกตั้งบน environment จริง
- production จะไม่ยอม start หากยังใช้ default password/secret
- ล้าง cookie เฉพาะโดเมนและลองใหม่
- ตรวจ rate-limit response; รอครบ window หากลองผิดหลายครั้ง

## LINE Verify ไม่ผ่าน

- URL ต้องเป็น HTTPS และลงท้าย `/webhooks/line`
- `LINE_CHANNEL_SECRET` ต้องมาจาก channel เดียวกัน
- ห้ามมี proxy ที่เปลี่ยน raw request body ก่อนตรวจ signature
- ดู response code: 401 หมายถึง signature, 503 หมายถึงยังไม่ตั้ง secret

## ส่งเสียงแล้วไม่มีรายการ

1. ตรวจ LINE webhook delivery log
2. ตรวจว่า LINE user ถูกผูกกับ Farmer ID
3. ค้น `webhookEventId` เพื่อดูว่าเป็น duplicate หรือไม่
4. ตรวจ processing status: `RECEIVED`, `FAILED_RETRYABLE`, `DEAD_LETTER`
5. ห้ามให้ผู้ใช้ส่งซ้ำทันทีหากระบบรับ event แล้ว เพราะอาจเกิดบันทึกซ้ำ

## AI คืนข้อมูลผิดหรือไม่ครบ

- เก็บ transcript และ raw structured response ในพื้นที่ที่มีสิทธิ์เท่านั้น
- ตรวจ schema validation error
- ส่ง `NEEDS_REVIEW`; ห้ามเปลี่ยนเป็น Passed เพื่อให้ flow เดินต่อ
- เพิ่ม test fixture ก่อนแก้ prompt/rule
- ห้ามเพิ่มสารลง allowlist จากคำตอบ AI โดยไม่มีผู้มีอำนาจอนุมัติ

## Google Sheets quota หรือ sync ล้มเหลว

- เปลี่ยนสถานะเป็น `FAILED_RETRYABLE`
- retry แบบ exponential backoff
- ตรวจ service account และสิทธิ์ sheet
- ตรวจ header/schema drift
- เมื่อเกิน retry ให้เข้า dead-letter queue และแจ้ง admin
- ห้ามลบข้อมูลใน outbox ก่อนปลายทางตอบสำเร็จ

## ข้อมูลซ้ำ

- ค้น `sourceEventId` และ Lot ID
- รักษารายการแรกเป็นหลักฐานต้นทาง
- void รายการซ้ำพร้อมเหตุผลและ audit; ห้าม hard delete
- เพิ่ม regression test ของ event ที่ทำให้ซ้ำ

## QR เปิดแล้วไม่พบล็อต

- ตรวจ token ไม่ใช่ Lot ID ธรรมดา
- ตรวจ `PUBLIC_TRACE_ENABLED`
- ตรวจล็อตว่า `VOID` หรือ token ถูก rotate
- QR เก่าไม่ควรชี้ไปล็อตอื่น ให้แสดงสถานะที่อธิบายได้

## ระบบฟรีตื่นช้า

Render Free service อาจพักหลังไม่มี traffic นี่เป็นข้อจำกัดของ hosting ไม่ใช่ bug ของ application ถ้า LINE webhook ต้องตอบเร็วสม่ำเสมอ ให้ย้ายเป็น paid always-on instance หรือ provider ที่มี SLA

## Incident severity

| ระดับ | ตัวอย่าง | การตอบสนอง |
|---|---|---|
| SEV-1 | ข้อมูลสูญหาย/รั่ว, lot ผิดคน, secret เปิดเผย | ปิด integration, revoke key, แจ้งผู้รับผิดชอบทันที |
| SEV-2 | webhook ใช้ไม่ได้, งานค้างทั้งระบบ | rollback/กู้ service และสื่อสารผู้ใช้ |
| SEV-3 | รายการเดียวประมวลผลผิด, UI บางส่วนเสีย | quarantine รายการ แก้พร้อม regression test |
| SEV-4 | copy/visual defect ไม่กระทบข้อมูล | บันทึก task และแก้ในรอบปกติ |

## หลังแก้เหตุการณ์

1. เพิ่มหรือแก้ automated test
2. อัปเดต `FEATURES.md` หาก behavior เปลี่ยน
3. อัปเดต `TASKS.md`
4. append สิ่งที่เกิด ผลกระทบ สาเหตุ และหลักฐานตรวจใน `WORKLOG.md`

