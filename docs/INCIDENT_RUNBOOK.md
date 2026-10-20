# Incident, Monitoring and Rollback Runbook

## Signals

- `/health` ไม่ตอบ 200: function/application unavailable
- `/ready` เป็น degraded: data store, LINE หรือ AI configuration ไม่พร้อม
- Outbox `PENDING` เกิน SLA หรือ `DEAD_LETTER` เพิ่ม: LINE delivery failure
- กิจกรรม `FAILED_RETRYABLE` เพิ่ม: AI/Sheets timeout หรือ quota
- import/stock conflict เพิ่มผิดปกติ: data-quality หรือ concurrent operation

## Severity

- SEV-1: ข้อมูลสูญหาย/ข้ามบัญชี, public PII, ยอดคลังผิด, signature bypass — หยุด flow ที่เกี่ยวข้องและแจ้ง owner ทันที
- SEV-2: LINE/AI/Sheets ใช้ไม่ได้แต่ข้อมูลยังคงอยู่ — เปิด manual fallback และติดตามทุก 30 นาที
- SEV-3: งานบางรายการล้มเหลว/หน้าจอผิด — บันทึก defect และแก้ตามรอบ

## Response

1. บันทึกเวลา ผู้พบ deployment/commit และ correlation/source ID; ห้ามคัดลอก secret ลง incident log
2. ตรวจ `/health`, `/ready`, integration panel, outbox และ provider status/quota
3. จำกัดผลกระทบ: หยุด cron/retry หรือปิด action ที่ทำยอดผิด; ไม่ลบข้อมูล
4. export backup และเก็บ checksum ก่อนแก้
5. rollback application หาก defect มาจาก release; ข้อมูลใช้ forward/compensating correction
6. ตรวจ critical path และ reconciliation ก่อนเปิดอีกครั้ง
7. เขียน root cause, affected IDs, recovery, prevention และผู้อนุมัติปิดเหตุการณ์

## Free-hosting monitoring

- External uptime monitor เรียก `/health` ทุก 5 นาทีและ `/ready` ทุก 10 นาที
- Scheduled job เรียก endpoint worker ที่มี secret header; ห้ามใช้ session cookie
- endpoint ที่ใช้คือ `GET /api/system/workers/process` พร้อม `Authorization: Bearer <CRON_SECRET>` ทุก 5 นาที; `401` หมายถึง secret ไม่ตรง และ `503 WORKER_NOT_CONFIGURED` หมายถึง environment ยังไม่ครบ
- ตั้ง quota/budget alert ใน Gemini/Google Cloud และ alert การใช้ Vercel Function
- ผู้รับ alert และช่องทางสำรองต้องกรอกใน deployment environment/runbook ขององค์กร ไม่เก็บข้อมูลส่วนบุคคลไว้ใน repository สาธารณะ
