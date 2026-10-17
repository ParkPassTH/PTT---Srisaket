# Deployment Guide

> อัปเดต: 17 ตุลาคม 2569

## 1. ระดับการติดตั้ง

### Free pilot

ใช้ Render Free Web Service และแหล่งข้อมูลภายนอก เช่น Google Sheets เหมาะสำหรับสาธิต ทดลองกับผู้ใช้กลุ่มเล็ก และทดสอบ flow

ข้อจำกัดสำคัญ:

- service อาจพักเมื่อไม่มี request และการปลุกกลับอาจใช้เวลาประมาณหนึ่งนาที
- local filesystem ไม่ถาวร ห้ามใช้ SQLite หรือไฟล์ JSON เป็นฐานข้อมูล production
- free service อาจ restart ได้
- ไม่มี SLA สำหรับงานสำคัญ

### Production

ใช้ paid web service หรือผู้ให้บริการที่มี uptime/SLA, persistent database, backup, monitoring และ incident response ที่เหมาะสม ตัว application code เดียวกันใช้ได้ แต่ต้องเปลี่ยน `DATA_DRIVER` และ credentials

## 2. เตรียม repository

1. สร้าง Git repository แบบ private
2. commit โค้ดโดยตรวจว่าไม่มี `.env` หรือ credential
3. รัน:

```bash
npm ci
npm run check
npm audit --omit=dev
```

4. push ไป Git provider ที่ Render เข้าถึงได้

## 3. Deploy ด้วย Render Blueprint

โปรเจกต์มี `render.yaml` แล้ว:

1. สมัคร Render และเชื่อม Git provider
2. เลือก **New > Blueprint**
3. เลือก repository นี้
4. ตรวจ service name และเลือก Free สำหรับ pilot
5. กรอก environment variables ที่ขึ้น `sync: false`
6. Deploy และรอ `npm run check` ผ่าน
7. เปิด `/health` ต้องได้ `{ "status": "ok" }`

## 4. Environment variables

| Key | จำเป็น | ความหมาย |
|---|---|---|
| `NODE_ENV` | ใช่ | `production` บน hosting |
| `APP_BASE_URL` | ใช่ | URL จริง เช่น `https://example.onrender.com` |
| `DATA_DRIVER` | ใช่ | ใช้ `google-sheets` สำหรับ production/pilot; `memory` สำหรับ demo เท่านั้น |
| `SESSION_SECRET` | ใช่ | random อย่างน้อย 32 ตัวอักษร |
| `ADMIN_EMAIL` | ใช่ | อีเมล admin เริ่มต้น |
| `ADMIN_PASSWORD` | ใช่ | รหัสยาวและไม่ซ้ำบริการอื่น |
| `LINE_CHANNEL_SECRET` | เมื่อเปิด LINE | secret จาก LINE Developers Console |
| `LINE_CHANNEL_ACCESS_TOKEN` | เมื่อเปิด LINE | access token จาก Messaging API channel |
| `OPENAI_API_KEY` | เมื่อเปิด Voice AI | API key ฝั่ง server เท่านั้น |
| `GOOGLE_SHEET_ID` | เมื่อเปิด Sheets | ID ของ spreadsheet |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | เมื่อเปิด Sheets | service account email |
| `GOOGLE_PRIVATE_KEY` | เมื่อเปิด Sheets | private key; เก็บ newline ตามรูปแบบ provider |
| `ALLOWED_ORIGINS` | ใช่ | origin ที่อนุญาต คั่นด้วย comma |

## 5. ตั้งค่า LINE Webhook

1. สร้าง LINE Official Account และ Messaging API channel
2. ตั้ง Webhook URL เป็น:

```text
https://YOUR_DOMAIN/webhooks/line
```

3. ใส่ `LINE_CHANNEL_SECRET` และ `LINE_CHANNEL_ACCESS_TOKEN` ใน Render
4. กด Verify ใน LINE Developers Console
5. ปิด auto-reply ที่ชนกับ bot flow
6. ทดสอบ event ซ้ำและ signature ผิดก่อนเปิดผู้ใช้จริง

## 6. ตั้งค่า Google Sheets

1. สร้าง Google Cloud project และเปิด Google Sheets API
2. สร้าง service account สำหรับระบบนี้โดยเฉพาะ
3. แชร์ spreadsheet ให้ service account เท่าที่จำเป็น
4. Share spreadsheet ให้ service account เป็น Editor; ระบบจะสร้าง `Farmers`, `Activities`, `Reviews`, `Lots`, `AuditEvents` และ headers ให้อัตโนมัติ
5. ใส่ credentials ใน environment variables ไม่อัปโหลดไฟล์ key เข้า repository
6. ตั้ง `DATA_DRIVER=google-sheets` และตรวจการสร้างแท็บหลัง deploy

## 7. ตั้งค่า OpenAI

1. สร้าง API key สำหรับ project นี้
2. ตั้ง usage budget และ alert ใน OpenAI project
3. ใส่ key เป็น `OPENAI_API_KEY` ที่ server เท่านั้น
4. ใช้ `/v1/audio/transcriptions` สำหรับไฟล์เสียงที่รองรับ และ Structured Outputs สำหรับ extraction
5. ทดสอบไฟล์เสียงไทยจริงหลายสภาพแวดล้อมก่อน production

## 8. Go-live checklist

- [ ] `npm run check` ผ่าน
- [ ] production dependency audit เป็น 0 vulnerability ที่ทราบ
- [ ] secrets ไม่อยู่ใน Git/log/browser
- [ ] approved ICS rule list ถูกลงนามโดยผู้รับผิดชอบ
- [ ] privacy notice และ retention policy ถูกยืนยัน
- [ ] backup และ restore drill ผ่าน
- [ ] LINE webhook signature และ duplicate test ผ่าน
- [ ] invalid/ambiguous audio เข้า human review
- [ ] public trace ไม่เปิดเผย PII
- [ ] monitoring และผู้รับแจ้งเหตุพร้อม
- [ ] rollback ถูกทดสอบ

## 9. Rollback

1. หยุด auto-deploy ชั่วคราว
2. เลือก deployment ก่อนหน้าที่ผ่าน verification
3. rollback application โดยไม่ rollback ข้อมูลโดยอัตโนมัติ
4. ตรวจ `/health`, login, dashboard, webhook และ trace
5. บันทึกเหตุการณ์ใน `WORKLOG.md` และ incident log
# Vercel preview สำหรับตั้ง LINE webhook

Repository มี `api/index.ts` และ `vercel.json` สำหรับ deploy Express เป็น Vercel Function แล้ว ตั้ง Environment Variables อย่างน้อย `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, `DATA_DRIVER=memory` และ `APP_BASE_URL` ให้ตรงกับโดเมน Vercel

Webhook URL คือ:

```text
https://YOUR-VERCEL-DOMAIN/webhooks/line
```

Vercel Function รองรับ Gate A–C แล้ว ตั้ง `maxDuration=60`; ต้องใช้ `DATA_DRIVER=google-sheets` เพื่อให้ข้อมูลคงอยู่ข้ามการสร้าง function ใหม่
