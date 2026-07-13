# NANCHAYA Roster Bot

บอต LINE ส่วนตัวสำหรับอ่านภาพตารางเวรด้วย Google Gemini โดยเลือกเฉพาะแถว `NANCHAYA` แสดงตัวอย่างให้ตรวจสอบ แล้วสร้างไฟล์ `.ics` สำหรับนำเข้า Apple Calendar บน iPhone

ระบบออกแบบสำหรับ Next.js App Router และ Vercel Functions: ไม่เก็บไฟล์ภาพลงดิสก์, เก็บงานชั่วคราวใน Upstash Redis 30 นาที, จำกัดผู้ใช้ด้วย LINE user ID, จำกัดการวิเคราะห์ 5 ภาพต่อผู้ใช้ต่อชั่วโมง และใช้ลิงก์ดาวน์โหลดที่ลงลายเซ็น HMAC อายุ 15 นาที

## สถาปัตยกรรม

1. LINE ส่ง webhook มาที่ `POST /api/line/webhook`
2. เซิร์ฟเวอร์ตรวจ `x-line-signature` กับ raw request body ก่อน parse JSON
3. ตรวจ allowlist, idempotency และ rate limit ใน Redis
4. ดาวน์โหลด JPEG/PNG จาก LINE (ไม่เกิน 10 MB) และตรวจ magic bytes
5. ส่ง bytes ให้ Gemini ผ่าน `@google/genai` พร้อม JSON Schema
6. normalize และ validate ข้อมูลครบทุกวันของเดือน รวม confidence และ warnings
7. เก็บงานชั่วคราวใน Redis และตอบ LINE ด้วย preview ภาษาไทย
8. เมื่อกดยืนยัน ระบบออก signed URL และสร้าง ICS แบบ dynamic ที่ `GET /api/calendar/[jobId]`

กิจกรรมจาก REMARK เช่น Training จะเป็น VEVENT แยกจากกะทำงานและสามารถซ้อนเวลาได้ กะทำงานจะไม่ถูกลด ตัด หรือรวมกับกิจกรรม

## A. สิ่งที่ต้องมี

- Node.js 20.9 ขึ้นไป (แนะนำ Node.js 22 LTS)
- npm
- บัญชี GitHub
- บัญชี Vercel
- บัญชี LINE Developers และ LINE Official Account
- Google AI Studio API key
- Upstash Redis account หรือ Upstash จาก Vercel Marketplace

## B. ตั้งค่า LINE

