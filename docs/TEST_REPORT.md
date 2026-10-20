# MVP Test Report

> ผลอัตโนมัติล่าสุดต้องอ้างจาก CI ของ commit ที่ deploy จริง หลักฐาน pilot จริงให้กรอกเพิ่มโดยไม่ลบผลเดิม

## Automated evidence

| Test area | Input | Expected | Actual | Status |
|---|---|---|---|---|
| LINE idempotency | source event ซ้ำ | ไม่สร้างกิจกรรมซ้ำ | regression test ครอบคลุม | PASS |
| Voice correction | ขอแก้รายการเดิม + เสียงใหม่ | revision เพิ่ม, activity ID เดิม | regression test ครอบคลุม | PASS |
| Import preview | CSV/XLSX valid/error/duplicate | ไม่เขียนทะเบียนก่อน commit | service/API tests ครอบคลุม | PASS |
| Import commit | batch READY ถูกเรียกซ้ำ | entity ไม่ซ้ำ | idempotent commit test | PASS |
| Import verification | verify/reject รายแถว | provenance + audit before/after | service/API tests | PASS |
| Stock ledger | RECEIVE/RESERVE/RELEASE/SHIP/ADJUST | reconcile และไม่ติดลบ | service/API tests | PASS |
| Recall | ล็อตถูกเรียกคืน | available เป็น 0 | service test | PASS |
| Backup compatibility | archive ก่อนเพิ่ม entity ใหม่ | validate/restore ได้ | compatibility test | PASS |
| Responsive UI | 1440px และ 390px | ไม่มี horizontal overflow | Chromium capture | PASS |

## Controlled pilot cases

| ID | Input/Scenario | Expected | Actual | Pass/Fail | Evidence/Defect |
|---|---|---|---|---|---|
| PILOT-01 | ไฟล์สมาชิกที่ได้รับอนุญาต | preview ระบุ valid/error/duplicate ถูกต้อง | รอ pilot | NOT RUN | ผู้รับผิดชอบแนบไฟล์ปกปิดข้อมูล |
| PILOT-02 | ไฟล์แปลงที่อ้างสมาชิกจริง | จับคู่สมาชิกและกัน orphan | รอ pilot | NOT RUN | — |
| PILOT-03 | เสียงกิจกรรมจากเกษตรกรกลุ่มทดลอง | transcript/fields ให้คนยืนยันได้ | รอ pilot | NOT RUN | — |
| PILOT-04 | เสียงแก้ไขรายการเดิม | ไม่สร้างกิจกรรมใหม่ | รอ pilot | NOT RUN | — |
| PILOT-05 | เก็บเกี่ยว → ล็อต → จอง → ส่งมอบ | ยอด reconcile และ trace ย้อนกลับได้ | รอ pilot | NOT RUN | — |
| PILOT-06 | ล็อตพักใช้/ไม่ผ่าน | ไม่รวม available | รอกฎ ICS | BLOCKED | ต้องมี controlled definitions |

## Defect rule

- Critical: ข้อมูลสูญหาย/ซ้ำ, signature bypass, ยอดติดลบ, ล็อตไม่ผ่านถูกจัดสรร — หยุด pilot
- Major: ทำ critical path ไม่จบแต่ข้อมูลกู้ได้ — แก้ก่อนรอบถัดไป
- Minor: copy/layout ที่ไม่เปลี่ยนความถูกต้อง — บันทึกและจัดรอบแก้

