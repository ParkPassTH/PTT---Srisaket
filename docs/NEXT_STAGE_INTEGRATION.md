# คู่มือต่อระบบภายนอกและทดสอบระดับถัดไป

อัปเดต: 18 ตุลาคม 2569

## สถานะหลัง Implement Gate A–C

Gate A–C มีโค้ดพร้อมแล้ว: Google Sheets เป็น persistent repository, LINE เชื่อมบัญชี/ดาวน์โหลดเสียง/ตอบกลับ และ Gemini ถอดเสียงพร้อมแยกข้อมูลแบบ structured output ระบบสร้าง worksheet และ header ที่ขาดให้อัตโนมัติ แต่ต้องมีแถวเกษตรกรอย่างน้อยหนึ่งแถวก่อนทดสอบ

### ทดสอบจริงแบบสั้นที่สุด

1. ตั้ง Vercel Environment: `DATA_DRIVER=google-sheets`, Google credentials, LINE credentials, `AI_PROVIDER=gemini`, `GEMINI_API_KEY` และ `GEMINI_MODEL=gemini-3.8-flash`
2. Share Google Sheet ให้ service-account email เป็น Editor แล้ว Redeploy
3. เปิด Dashboard หนึ่งครั้งหรือเรียก API เพื่อให้ระบบสร้างแท็บ แล้วเติมแถวใน `Farmers`: `F-001 | M001 | ชื่อผู้ทดสอบ | (เว้นว่าง) | ACTIVE`
4. ใน LINE ส่ง `ลงทะเบียน M001` ต้องได้รับข้อความว่าเชื่อมบัญชีสำเร็จ และ `line_user_id` จะถูกเขียนลงชีต
5. ส่ง Voice Message เช่น “วันนี้ใส่ปุ๋ยคอกสองกระสอบ ที่แปลง P-001 ปลูกถั่วเหลือง”
6. ตรวจข้อความตอบกลับ และตรวจแถวใหม่ใน `Activities` โดยสถานะควรเป็น `NEEDS_CONFIRMATION` หรือ `NEEDS_REVIEW`

หากไม่ตอบ ให้ดู Vercel Function Logs ด้วย code `VOICE_PROCESSING_FAILED`; ห้ามนำ key หรือ private key ไปวางใน Issue/แชตสาธารณะ

## สถานะจริงตอนนี้

ระบบเป็น foundation ที่รันและทดสอบได้ แต่ยังไม่เชื่อมบัญชีภายนอกจริง

| ส่วน | สถานะ | ข้อมูลที่ใช้ |
|---|---|---|
| Dashboard, login, review, audit | ทำงานได้ | Express และข้อมูลตัวอย่าง |
| กิจกรรม/ล็อต/เกษตรกร | ชั่วคราว | `MemoryRepository` ใน RAM |
| กฎ ICS | ทำงานด้วยกฎตัวอย่าง | deterministic rules |
| LINE webhook | ตรวจ signature/รับ metadata ได้ | ยังไม่ download เสียงหรือ reply |
| Google Sheets/OpenAI | ยังไม่เชื่อม | มี environment และ contract รอไว้ |

ข้อมูล review ที่เพิ่มจะหายเมื่อ restart เพราะ `src/server.ts` ยังสร้าง `MemoryRepository`

## Google Sheets อยู่ตรงไหน

Google Sheets จะเป็น persistent data store ของ MVP ไม่ใช่หน้าจอหลักและไม่ใช่ที่เก็บรหัสผ่าน Dashboard กับ business logic ต้องเรียกผ่าน `Repository` เท่านั้น

```mermaid
flowchart LR
  UI[Dashboard] --> API[Express API]
  LINE[LINE] --> API
  API --> DOMAIN[Services และ ICS rules]
  DOMAIN --> REPO[Repository interface]
  REPO -->|ปัจจุบัน| MEM[MemoryRepository]
  REPO -.->|ระดับถัดไป| SHEETS[GoogleSheetsRepository]
```