1. เข้า [LINE Official Account Manager](https://manager.line.biz/) แล้วสร้างหรือเลือก Official Account
2. เข้า [LINE Developers Console](https://developers.line.biz/console/) สร้าง Provider แล้วสร้าง Messaging API channel หรือเชื่อม Official Account เดิม
3. หน้า **Basic settings** คัดลอก **Channel secret** ไปใส่ `LINE_CHANNEL_SECRET`
4. หน้า **Messaging API** กดออก Channel access token แบบ long-lived แล้วใส่ `LINE_CHANNEL_ACCESS_TOKEN`
5. ใน Official Account Manager ปิด Greeting message และ Auto-response messages หากไม่ต้องการข้อความซ้ำจากระบบเริ่มต้น
6. หลัง deploy ให้ตั้ง Webhook URL เป็น:

   ```text
   https://YOUR_DOMAIN/api/line/webhook
   ```

7. เปิด **Use webhook** แล้วกด **Verify** ควรสำเร็จด้วย HTTP 200
8. หา LINE user ID ที่อนุญาต (`U` ตามด้วยตัวอักษร/ตัวเลข) จาก **Your user ID** ในหน้า Basic settings ของบัญชีนักพัฒนาที่ผูกกับ LINE หรือดู `source.userId` จาก webhook ด้วยเครื่องมือทดสอบชั่วคราวที่ปลอดภัย
9. ใส่ user ID ใน `ALLOWED_LINE_USER_IDS` ถ้ามีหลายคนให้คั่นด้วย comma เช่น `Uaaa...,Ubbb...`

อย่าใส่ Channel secret, access token หรือ allowlist ในตัวแปรที่ขึ้นต้นด้วย `NEXT_PUBLIC_`

## C. ตั้งค่า Gemini

1. เข้า [Google AI Studio](https://aistudio.google.com/)
2. สร้าง API key แล้วใส่ `GEMINI_API_KEY`
3. ค่าเริ่มต้นของ `GEMINI_MODEL` คือ `gemini-2.5-flash-lite` และเปลี่ยนได้โดยไม่แก้โค้ด

Gemini free tier มีข้อจำกัดจำนวน request/token ซึ่ง Google สามารถเปลี่ยนได้ การจัดการข้อมูลและเงื่อนไขของ free tier อาจต่างจากบริการแบบชำระเงิน จึงควรตรวจเงื่อนไขล่าสุดก่อนใช้กับข้อมูลจริง ระบบนี้ไม่ได้รับประกันว่าจะฟรีหรือใช้งานได้ไม่จำกัดตลอดไป

## D. ตั้งค่า Upstash Redis

วิธีที่ 1: สร้างฐานข้อมูลฟรีที่ [Upstash Console](https://console.upstash.com/redis) แล้วคัดลอก REST URL และ REST token

วิธีที่ 2: ใน Vercel ไปที่ **Storage / Marketplace** เลือก Upstash Redis แล้วเชื่อมกับโปรเจกต์

กำหนด:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

บอตใช้ Redis สำหรับงานชั่วคราว, webhook idempotency และ rate limit เท่านั้น ไม่ต้องใช้ local filesystem หรือฐานข้อมูลแบบเสียเงิน

## E. สร้าง secret สำหรับลิงก์ดาวน์โหลด

สร้างค่าสุ่มอย่างน้อย 32 ตัวอักษร:

```bash
openssl rand -base64 48
```

นำผลลัพธ์ใส่ `DOWNLOAD_TOKEN_SECRET` และเก็บเป็นความลับ หากเปลี่ยนค่า ลิงก์ที่สร้างไว้ก่อนหน้าจะใช้ไม่ได้ทันที

## ตัวแปรสภาพแวดล้อมทั้งหมด

| ตัวแปร                      | จำเป็น | รายละเอียด                                                   |
| --------------------------- | ------ | ------------------------------------------------------------ |
| `LINE_CHANNEL_SECRET`       | ใช่    | Channel secret จาก LINE Developers                           |
| `LINE_CHANNEL_ACCESS_TOKEN` | ใช่    | Long-lived Messaging API token                               |
| `GEMINI_API_KEY`            | ใช่    | API key จาก Google AI Studio                                 |
| `GEMINI_MODEL`              | ไม่    | ค่าเริ่มต้น `gemini-2.5-flash-lite`                          |
| `UPSTASH_REDIS_REST_URL`    | ใช่    | Upstash REST URL                                             |
| `UPSTASH_REDIS_REST_TOKEN`  | ใช่    | Upstash REST token                                           |
| `DOWNLOAD_TOKEN_SECRET`     | ใช่    | ค่าสุ่มอย่างน้อย 32 ตัวอักษร                                 |
| `ALLOWED_LINE_USER_IDS`     | ใช่    | LINE user ID คั่นด้วย comma                                  |
| `APP_BASE_URL`              | ใช่    | origin ของระบบ ไม่มี `/` ท้าย URL; production ต้องเป็น HTTPS |

ดูรูปแบบได้ใน `.env.example`

## F. ติดตั้งและรันในเครื่อง

```bash
npm install
cp .env.example .env.local
npm run dev
```

แก้ `.env.local` ให้เป็นค่าจริง แล้วเปิด `http://localhost:3000` การทดสอบ LINE webhook จากเครื่องต้องมี HTTPS tunnel ที่เข้าถึงได้จากอินเทอร์เน็ต และต้องตั้ง `APP_BASE_URL` เป็น HTTPS origin ของ tunnel นั้น

## G. ตรวจคุณภาพ

```bash
npm run format
npm run lint
npm run typecheck
npm test
npm run build
```

โหมดเฝ้าดู test ใช้ `npm run test:watch` และตรวจ formatting โดยไม่แก้ไฟล์ใช้ `npm run format:check`

## H. Deploy ไป Vercel Hobby

1. สร้าง Git repository และ push โปรเจกต์นี้ขึ้น GitHub
2. เข้า Vercel แล้วกด **Add New > Project** จาก repository
3. Framework Preset ควรถูกตรวจเป็น Next.js อัตโนมัติ ไม่ต้องตั้ง Output Directory
4. เพิ่ม environment variables ทั้งหมดด้านบนให้ Production (และ Preview หากต้องการทดสอบ preview deployment)
5. รอบแรกกำหนด `APP_BASE_URL` เป็น URL ที่คาดว่าจะได้ เช่น `https://your-project.vercel.app`
6. Deploy แล้วคัดลอก production domain จริง
7. แก้ `APP_BASE_URL` ใน Vercel ให้ตรง production origin โดยไม่มี `/` ท้าย URL แล้ว **Redeploy**
8. ทดสอบ `https://YOUR_DOMAIN/api/health` ต้องได้ `{"ok":true}`
9. ตั้ง LINE Webhook URL เป็น `https://YOUR_DOMAIN/api/line/webhook`, เปิด Use webhook และกด Verify
10. เพิ่มบอตเป็นเพื่อนและทดสอบด้วยภาพที่ไม่มีข้อมูลสำคัญก่อน

API routes ใช้ Node.js runtime และ webhook ตั้ง maximum duration 60 วินาที ควรตรวจขีดจำกัดล่าสุดของ Vercel Hobby หาก Gemini ใช้เวลานานกว่าขีดจำกัด ให้ส่งภาพที่ crop เหลือเฉพาะส่วนตารางที่จำเป็นและลดความละเอียดโดยยังอ่านได้ชัด

## I. วิธีใช้งาน

1. เพิ่มบอตเป็นเพื่อนใน LINE
2. ส่งภาพหรือ screenshot ตารางเวรเต็มเดือนที่คมชัดและเห็น title, date headers, แถว NANCHAYA, DETAILS และ REMARK
3. ตรวจ preview ทุกวัน รวมวัน OFF และกิจกรรมพิเศษ
4. ถ้าถูกต้อง กด **ยืนยันสร้าง Calendar**
5. กด **เพิ่มเข้า Apple Calendar** หรือเปิด plain URL สำรอง
6. บน iPhone เลือกเพิ่มกิจกรรมทั้งหมดลง Calendar ที่ต้องการ

คำสั่งช่วยเหลือ: `help`, `ช่วยเหลือ`, `วิธีใช้`

## J. แก้ปัญหา

### LINE Webhook Verify ไม่ผ่าน

- ตรวจ URL ว่าลงท้าย `/api/line/webhook` และเป็น HTTPS
- เปิด deployment logs ดูว่าเป็น 401 หรือ 500
- 401 มักเกิดจาก `LINE_CHANNEL_SECRET` ไม่ตรง channel
- 500 มักเกิดจาก environment variable ขาดหรือรูปแบบไม่ผ่าน validation
- หลังแก้ environment variable ต้อง redeploy

### Invalid signature / HTTP 401

ตรวจ Channel secret และอย่าให้ proxy แก้ raw request body เส้นทางนี้อ่าน `request.text()` และ verify ก่อน parse JSON อยู่แล้ว

### LINE content API ตอบ 401

ออก Channel access token ใหม่ ตรวจว่า token มาจาก channel เดียวกับ webhook และอัปเดต `LINE_CHANNEL_ACCESS_TOKEN` ใน Vercel

### Gemini ตอบ 429

โควตาหรือ rate limit ของ Gemini เต็ม รอให้ quota reset หรือตรวจ quota ใน Google AI Studio บอตไม่ retry งานวิเคราะห์อัตโนมัติเพื่อไม่เพิ่มค่าใช้จ่ายหรือสร้างงานซ้ำ

### Gemini คืนข้อมูลไม่ถูก schema

ส่งภาพที่คมชัดขึ้น crop ให้ยังเห็น title, date headers, NANCHAYA, DETAILS และ REMARK ครบ ตรวจว่า model ใน `GEMINI_MODEL` รองรับ image input และ structured JSON output

### ภาพเบลอหรือข้อมูลบางวันหาย

บอตจะสร้างสถานะ `needs_review` และไม่มีปุ่มยืนยัน ให้ส่งภาพใหม่ที่ความละเอียดสูงขึ้น หลีกเลี่ยงแสงสะท้อน และอย่าตัดขอบวันที่หรือ legend

### ขาด Upstash variables

ตรวจ `UPSTASH_REDIS_REST_URL` และ `UPSTASH_REDIS_REST_TOKEN` ใน Vercel แล้ว redeploy หากใช้ Marketplace ให้ตรวจว่า integration เชื่อมกับ environment ที่ deploy จริง

### ลิงก์หมดอายุ

งานอยู่ 30 นาที แต่ download token อยู่ 15 นาที หากหมดอายุให้ส่งภาพและยืนยันใหม่ ข้อมูล roster ไม่ได้อยู่ใน URL

### Apple Calendar ไม่เปิด

ลองเปิด plain URL สำรองใน Safari บน iPhone ตรวจว่า URL ยังไม่หมดอายุและ response ไม่ถูก browser/proxy cache ไฟล์ใช้ `text/calendar`, Bangkok `VTIMEZONE` และชื่อไฟล์ `.ics`

### Vercel Function timeout

ลดขนาดภาพแต่ต้องรักษาความคมชัด crop เฉพาะตารางที่จำเป็น ตรวจสถานะ Gemini และขีดจำกัด Vercel Hobby ปัจจุบัน การออกแบบรุ่นแรกทำ analysis ภายใน webhook เพื่อใช้ reply token ตามข้อกำหนด

### Unauthorized LINE user

เพิ่ม `source.userId` ที่ถูกต้องใน `ALLOWED_LINE_USER_IDS` โดยคั่นหลายค่าด้วย comma แล้ว redeploy บอตจะไม่แสดง allowlist ให้ผู้ใช้

### LINE ส่ง webhook ซ้ำ

ระบบใช้ `webhookEventId` หรือ message ID เป็น Redis idempotency key แบบ `SET NX` จึงไม่วิเคราะห์ภาพหรือสร้าง job ซ้ำภายในช่วง TTL หาก Redis ใช้งานไม่ได้ event จะไม่สามารถประมวลผลได้อย่างปลอดภัย

## ความปลอดภัยและความเป็นส่วนตัว

- ตรวจ HMAC-SHA256 LINE signature ด้วย timing-safe comparison
- ไม่ parse webhook ก่อน verify signature
- ไม่เก็บภาพต้นฉบับลง filesystem หรือ Redis
- ตรวจ JPEG/PNG จากทั้ง Content-Type และ magic bytes และจำกัด 10 MB
- server-only modules ป้องกันการ import เข้า client bundle
- ไม่ส่ง secrets, raw image, raw third-party response หรือ roster JSON ไป browser/URL
- signed token ใช้ HMAC-SHA256 แบบ base64url และผูกกับ job/user binding
- ICS escape ข้อความและป้องกัน newline property injection
- ทุก calendar response ใช้ `private, no-store` และ `nosniff`

แม้มี validation และ confidence threshold ระบบ vision ไม่สามารถรับประกันความถูกต้อง 100% ต้องตรวจ preview กับตารางต้นฉบับทุกครั้งก่อนยืนยัน
