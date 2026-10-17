# System Flow — Voice-to-ICS & Smart Inventory

> เอกสารนี้ใช้เป็นภาพประกอบการนำเสนอและเป็นข้ออ้างอิงร่วมของทีมพัฒนา
>
> เวอร์ชัน: 0.1.0 · อัปเดตล่าสุด: 17 ตุลาคม 2569

## 1. แนวคิดของระบบในหนึ่งประโยค

เกษตรกรพูดบันทึกงานผ่าน LINE ระบบแปลงเสียงเป็นข้อมูลที่ตรวจสอบได้ เจ้าหน้าที่ ICS รับรองรายการที่มีผลต่อมาตรฐาน และกิจกรรมเก็บเกี่ยวที่ผ่านการยืนยันจะเชื่อมต่อไปเป็นล็อตสินค้าพร้อม QR สำหรับตรวจสอบย้อนกลับ

## 2. ผู้ใช้งานและหน้าที่

| ผู้ใช้งาน | ช่องทาง | งานหลัก | สิ่งที่ระบบต้องรับประกัน |
|---|---|---|---|
| เกษตรกร | LINE Official Account | ส่งเสียงบันทึกกิจกรรม ยืนยันหรือแก้ข้อมูล ดูบันทึกของตน | ใช้ง่าย ไม่ต้องพิมพ์มาก ได้รับผลตอบกลับชัดเจน |
| เจ้าหน้าที่ ICS | Web Dashboard | ตรวจรายการเสี่ยง แก้ข้อมูล อนุมัติหรือขอข้อมูลเพิ่ม | เห็นหลักฐาน เหตุผล และประวัติการแก้ไขครบ |
| ผู้จัดการคลัง | Web Dashboard | ตรวจล็อต เปลี่ยนสถานะคลังและการจัดส่ง | ล็อตไม่ซ้ำ ย้อนกลับถึงกิจกรรมต้นทางได้ |
| ผู้ตรวจสอบ/ผู้รับสินค้า | หน้า Trace สาธารณะตามสิทธิ์ | สแกน QR เพื่อตรวจที่มา | เห็นเฉพาะข้อมูลที่อนุญาตและไม่เปิดเผยข้อมูลส่วนบุคคลเกินจำเป็น |
| ผู้ดูแลระบบ | Web Dashboard | จัดการผู้ใช้ กฎความเสี่ยง และสถานะบริการ | การเปลี่ยนแปลงสำคัญมี audit trail |

## 3. ภาพรวมระบบ

```mermaid
flowchart LR
    Farmer[เกษตรกร] -->|ข้อความเสียง / คำสั่ง| LINE[LINE Official Account]
    LINE -->|Signed Webhook| API[Node.js + Express API]
    API --> Queue[(Job Queue)]
    Queue --> STT[Speech-to-Text]
    STT --> Extract[Structured Extraction]
    Extract --> Rules[ICS Rule Engine]
    Rules --> Repo[Repository Layer]
    Repo --> Sheets[(Google Sheets)]
    Repo -. ย้ายในอนาคต .-> PG[(PostgreSQL)]
    Rules --> Reply[LINE Flex Message]
    Reply --> LINE

    Admin[เจ้าหน้าที่ ICS] --> Dashboard[Web Dashboard]
    Dashboard --> API
    API --> Auth[Authentication + RBAC]
    API --> Audit[(Audit Trail)]

    Repo --> Lot[Lot & Inventory Service]
    Lot --> QR[QR / Trace Link]
    Consumer[ผู้ตรวจสอบหรือผู้รับสินค้า] -->|สแกน QR| Trace[Public Trace Page]
    Trace --> API
```

### หลักการแบ่งความรับผิดชอบ