เปลี่ยน data store ที่ `src/server.ts` ด้วย `DATA_DRIVER` โดย API/UI ไม่ต้องเปลี่ยน

### Worksheet ที่ต้องสร้าง

| Worksheet | Primary key | เนื้อหา |
|---|---|---|
| `Farmers` | `farmer_id` | สมาชิกและ `line_user_id` |
| `Activities` | `activity_id` | transcript, extraction, risk และสถานะ |
| `Reviews` | `review_id` | ผลตรวจและเหตุผล |
| `Lots` | `lot_id` | ล็อต/คลัง/trace token |
| `AuditEvents` | `audit_id` | append-only audit |
| `ProcessedEvents` | `source_event_id` | ป้องกัน webhook ซ้ำ |
| `Outbox` | `job_id` | งานรอส่ง/retry/dead-letter |

ใช้ stable ID ไม่ใช้เลขแถว, เวลาเป็น ISO 8601, array เป็น JSON string, ไม่ hard delete audit และไม่แก้ชีตข้าม workflow

## Flow เมื่อเชื่อมครบ

```mermaid
sequenceDiagram
  actor F as เกษตรกร
  participant L as LINE
  participant A as API
  participant Q as Worker/Outbox
  participant O as OpenAI
  participant S as Google Sheets
  actor I as เจ้าหน้าที่ ICS
  F->>L: ส่งเสียง
  L->>A: signed webhook
  A->>A: ตรวจ signature/event ซ้ำ
  A->>Q: ลงงานและตอบ 200
  Q->>L: download เสียงด้วย messageId
  Q->>O: transcription ภาษาไทย
  Q->>O: extraction ตาม JSON schema
  Q->>Q: validate และรัน ICS rules
  Q->>S: activity + audit + outbox
  Q->>L: ขอเกษตรกรยืนยัน/แก้ไข
  I->>A: ตรวจผ่าน Dashboard
  A->>S: review + audit
```

## Environment

คัดลอก `.env.example` เป็น `.env` และห้าม commit:

```env
DATA_DRIVER=memory
SESSION_SECRET=สุ่มอย่างน้อย-32-ตัวอักษร
LINE_CHANNEL_SECRET=
LINE_CHANNEL_ACCESS_TOKEN=
OPENAI_API_KEY=
OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
OPENAI_EXTRACTION_MODEL=gpt-4o-mini
GOOGLE_SHEET_ID=
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=
```

เปิด integration ทีละ gate และใช้ staging credentials แยกจาก production

### Gate A: แต่ละค่าหาจากไหน

| ค่า | เอามาจากไหน | ตัวอย่าง/ข้อควรระวัง |
|---|---|---|
| `DATA_DRIVER` | เรากำหนดเองใน `.env` หรือ Environment ของ hosting | ใช้ `google-sheets` สำหรับระบบจริง หรือ `memory` สำหรับ demo |
| `GOOGLE_SHEET_ID` | เปิด Google Sheet แล้วคัดลอกข้อความระหว่าง `/d/` และ `/edit` ใน URL | URL `https://docs.google.com/spreadsheets/d/1AbC_xyz/edit` ⇒ ID คือ `1AbC_xyz` |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Google Cloud Console → IAM & Admin → Service Accounts → ค่า Email | รูปแบบ `ptt-ics-staging@PROJECT_ID.iam.gserviceaccount.com`; นำ email นี้ไป Share ชีตเป็น Editor |
| `GOOGLE_PRIVATE_KEY` | ไฟล์ JSON ที่ดาวน์โหลดจาก Service Account → Keys → Add key → Create new key → JSON → field `private_key` | ต้องเอาทั้ง `BEGIN PRIVATE KEY` และ `END PRIVATE KEY`; ห้ามส่งในแชตหรือ commit |
| `GOOGLE_PROJECT_ID` | Google Cloud Console ด้านบนของหน้า Project selector หรือ field `project_id` ใน JSON | ตอนนี้โค้ดยังไม่ประกาศค่านี้แยก เพราะอ่านจาก email/key ได้; เพิ่มเฉพาะเมื่อ adapter ต้องใช้ |
| Worksheet names | เราสร้างเองใน Google Sheet | ต้องตรงตัวพิมพ์กับ `Farmers`, `Activities`, `Reviews`, `Lots`, `AuditEvents`, `ProcessedEvents`, `Outbox` |

