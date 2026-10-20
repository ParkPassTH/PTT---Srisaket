# Controlled Pilot and Implementation Plan

## Preconditions

- เจ้าของข้อมูลและวัตถุประสงค์การใช้ได้รับการยืนยัน
- มี consent/หนังสืออนุญาตและไฟล์ตัวอย่างที่ปกปิดข้อมูล
- ICS ลงนามนิยามกฎ สาร หน่วย T1/T2 และผู้อนุมัติ
- backup/restore, incident contact และ rollback deployment ผ่านการซ้อม

## Cohort

- เกษตรกรกลุ่มเล็กที่สมัครใจ
- เจ้าหน้าที่นำเข้า 1–2 คน, ผู้ตรวจ ICS 1–2 คน, ผู้ดูแลคลัง 1 คน
- ใช้ชุดงานเดียวกันเทียบ As-Is/To-Be; ไม่ขยายทั้งชุมชนก่อนปิด defect สำคัญ

## Measurements

| Metric | นิยาม | แหล่งข้อมูล |
|---|---|---|
| handling time | เวลารับข้อมูลถึงยืนยัน | activity/import timestamps |
| missing fields | รายการที่มี required issue | flag/import issues |
| duplicate prevented | source/checksum/member duplicate | import rows/idempotency |
| rework | correction/reject/retry count | audit events |
| stock variance | expected balance - observed count | ledger + physical count |
| evidence retrieval | เวลาหาหลักฐานล็อตครบ | timed pilot observation |

Dashboard แสดงเฉพาะค่าที่มีข้อมูลจริง พร้อมช่วงเวลาและขนาดตัวอย่าง หากไม่มี baseline ต้องแสดง “ยังไม่มี baseline”

## Stop and rollback criteria

- หยุดทันทีเมื่อพบข้อมูลข้ามเกษตรกร, ยอดติดลบ, duplicate ที่กระทบล็อต, PII บน public trace หรือ rule ตัดสินแทน ICS
- ปิดการรับผู้ใช้ใหม่, เก็บหลักฐาน, export backup และ rollback application ไป deployment ที่ผ่าน verification
- ไม่ลบ audit หรือย้อน Google Sheets ด้วยการแก้มือ; ใช้ compensating event/สถานะ

## Handover

- Operator manual + troubleshooting
- Process map + test report + defect log
- รายการ environment/owner โดยไม่บันทึก secret
- รายงาน baseline/after และข้อจำกัด