- **LINE** เป็นช่องทางรับข้อมูลจากเกษตรกร ไม่ใช่ฐานข้อมูลหลัก
- **API** ตรวจลายเซ็น รับคำขอ และตอบกลับอย่างรวดเร็ว
- **Job Queue** แยกงานที่ใช้เวลานาน เช่น ดาวน์โหลดเสียงและเรียก AI ออกจาก webhook
- **AI Extraction** ทำหน้าที่แปลงเสียง/ข้อความเป็นข้อมูลที่มีโครงสร้าง
- **ICS Rule Engine** ใช้กฎที่ควบคุมและทดสอบได้ ไม่ให้ AI ตัดสินมาตรฐานลำพัง
- **Human Review** เป็นจุดรับรองผลเมื่อข้อมูลไม่ครบ ความมั่นใจต่ำ หรือมีความเสี่ยง
- **Repository Layer** แยก business logic ออกจาก Google Sheets เพื่อย้ายฐานข้อมูลได้
- **Audit Trail** บันทึกว่าใครเปลี่ยนอะไร จากค่าใดเป็นค่าใด และเมื่อไร

## 4. Flow A — ลงทะเบียนและผูกบัญชีเกษตรกร

```mermaid
flowchart TD
    A[เกษตรกรเพิ่มเพื่อน LINE OA] --> B{LINE User ID ถูกผูกแล้วหรือยัง}
    B -- ยัง --> C[ระบบขอรหัสสมาชิกหรือเบอร์ที่ลงทะเบียน]
    C --> D[ตรวจข้อมูลกับทะเบียนเกษตรกร]
    D --> E{ตรงกันหรือไม่}
    E -- ไม่ตรง --> F[แจ้งให้ติดต่อเจ้าหน้าที่ โดยไม่เปิดเผยข้อมูลสมาชิก]
    E -- ตรง --> G[ส่ง OTP หรือให้เจ้าหน้าที่อนุมัติ]
    G --> H[ผูก LINE User ID กับ Farmer ID]
    H --> I[แสดงเมนู บันทึกด้วยเสียง / ดูบันทึกของฉัน / ขอความช่วยเหลือ]
    B -- ผูกแล้ว --> I
```

จุดควบคุมสำคัญ:

1. ไม่ใช้ LINE display name เป็นตัวระบุเกษตรกรหลัก เพราะเปลี่ยนได้และชื่อซ้ำได้
2. เก็บ `Farmer_ID` และ `LINE_User_ID` แยกกัน
3. บัญชีหนึ่งต้องไม่ผูกเกษตรกรหลายคนโดยไม่ผ่านขั้นตอนเจ้าหน้าที่

## 5. Flow B — บันทึกกิจกรรมแปลงด้วยเสียง

```mermaid
sequenceDiagram
    autonumber
    actor F as เกษตรกร
    participant L as LINE
    participant A as API
    participant Q as Job Queue
    participant S as Speech-to-Text
    participant X as Data Extractor
    participant R as ICS Rule Engine
    participant D as Data Repository

    F->>L: ส่งข้อความเสียง
    L->>A: Webhook event + signature
    A->>A: ตรวจ signature และ event ID
    alt signature ไม่ถูกต้อง
        A-->>L: 401 Reject
    else event ซ้ำ
        A-->>L: 200 Already received
    else event ใหม่
        A->>D: บันทึกสถานะ RECEIVED
        A->>Q: ส่งงานประมวลผล
        A-->>L: 200 Accepted
        Q->>L: ดาวน์โหลดไฟล์เสียงด้วย message ID
        Q->>S: ถอดเสียงภาษาไทย
        S-->>Q: transcript + metadata
        Q->>X: สกัดข้อมูลตาม schema
        X-->>Q: activity draft + confidence
        Q->>R: ตรวจข้อมูลและกฎ ICS
        R-->>Q: status + reasons + missing fields
        Q->>D: บันทึก draft, transcript, rule result
        Q->>L: ส่ง Flex Message สรุปให้ยืนยัน
        L-->>F: สรุปข้อมูล + ปุ่มยืนยัน/แก้ไข
    end
```

### สถานะของงานประมวลผล