ไฟล์ JSON ของ service account จะมีโครงสร้างประมาณนี้ แต่ห้ามนำค่าจริงมาใส่ในเอกสาร:

```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "ptt-ics-staging@your-project-id.iam.gserviceaccount.com"
}
```

การแมปคือ `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL` และ `private_key` → `GOOGLE_PRIVATE_KEY` ส่วน `GOOGLE_SHEET_ID` ไม่ได้อยู่ใน JSON ต้องเอาจาก URL ของ spreadsheet

สำหรับ local `.env` ให้ใส่ private key เป็นหนึ่งบรรทัดโดยคง `\\n`; adapter จะต้องใช้ `.replace(/\\\\n/g, "\\n")` ก่อนส่งให้ Google client บน Render ให้เก็บเป็น Secret Environment Variable และไม่อัปโหลดไฟล์ JSON เข้า repository

### ขั้นตอนคลิกแบบครบถ้วน

1. ไปที่ Google Cloud Console และสร้าง/เลือก project สำหรับ staging
2. APIs & Services → Library → ค้นหา `Google Sheets API` → Enable
3. IAM & Admin → Service Accounts → Create service account
4. ตั้งชื่อ เช่น `ptt-ics-staging`; สำหรับการเข้าถึง Sheet เฉพาะไฟล์ ไม่จำเป็นต้องให้ Project role กว้าง
5. เปิด service account → Keys → Add key → Create new key → JSON; browser จะดาวน์โหลดได้ครั้งเดียว
6. เปิดไฟล์ JSON ในเครื่องอย่างปลอดภัย แล้วนำ `client_email` และ `private_key` ไปใส่ secret store
7. สร้าง Google Sheet → เปลี่ยนชื่อ worksheet ตามตาราง → กด Share
8. วาง `client_email` เป็นผู้รับ เลือก Editor แล้วส่งคำเชิญ
9. คัดลอก `GOOGLE_SHEET_ID` จาก URL
10. ตั้ง `DATA_DRIVER=google-sheets` แล้ว redeploy; ระบบจะสร้างแท็บและ header ที่ขาดให้อัตโนมัติ

> การให้ IAM role ใน Google Cloud ไม่ได้ทำให้ service account เปิด Google Sheet ได้เอง ต้อง Share ไฟล์ Sheet ให้ service-account email โดยตรง

## Gate A — Google Sheets

### ตั้งค่า

1. สร้าง Google Cloud project และเปิด Google Sheets API
2. สร้าง service account สำหรับ server และ key สำหรับ staging
3. สร้าง spreadsheet/worksheet ตามตารางด้านบน
4. Share spreadsheet ให้ `GOOGLE_SERVICE_ACCOUNT_EMAIL` เป็น Editor
5. ใส่ spreadsheet ID และ private key ใน secret store; ถ้า provider เก็บ `\\n` ให้แปลงกลับเป็น newline ตอนสร้าง credential

### Implementation

1. สร้าง `src/repositories/google-sheets-repository.ts` ให้ implement `Repository` ครบ
2. validate worksheet/header ตอน startup
3. append review/audit/event; update aggregate ด้วย stable ID
4. เพิ่ม version/locking ป้องกันเจ้าหน้าที่เขียนทับกัน
5. ให้ `src/server.ts` เลือก memory หรือ sheets จาก `DATA_DRIVER`
6. เพิ่ม integration tests ด้วย spreadsheet ทดสอบโดยเฉพาะ

### ต้องผ่าน

