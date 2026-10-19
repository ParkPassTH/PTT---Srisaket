# แผนปรับระบบให้ตอบโจทย์ Data Pack และ Working PoC

> วันที่จัดทำ: 19 ตุลาคม 2569  
> สถานะ: แผนอนุมัติขอบเขต ยังไม่ใช่หลักฐานว่าฟีเจอร์ใหม่เสร็จแล้ว

## 1. เป้าหมายที่พิสูจน์ได้

ระบบต้องพิสูจน์ 4 ผลลัพธ์โดยไม่กล่าวอ้างเกินข้อมูล:

1. นำข้อมูลเดิมกลับมาใช้ได้โดยไม่ให้เกษตรกรกรอกใหม่ทั้งหมด
2. ตรวจปัญหาก่อนข้อมูลเข้าสู่ระบบจริง และมีมนุษย์รับรองข้อมูลที่มีผลต่อมาตรฐาน
3. เชื่อมเกษตรกร–แปลง–กิจกรรม–ล็อต–สถานที่–ยอดคงเหลืออย่างตรวจสอบย้อนหลังได้
4. แสดงผลก่อน–หลังจากค่าที่วัดจริง พร้อมข้อผิดพลาดและข้อจำกัด

## 2. ลำดับดำเนินงานและ Gate

### Gate 0 — ยืนยันข้อมูลต้นทางและสิทธิ์

งาน:

- ระบุว่าเอกสารจริงอยู่กับใคร อยู่ในกระดาษ Excel/CSV/Sheets หรือโปรแกรมเดิม
- ขอ sample ที่ปกปิดข้อมูลส่วนบุคคลและหนังสืออนุญาตใช้ใน PoC
- ทำ data dictionary และ mapping สำหรับสมาชิก แปลง ประวัติตรวจ กิจกรรม ล็อต และสถานะ T1/T2
- เก็บ baseline ด้วยชุดงานเดิม: เวลาที่ใช้ จุดกรอกซ้ำ ข้อมูลขาด งานแก้ และความคลาดเคลื่อนยอดล็อต

ผ่านเมื่อ:

- มี data inventory, owner, lawful/consented purpose, sample และผู้อนุมัติ mapping
- คำว่า T1/T2 และเงื่อนไข “พร้อมจัดสรร” ได้รับนิยามจากผู้รับผิดชอบ ไม่ใช่ทีมพัฒนาสมมติ

### Gate 1 — CSV/XLSX Import Preview

Flow:

```text
เลือกไฟล์ → จับคู่คอลัมน์ → Dry run → Data Quality Report
→ ผู้ใช้แก้/ตัดแถว → Preview สรุป → ยืนยัน Commit → Audit + Batch ID
```

ต้องแสดง:

- จำนวนทั้งหมด ผ่าน มีปัญหา ซ้ำ และถูกข้าม
- ตัวอย่างข้อมูลก่อนนำเข้า พร้อมเลขแถวต้นทาง
- ข้อผิดพลาดรายช่องและวิธีแก้
- รายการที่จะสร้างใหม่ อัปเดต หรือไม่เปลี่ยน
- checksum, batch ID, ผู้นำเข้า และเวลานำเข้า

ผ่านเมื่อ:

- Preview ไม่แก้ข้อมูลจริง
- ไฟล์เดิมนำเข้าซ้ำไม่สร้างข้อมูลซ้ำ
- commit บางส่วนโดยไม่ตั้งใจไม่ได้
- rollback ใช้สถานะ/compensating event และคง audit ไว้

### Gate 2 — Data Quality และ Human Review

ตรวจอย่างน้อย:

- รหัสซ้ำและแถวซ้ำ
- required fields และชนิดข้อมูล
- วันที่ไม่ถูกต้อง/อยู่ในอนาคตโดยไม่มีเหตุผล
- หน่วยไม่อยู่ใน controlled list
- เกษตรกร–แปลงไม่สัมพันธ์กัน
- กิจกรรมเก็บเกี่ยวไม่มีปริมาณ/หน่วย
- ล็อตไม่มีต้นทาง หรือเชื่อมกิจกรรมที่ไม่ใช่เก็บเกี่ยว
- ค่า T1/T2/สถานะมาตรฐานไม่รู้จัก

ข้อมูลจาก OCR หรือ mapping ที่ไม่มั่นใจต้องเป็น `NEEDS_REVIEW`; “ข้อมูลครบ” ไม่เท่ากับ “ผ่านมาตรฐาน”

### Gate 3 — OCR และระบบเดิม

- OCR ทำหลัง CSV path เสถียร ผล OCR เข้า staging เท่านั้น
- แสดงภาพต้นฉบับคู่กับค่าที่อ่าน และให้เจ้าหน้าที่ยืนยันรายช่องสำคัญ
- Legacy connector ทำเมื่อยืนยัน API/export และสิทธิ์แล้ว; ถ้าไม่มี ให้ใช้ controlled export ไม่ scrape ระบบ