```mermaid
stateDiagram-v2
    [*] --> RECEIVED
    RECEIVED --> PROCESSING: worker รับงาน
    PROCESSING --> NEEDS_CONFIRMATION: ข้อมูลครบแต่ต้องให้เกษตรกรยืนยัน
    PROCESSING --> NEEDS_REVIEW: เสี่ยง / confidence ต่ำ / ข้อมูลกำกวม
    PROCESSING --> FAILED_RETRYABLE: บริการภายนอกชั่วคราวล่ม
    PROCESSING --> FAILED_FINAL: ไฟล์เสียหรือรูปแบบไม่รองรับ
    FAILED_RETRYABLE --> PROCESSING: retry แบบ backoff
    FAILED_RETRYABLE --> DEAD_LETTER: เกินจำนวน retry
    NEEDS_CONFIRMATION --> CONFIRMED: เกษตรกรยืนยัน
    NEEDS_CONFIRMATION --> NEEDS_REVIEW: เกษตรกรขอแก้หรือข้อมูลไม่ครบ
    NEEDS_REVIEW --> APPROVED: เจ้าหน้าที่รับรอง
    NEEDS_REVIEW --> REJECTED: เจ้าหน้าที่ไม่รับรอง
    NEEDS_REVIEW --> AWAITING_FARMER: ขอข้อมูลเพิ่ม
    AWAITING_FARMER --> NEEDS_REVIEW: ได้รับข้อมูลตอบกลับ
    CONFIRMED --> COMPLETED
    APPROVED --> COMPLETED
    REJECTED --> COMPLETED
    DEAD_LETTER --> NEEDS_REVIEW: เจ้าหน้าที่กู้คืนงาน
    FAILED_FINAL --> [*]
    COMPLETED --> [*]
```

## 6. Flow C — การประเมินความเสี่ยงแบบน่าเชื่อถือ

AI ไม่ควรส่งค่า `Passed` แล้วถือเป็นผลรับรองทันที ระบบจึงแยกเป็น 3 ชั้น:

```mermaid
flowchart TD
    T[ข้อความถอดเสียง] --> X[AI สกัดชื่อกิจกรรม วัสดุ ปริมาณ พืช แปลง]
    X --> V[Schema Validation]
    V --> C{ข้อมูลบังคับครบและ confidence ผ่านเกณฑ์หรือไม่}
    C -- ไม่ --> Review[ส่งคิวเจ้าหน้าที่: ข้อมูลไม่ชัด]
    C -- ใช่ --> Rule[Deterministic ICS Rule Engine]
    Rule --> M{พบคำหรือสารตรงรายการควบคุมหรือไม่}
    M -- พบสารห้ามใช้ --> Flag[สถานะ FLAGGED_HIGH]
    M -- พบสารกำกวม/ไม่รู้จัก --> Review2[สถานะ NEEDS_REVIEW]
    M -- ไม่พบ --> Safe{กิจกรรมมีผลต่อการรับรองสูงหรือไม่}
    Safe -- ใช่ --> Review3[ให้เจ้าหน้าที่รับรอง]
    Safe -- ไม่ --> Provisional[PROVISIONALLY_CLEAR]
    Flag --> Admin[แจ้งเตือนเจ้าหน้าที่พร้อมหลักฐาน]
    Review2 --> Admin
    Review3 --> Admin
    Provisional --> Farmer[ให้เกษตรกรยืนยันข้อมูล]
```

### ผลลัพธ์ที่ใช้ในระบบ