- `DATA_DRIVER=sheets` start ได้ และ restart แล้วข้อมูลยังอยู่
- สร้าง activity แล้วพบใน `Activities`
- review เพิ่ม `Reviews` และ `AuditEvents` อย่างละหนึ่งแถว
- `source_event_id` เดิมไม่สร้างซ้ำ
- credential/header ผิดต้อง fail ด้วยข้อความแก้ไขได้
- Dashboard ไม่ต้องรู้ว่า backend ใช้ Sheets

## Gate B — LINE

1. สร้าง LINE OA และ Messaging API channel
2. ตั้ง `LINE_CHANNEL_SECRET` และ `LINE_CHANNEL_ACCESS_TOKEN`
3. deploy HTTPS และตั้ง webhook `https://YOUR_DOMAIN/webhooks/line`
4. กด Verify และเปิด Use webhook
5. ส่งเสียงจากบัญชี staging

ต้องตรวจ `x-line-signature` จาก raw body ก่อน parse JSON และตอบ 200 ให้เร็ว งานหนักส่งไป worker/outbox ดาวน์โหลดเสียงด้วย:

```text
GET https://api-data.line.me/v2/bot/message/{messageId}/content
Authorization: Bearer {LINE_CHANNEL_ACCESS_TOKEN}
```

### ต้องผ่าน

- Verify ผ่าน; request ไม่มี event ตอบ 200
- signature ผิดได้ 401 และไม่สร้างงาน
- audio webhook ที่ถูกต้องได้ 200
- redelivery ไม่สร้างกิจกรรมซ้ำ
- user ที่ไม่ผูก Farmer ID ได้คำแนะนำ
- download ล้มเหลวเข้า retry ไม่ทิ้งข้อมูลครึ่งรายการ

## Gate C — OpenAI Voice Pipeline

### ใช้ Gemini แทน OpenAI ได้หรือไม่

ได้ โดยเปลี่ยน Gate C ให้เรียกผ่าน `AIProvider` abstraction แทนการผูก service กับผู้ให้บริการรายเดียว แต่ `GEMINI_API_KEY` ไม่สามารถนำไปใส่ใน `OPENAI_API_KEY` ได้ตรง ๆ เพราะ SDK, endpoint, request และ response คนละรูปแบบ