### Gate 4 — LotMatch และ Stock Ledger

เพิ่มบัญชี movement แบบ append-only:

```text
RECEIVE → RESERVE → RELEASE หรือ SHIP
                   ↘ ADJUST / RECALL พร้อมเหตุผล
```

ตัวเลขหลัก:

- `on_hand` = รับเข้า - จ่ายออก ± ปรับยอดที่อนุมัติ
- `reserved` = จอง - ปลดจอง - จ่ายจากรายการจอง
- `available` = on_hand - reserved เฉพาะล็อตที่ผ่าน eligibility

กฎ:

- ห้ามยอดติดลบ
- VOID/RECALLED/พักใช้/ไม่ผ่านมาตรฐานไม่รวมใน available
- T1/T2 และ eligibility ต้องมาจาก controlled rules ที่ ICS อนุมัติ
- ทุก movement ระบุจำนวน หน่วย ผู้ทำ เวลา เหตุผล และ before/after balance

### Gate 5 — Impact Dashboard

แสดงค่าจริง ไม่สร้างเปอร์เซ็นต์สมมติ:

- median time ต่อหนึ่งรายการก่อน/หลัง
- จำนวนช่องที่ต้องพิมพ์ซ้ำ
- จำนวน/อัตราข้อมูลขาด
- duplicate prevented และรายการต้องแก้
- import pass/error/review counts ต่อ batch
- lot reconciliation difference
- เวลาจากรับข้อมูลถึงยืนยัน

ทุก metric ต้องมีนิยาม ช่วงเวลา ขนาดตัวอย่าง และลิงก์กลับไปยังรายการต้นทาง

### Gate 6 — Controlled Pilot และ Evidence Pack

ทดลองกับกลุ่มเล็กที่ยินยอม โดยใช้ชุดงานเดียวกันเปรียบเทียบก่อน–หลัง กำหนดผู้ช่วย ช่องทางแจ้งปัญหา เกณฑ์หยุด และวิธีกลับไปใช้กระบวนการเดิม

ส่งมอบหลักฐาน 4 ชิ้น:

1. **Process Map:** As-Is/To-Be, owner, handoff, pain point และ control
2. **Working PoC:** Import Preview, quality report, human review, lot ledger และ dashboard บนข้อมูลที่ได้รับอนุญาต
3. **Test Report:** Test ID, input, expected, actual, pass/fail, defect, retest และหลักฐาน
4. **Implementation Plan:** data owner, consent, pilot cohort, training/support, timeline, metrics, rollback และข้อจำกัด

## 3. ลำดับพัฒนาที่ล็อกไว้

1. Discovery + consent + sample
2. CSV/XLSX staging, mapping และ preview
3. Data Quality + controlled commit/rollback
4. Provenance + legacy review queue
5. Stock ledger + T1/T2 + allocation
6. Impact Dashboard
7. OCR แล้วจึงพิจารณา legacy API
8. Pilot + evidence pack
9. Durable multi-user/RBAC เป็นงานท้ายสุดตามคำขอเดิม แต่ก่อนใช้งานหลายเจ้าหน้าที่ต้องกลับมาปิดงานนี้

## 4. สิ่งที่ไม่ทำก่อนมีหลักฐาน

- ไม่ให้ AI ตัดสินว่าผ่านมาตรฐาน
- ไม่กล่าวว่าชุมชนไม่มีระบบเดิม
- ไม่กล่าวว่าลดงานกรอกซ้ำก่อนวัด baseline/after
- ไม่ทำระบบพยากรณ์ผลผลิตหรือซื้อขายเต็มรูปแบบ
- ไม่นำ OCR เข้า production โดยไม่มี human verification
- ไม่แก้ Google Sheet โดยตรงระหว่าง pilot เพราะจะหลุด audit trail

## 5. Definition of Done ของ MVP ที่ตอบโจทย์นี้

- นำเข้าไฟล์ตัวอย่างที่ได้รับอนุญาตผ่าน Preview และ Data Quality ได้
- ไฟล์ซ้ำไม่สร้างข้อมูลซ้ำ และทุก batch ตรวจ/ย้อนกลับได้
- ข้อมูล legacy มี source และ verification status
- เจ้าหน้าที่ตัดสินรายการสำคัญพร้อม audit ก่อน–หลัง
- ยอด on-hand/reserved/available reconcile ได้และล็อตไม่ผ่านเงื่อนไขไม่ถูกจัดสรร
- Dashboard แสดงค่าก่อน–หลังจากข้อมูลจริง
- Test Report และ evidence pack มีทั้งผลผ่าน ผลไม่ผ่าน และข้อจำกัด