| สถานะ | ความหมาย | ผู้ตัดสินขั้นสุดท้าย |
|---|---|---|
| `PROVISIONALLY_CLEAR` | ไม่พบเงื่อนไขเสี่ยงจากกฎ แต่ยังเป็นผลเบื้องต้น | ระบบ + การยืนยันข้อมูล |
| `NEEDS_REVIEW` | ข้อมูลไม่ครบ กำกวม หรือพบวัสดุที่ยังไม่รู้จัก | เจ้าหน้าที่ ICS |
| `FLAGGED_HIGH` | ตรงกฎความเสี่ยงสูงหรือสารห้ามใช้ | เจ้าหน้าที่ ICS |
| `APPROVED` | เจ้าหน้าที่ตรวจและรับรองแล้ว | เจ้าหน้าที่ ICS |
| `REJECTED` | เจ้าหน้าที่ตรวจแล้วไม่รับรอง | เจ้าหน้าที่ ICS |

## 7. Flow D — เจ้าหน้าที่ตรวจสอบรายการ

```mermaid
flowchart TD
    A[Dashboard แสดงคิวตามระดับความเร่งด่วน] --> B[เจ้าหน้าที่เปิดรายการ]
    B --> C[ฟังเสียงต้นฉบับและอ่านข้อความถอดเสียง]
    C --> D[เทียบข้อมูลที่ AI สกัดกับหลักฐาน]
    D --> E{ข้อมูลพอหรือไม่}
    E -- ไม่พอ --> F[กดขอข้อมูลเพิ่ม]
    F --> G[LINE ส่งคำถามที่เฉพาะเจาะจง]
    G --> H[เกษตรกรตอบเสียงหรือเลือกคำตอบ]
    H --> B
    E -- พอ --> I{เข้าข่ายความเสี่ยงหรือไม่}
    I -- ใช่ --> J[ยืนยันความเสี่ยง + ระบุเหตุผลและการติดตาม]
    I -- ไม่ใช่ --> K[แก้ข้อมูลหากจำเป็น แล้วอนุมัติ]
    J --> L[บันทึก audit trail]
    K --> L
    L --> M[แจ้งผลแก่เกษตรกรด้วยภาษาที่ไม่กล่าวโทษ]
```

Dashboard ต้องแสดงพร้อมกัน:

- เสียงต้นฉบับหรือปุ่มเล่นเสียง
- ข้อความที่ถอดได้
- ข้อมูลที่ AI สกัด พร้อม confidence รายฟิลด์
- กฎที่ทำให้เกิดการแจ้งเตือน
- ประวัติการแก้ไขและผู้ดำเนินการ
- ปุ่ม “ขอข้อมูลเพิ่ม”, “อนุมัติ”, “ยืนยันความเสี่ยง” และ “ยกเลิก” ที่แยกกันชัดเจน

## 8. Flow E — เก็บเกี่ยวและสร้างล็อตสินค้า

```mermaid
flowchart TD
    A[กิจกรรมระบุว่าเก็บเกี่ยว] --> B{ข้อมูลเก็บเกี่ยวครบหรือไม่}
    B -- ไม่ครบ --> C[ขอพืช ปริมาณ หน่วย วันที่ และแปลง]
    C --> A
    B -- ครบ --> D{กิจกรรมและแปลงมีรายการเสี่ยงที่ยังไม่ปิดหรือไม่}
    D -- มี --> E[พักการสร้างล็อตและแจ้งเจ้าหน้าที่]
    D -- ไม่มี --> F[เจ้าหน้าที่หรือกฎอนุมัติการสร้างล็อต]
    F --> G[สร้าง Lot ID แบบไม่ซ้ำ]
    G --> H[ผูกกิจกรรมต้นทาง เกษตรกร แปลง พืช ปริมาณ]
    H --> I[สร้าง Trace URL ที่มี opaque token]
    I --> J[สร้าง QR จาก Trace URL]
    J --> K[บันทึกล็อตสถานะ IN_STOCK]
    K --> L[ส่ง LINE Flex Message พร้อมรหัสล็อตและ QR]
```

รูปแบบ Lot ID ที่แนะนำ:

```text
{CROP_CODE}-{BUDDHIST_YEAR_SHORT}{MM}{DD}-{FARMER_CODE}-{SEQUENCE}
ตัวอย่าง: SOY-691017-LD-01
```

ข้อกำหนด:

- Lot ID สร้างที่ server และมี unique constraint หรือ lock ป้องกันเลขซ้ำ
- QR ต้องบรรจุ URL สำหรับ trace ไม่ใช่เพียง Lot ID เพื่อใช้งานสะดวก
- ห้ามใส่ข้อมูลส่วนบุคคลหรือ secret ลงใน QR
- หากยกเลิกล็อต ให้เปลี่ยนสถานะเป็น `VOID` และเก็บประวัติ ห้ามลบแถวทิ้ง

## 9. Flow F — ค้นหาและตรวจสอบย้อนกลับ

```mermaid
sequenceDiagram
    actor U as ผู้ตรวจสอบ/ผู้รับสินค้า
    participant Q as QR / Search
    participant A as API
    participant D as Repository
    participant P as Trace Page

    U->>Q: สแกน QR หรือกรอก Lot ID
    Q->>A: GET /trace/:token
    A->>D: ค้นหาล็อตและกิจกรรมที่อนุญาตให้เปิดเผย
    alt ไม่พบหรือ token ไม่ถูกต้อง
        A-->>P: 404 พร้อมวิธีตรวจรหัส
    else ล็อตถูกยกเลิก
        A-->>P: สถานะ VOID + เหตุผลที่เปิดเผยได้
    else พบล็อต
        D-->>A: lot + farm summary + activity timeline
        A-->>P: ข้อมูล trace แบบ read-only
        P-->>U: แสดงแหล่งที่มา วันที่ ปริมาณ และสถานะ
    end
```

ข้อมูลสาธารณะที่แนะนำ:

- รหัสล็อต พืช ปริมาณ วันที่เก็บเกี่ยว
- กลุ่มเกษตร/พื้นที่ระดับชุมชน โดยไม่เปิดที่อยู่ละเอียด
- timeline กิจกรรมที่อนุญาตให้เผยแพร่
- สถานะล็อตและเวลาอัปเดตล่าสุด
- ข้อความชี้แจงว่าการแสดงข้อมูลไม่ใช่ใบรับรองอัตโนมัติ

## 10. Flow G — การเปลี่ยนสถานะคลัง

```mermaid
stateDiagram-v2
    [*] --> DRAFT
    DRAFT --> IN_STOCK: ยืนยันล็อตเข้าคลัง
    IN_STOCK --> RESERVED: จองเพื่อส่งมอบ
    RESERVED --> IN_STOCK: ยกเลิกการจอง
    RESERVED --> SHIPPED: ยืนยันการจัดส่ง
    IN_STOCK --> VOID: พบข้อมูลไม่ถูกต้อง
    RESERVED --> VOID: ยกเลิกโดยผู้มีสิทธิ์
    SHIPPED --> RECALLED: เรียกคืน
    VOID --> [*]
    RECALLED --> [*]
```

ทุก transition ต้องบันทึกผู้ดำเนินการ เวลา เหตุผล และค่าก่อน/หลัง

## 11. Flow H — เมื่อบริการภายนอกขัดข้อง

```mermaid
flowchart TD
    A[งานเรียกบริการภายนอก] --> B{สำเร็จหรือไม่}
    B -- สำเร็จ --> C[ดำเนิน flow ต่อ]
    B -- ไม่สำเร็จ --> D{เป็นความผิดพลาดชั่วคราวหรือไม่}
    D -- ใช่ --> E[บันทึก attempt และ retry แบบ exponential backoff]
    E --> F{เกินจำนวน retry หรือยัง}
    F -- ยัง --> A
    F -- เกิน --> G[ส่ง Dead-letter Queue]
    G --> H[แจ้ง Admin พร้อมปุ่ม Retry]
    D -- ไม่ใช่ --> I[FAILED_FINAL]
    I --> J[แจ้งผู้ใช้ด้วยข้อความที่ทำต่อได้]
```