ค่าที่เสนอสำหรับ Gemini:

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=เก็บใน-secret-store
GEMINI_TRANSCRIPTION_MODEL=gemini-3.5-transcribe
GEMINI_EXTRACTION_MODEL=gemini-3.8-flash
```

Flow ยังคงแยกสองขั้น:

1. Transcription adapter ส่ง audio ไปโมเดลถอดเสียงและได้ transcript ต้นฉบับ
2. Extraction adapter ส่ง transcript ไปโมเดลที่รองรับ Structured Output พร้อม JSON Schema
3. ระบบ validate ด้วย Zod และรัน deterministic ICS rules เองเสมอ

ข้อแนะนำสำหรับระบบนี้คือใช้ `verbatim` transcription เพื่อเก็บหลักฐานต้นฉบับ ไม่ใช้ smart cleanup เป็นหลักฐานเพียงชุดเดียว เพราะ smart mode อาจตัดคำฟุ่มเฟือยหรือรวมการแก้คำพูด ควรเก็บ provider/model/version, transcript, checksum ของไฟล์ และเวลาประมวลผลไว้ใน audit metadata

งานโค้ดที่ต้องเพิ่มก่อนใช้จริง:

- interface `TranscriptionProvider` และ `ExtractionProvider`
- `GeminiTranscriptionProvider` และ `GeminiExtractionProvider`
- config validation ตาม `AI_PROVIDER`
- timeout/retry/rate limit และ redacted logging
- contract tests ชุดเดียวกันสำหรับทุก provider
- benchmark เสียงภาษาไทย/สำเนียงศรีสะเกษและศัพท์สารเกษตร ก่อนเลือก production provider

สถานะปัจจุบัน: **ยังไม่ได้ implement Gemini adapter** จึงยังใช้ key ทดสอบไม่ได้จนกว่างานข้างต้นเสร็จ

1. สร้าง staging project/API key และ budget alert
2. เก็บ key ฝั่ง server เท่านั้น
3. validate MIME/ขนาด/duration แล้วส่งไฟล์ไป `POST /v1/audio/transcriptions` พร้อมภาษา `th`
4. ส่ง transcript เข้า extraction model โดยบังคับ JSON schema
5. validate ด้วย Zod ก่อนสร้าง domain object
6. รัน deterministic ICS rules ภายหลัง; AI ห้ามอนุมัติมาตรฐานเอง

Schema ขั้นต่ำ:

```json
{
  "activityType": "string or null",
  "crop": "string or null",
  "plotReference": "string or null",
  "inputsUsed": "string or null",
  "quantity": "number or null",
  "unit": "string or null",
  "occurredAt": "ISO-8601 string or null",
  "needsClarification": true,
  "missingFields": ["quantity"]
}
```

### ต้องผ่าน

- เสียงไทยชัดเจนได้ transcript และ structured activity
- เสียงเงียบ/ไฟล์เสียมี error ที่อธิบายได้
- output ผิด schema ไม่เป็นรายการสมบูรณ์
- ข้อมูลไม่ครบเข้า `NEEDS_REVIEW`/`NEEDS_CONFIRMATION`
- ความเสี่ยงตัดสินด้วย rule engine พร้อมเหตุผล
- log ไม่มี API key หรือ binary เสียง

## Gate D — End-to-end staging

1. ทดสอบเสียงอย่างน้อย 10 กรณี: ปกติ, ข้อมูลไม่ครบ, คำเสี่ยง, เสียงรบกวน, event ซ้ำ
2. ตรวจ LINE acknowledgement และการยืนยัน/แก้ไข
3. ตรวจ Sheets ด้วย `sourceEventId`, `activityId`, `reviewId`
4. login Dashboard และทำ Approve, Flag, Request info
5. restart service และตรวจ persistence
6. จำลอง OpenAI/Sheets timeout และตรวจ retry/outbox
7. export backup และ restore ลง spreadsheet ใหม่

ผ่านเมื่อไม่มีข้อมูลซ้ำ/สูญหาย ทุก decision มี audit, secret ไม่รั่ว และเจ้าหน้าที่กู้ failed job ได้

## ลำดับพัฒนาที่แนะนำ

1. Sheets adapter + persistence test
2. durable idempotency/outbox
3. LINE audio download/reply
4. OpenAI transcription
5. structured extraction/validation
6. farmer confirmation/correction
7. staging end-to-end และ incident drill
8. production หลังยืนยันกฎ ICS, retention และผู้อนุมัติ

## ข้อมูลที่เจ้าของระบบต้องเตรียม

- Google spreadsheet/service account และผู้มีสิทธิ์
- LINE OA channel และผู้ดูแล token
- OpenAI project, budget และผู้รับผิดชอบค่าใช้จ่าย
- รายการสาร/กฎ ICS ที่อนุมัติแล้ว
- นโยบายเก็บเสียง/transcript/audit
- รายชื่อ Reviewer/Admin และสิทธิ์
- staging/production domain

## เอกสารทางการ

- Google Sheets Node.js: https://developers.google.com/workspace/sheets/api/quickstart/nodejs
- Google Sheets append: https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/append
- LINE signature: https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/
- LINE content: https://developers.line.biz/en/docs/messaging-api/receiving-messages/
- OpenAI transcription: https://platform.openai.com/docs/api-reference/audio/createTranscription
- Gemini transcription: https://ai.google.dev/gemini-api/docs/transcribe
- Gemini structured outputs: https://ai.google.dev/gemini-api/docs/structured-output
- Gemini API keys: https://ai.google.dev/gemini-api/docs/api-key
