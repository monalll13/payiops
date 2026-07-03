# Mona Ops — Workflow Hub

ระบบจัดการธุรกิจ e-commerce (Shopee / TikTok Shop / Lazada) — React + Vite + Tailwind บนหน้าเว็บ, Vercel Serverless Functions + Google Sheets เป็น backend

## โครงสร้าง

```
mona-ops/
├── src/                  # Frontend (React + Vite)
│   ├── pages/Dashboard.jsx   # Executive Dashboard (ตอนนี้เป็น demo data)
│   └── pages/Reports.jsx     # รายงานยอดขาย (ตอนนี้เป็น demo data)
├── api/                  # Backend — Vercel Serverless Functions
│   ├── summary.js        # GET  /api/summary → สรุปยอดขายทุก raw_orders_* (Dashboard/Reports ใช้ตัวนี้)
│   ├── sheet.js          # GET  /api/sheet?name=raw_orders_2026_01 → อ่านข้อมูลดิบ
│   ├── append.js         # POST /api/append → เขียนต่อท้าย
│   ├── overwrite.js      # POST /api/overwrite → เขียนทับทั้ง sheet
│   └── _lib/sheets.js    # Google Sheets helpers
├── backend/              # โค้ดเก่า (ย้ายไป api/ แล้ว — ลบได้)
└── vercel.json           # SPA rewrite สำหรับ react-router
```

## รันในเครื่อง

```bash
npm install
npm run dev        # เปิด http://localhost:5173
```

> `npm run dev` เสิร์ฟทั้งหน้าเว็บและ `/api/*` (มี middleware ใน vite.config.js จำลอง Vercel functions)
> โดยอ่าน credentials จากไฟล์ `.env` ที่ root — ถ้าแก้ไฟล์ใน `api/` ต้อง restart dev server

## Deploy แบบฟรีทั้งหมด (Vercel)

ทุกอย่างใช้ free tier: **GitHub** (เก็บโค้ด) + **Vercel Hobby** (โฮสต์เว็บ + API) + **Google Sheets** (ฐานข้อมูล) — ค่าใช้จ่าย 0 บาท

### 1. เตรียม Google Service Account (ครั้งเดียว)

1. เข้า [Google Cloud Console](https://console.cloud.google.com) → สร้าง project → เปิดใช้ **Google Sheets API**
2. IAM & Admin → Service Accounts → สร้าง service account → สร้าง key แบบ **JSON** แล้วดาวน์โหลด
3. เปิด Google Sheet ของเรา → กด Share → แชร์ให้อีเมลของ service account (สิทธิ์ Editor)

### 2. Push โค้ดขึ้น GitHub

```bash
git init
git add .
git commit -m "Initial commit"
# สร้าง repo ว่างบน github.com แล้ว:
git remote add origin https://github.com/<username>/mona-ops.git
git push -u origin main
```

⚠️ `.gitignore` กันไฟล์ `.env` ไว้แล้ว — **ห้ามเอา private key ใส่ในโค้ดหรือ commit เด็ดขาด**

### 3. Deploy บน Vercel

1. สมัคร [vercel.com](https://vercel.com) ด้วยบัญชี GitHub (ฟรี ไม่ต้องใส่บัตร)
2. **Add New → Project** → เลือก repo `mona-ops` → Vercel ตรวจเจอ Vite ให้อัตโนมัติ
3. ก่อนกด Deploy ตั้ง **Environment Variables** 3 ตัว (จากไฟล์ JSON ของ service account):

   | ชื่อ | ค่า |
   |---|---|
   | `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `client_email` ในไฟล์ JSON |
   | `GOOGLE_PRIVATE_KEY` | `private_key` ในไฟล์ JSON (copy ทั้งก้อนรวม `\n`) |
   | `SHEET_ID` | จาก URL ของ sheet: `docs.google.com/spreadsheets/d/`**`[ตรงนี้]`**`/edit` |

4. กด **Deploy** → ได้ URL `https://mona-ops.vercel.app`

หลังจากนี้ทุกครั้งที่ `git push` Vercel จะ deploy ให้อัตโนมัติ

### 4. ทดสอบว่า API ต่อ Google Sheets ติด

```
https://<your-app>.vercel.app/api/sheet?name=<ชื่อ sheet เช่น raw_orders>
```

ถ้าได้ JSON กลับมา = สำเร็จ

## การไหลของข้อมูล

ออเดอร์ดิบมี ~190,000 แถว ส่งให้หน้าเว็บตรง ๆ ไม่ได้ — `/api/summary` จะอ่านทุก tab `raw_orders_*`
แล้ว aggregate ฝั่ง server เหลือ ~150 KB (ยอดรายวัน + ราย SKU + import log) พร้อม cache ที่ CDN 5 นาที
ตัดออเดอร์ที่สถานะ "ยกเลิก" ออกจากยอดแล้ว

## ขั้นต่อไป (ยังไม่ได้ทำ)

- เพิ่ม auth ให้ API (ตอนนี้ endpoint เปิด public — ใครรู้ URL ก็อ่าน/เขียน sheet ได้)
- ปิดการแชร์ Google Sheet แบบ "anyone with link" (ตอนนี้ใครมีลิงก์ก็เปิดดูได้) — service account มีสิทธิ์อยู่แล้ว ไม่ต้องแชร์ public

## ข้อจำกัด free tier ที่ควรรู้

- **Vercel Hobby**: ใช้ส่วนตัว/งานทีมเล็กได้สบาย (bandwidth 100GB/เดือน, serverless เรียกได้เหลือเฟือ)
- **Google Sheets**: อ่าน/เขียนผ่าน API ได้ 300 requests/นาที/project — พอสำหรับทีมเล็ก ถ้าโตค่อยย้ายไป database จริง