| จุดขัดข้อง | พฤติกรรมของระบบ | ข้อความผู้ใช้ |
|---|---|---|
| LINE ส่ง webhook ซ้ำ | ตอบ 200 แต่ไม่สร้างงานซ้ำ | ไม่ต้องแจ้งซ้ำ |
| ดาวน์โหลดเสียงไม่ได้ | retry แล้วเข้าคิวเจ้าหน้าที่ | “ระบบรับรายการแล้ว กำลังตรวจสอบไฟล์เสียง” |
| Speech-to-Text ล่ม | retry โดยไม่ให้เกษตรกรส่งใหม่ทันที | “รับเสียงแล้ว ระบบจะส่งผลเมื่อประมวลผลเสร็จ” |
| AI คืนข้อมูลผิด schema | validate, retry แบบ constrained และส่ง human review | “ระบบฟังได้บางส่วน เจ้าหน้าที่จะช่วยตรวจสอบ” |
| Google Sheets quota เต็ม | เก็บใน queue/outbox และ sync ภายหลัง | Dashboard แสดงสถานะ sync ล่าช้า |
| QR service ล่ม | สร้าง QR ภายในระบบหรือ retry | ล็อตยังถูกสร้าง แต่ QR อยู่สถานะกำลังเตรียม |
| Worker หยุดทำงาน | health check แจ้งเตือนและงานค้างใน queue | ไม่สูญหายและไม่ทำซ้ำ |

## 12. Flow I — Authentication และสิทธิ์

```mermaid
flowchart LR
    Login[เข้าสู่ระบบ] --> Session[Secure Session]
    Session --> Role{Role}
    Role -->|Reviewer| Review[ตรวจและแก้รายการ]
    Role -->|Warehouse| Inventory[จัดการล็อตและการส่ง]
    Role -->|Admin| Settings[ผู้ใช้ กฎ และระบบ]
    Role -->|Auditor| ReadOnly[อ่านรายงานและ audit แบบ read-only]
    Review --> Audit[Audit Trail]
    Inventory --> Audit
    Settings --> Audit
```

หลักการ:

- ใช้ session cookie แบบ `HttpOnly`, `Secure`, `SameSite=Lax/Strict`
- password ต้อง hash ด้วย Argon2id หรือใช้ identity provider ที่เชื่อถือได้
- ตรวจสิทธิ์ที่ server ทุกครั้ง ไม่อาศัยการซ่อนปุ่มใน UI
- งานเสี่ยง เช่น void lot, เปลี่ยนกฎ หรือ export ข้อมูล ต้องยืนยันซ้ำและบันทึกเหตุผล

## 13. โครงสร้างข้อมูลเชิงแนวคิด

```mermaid
erDiagram
    FARMER ||--o{ PLOT : owns
    FARMER ||--o{ ACTIVITY : submits
    PLOT ||--o{ ACTIVITY : has
    ACTIVITY ||--o{ REVIEW : reviewed_by
    ACTIVITY ||--o| LOT : creates
    LOT ||--o{ LOT_EVENT : changes
    USER ||--o{ REVIEW : performs
    USER ||--o{ AUDIT_EVENT : causes
    ACTIVITY ||--o{ AUDIT_EVENT : audited
    LOT ||--o{ AUDIT_EVENT : audited

    FARMER {
      string farmer_id PK
      string member_code
      string display_name
      string line_user_id
      string status
    }
    PLOT {
      string plot_id PK
      string farmer_id FK
      string name
      string crop
    }
    ACTIVITY {
      string activity_id PK
      string source_event_id UK
      string farmer_id FK
      string plot_id FK
      datetime occurred_at
      string activity_type
      string inputs_used
      string processing_status
      string risk_status
      number confidence
    }
    REVIEW {
      string review_id PK
      string activity_id FK
      string reviewer_id FK
      string decision
      string reason
      datetime reviewed_at
    }
    LOT {
      string lot_id PK
      string activity_id FK
      number quantity
      string unit
      date harvest_date
      string inventory_status
      string trace_token
    }
```

## 14. หน้าจอ Web Dashboard

```mermaid
flowchart TD
    Login[เข้าสู่ระบบ] --> Overview[ภาพรวม]
    Overview --> ReviewQueue[คิวตรวจสอบ]
    ReviewQueue --> ReviewDetail[รายละเอียดและหลักฐาน]
    ReviewDetail --> FarmerHistory[ประวัติเกษตรกร/แปลง]
    ReviewDetail --> AuditHistory[ประวัติการแก้ไข]
    Overview --> Activities[กิจกรรมแปลง]
    Overview --> Lots[ล็อตและคลัง]
    Lots --> LotDetail[รายละเอียดล็อต]
    LotDetail --> TracePreview[ตัวอย่างหน้า Trace]
    Overview --> Farmers[เกษตรกรและแปลง]
    Overview --> Reports[รายงาน]
    Overview --> Settings[ผู้ใช้ กฎ และระบบ]
```

ลำดับความสำคัญหน้าแรก:

1. งานเสี่ยงที่ต้องดำเนินการทันที
2. งานที่รอข้อมูลหรือรอตรวจ
3. สุขภาพการประมวลผลและรายการ sync ล่าช้า
4. สรุปกิจกรรมและล็อต โดยตัวเลขทุกตัวกดดูรายการต้นทางได้

## 15. Deployment Flow แบบใช้งานจริง

```mermaid
flowchart LR
    Dev[Developer] -->|push| Git[Git Repository]
    Git --> CI[CI: lint + test + build]
    CI -->|ผ่าน| Host[Free-tier Web Host]
    Host --> API[Express API + Dashboard]
    API --> Secrets[Environment Secrets]
    API --> Sheets[Google Sheets API]
    API --> LINE[LINE Webhook]
    API --> OpenAI[OpenAI API]
    Monitor[Health Check / Logs] --> Host
```

ข้อควรทราบ: hosting อาจฟรี แต่ OpenAI API, LINE message quota และบริการภายนอกอาจมีค่าใช้จ่ายตามการใช้งาน จึงต้องกำหนด budget, rate limit และ usage alert ก่อนเปิด production

## 16. เส้นเรื่องสำหรับการนำเสนอ 5 นาที

1. **ปัญหา:** เกษตรกรสูงอายุบันทึกเอกสารยาก และข้อมูลที่ไม่ครบอาจกระทบสิทธิ์มาตรฐาน
2. **จุดเริ่ม:** เกษตรกรพูดผ่าน LINE ที่ใช้อยู่แล้ว
3. **การแปลงข้อมูล:** ระบบถอดเสียง สกัดข้อมูล และตรวจด้วยกฎที่อธิบายได้
4. **ความน่าเชื่อถือ:** AI ไม่ได้ตัดสินลำพัง รายการเสี่ยงเข้าสู่ human review พร้อมหลักฐานและ audit trail
5. **ผลลัพธ์:** กิจกรรมที่ยืนยันแล้วเชื่อมสู่ล็อตและ QR ตรวจสอบย้อนหลัง
6. **ความพร้อมใช้งาน:** ระบบรับมือ webhook ซ้ำ บริการล่ม และการย้ายฐานข้อมูล โดยไม่ทำข้อมูลสูญหาย

## 17. ข้อสรุปที่ต้องยืนยันก่อน production

- รายการสารอนุญาต สารห้ามใช้ และผู้มีอำนาจอนุมัติกฎ
- เกณฑ์ confidence และกิจกรรมใดต้อง human review เสมอ
- ระยะเวลาเก็บไฟล์เสียงและนโยบายความเป็นส่วนตัว
- ข้อมูลใดเปิดเผยบนหน้า trace สาธารณะได้
- รูปแบบการยืนยันตัวตนเกษตรกรและเจ้าหน้าที่
- ผู้รับผิดชอบเมื่อพบรายการเสี่ยงและ SLA ในการตรวจ

