# PAYI Ops — Retail Control Room

ระบบจัดการธุรกิจ e-commerce (Shopee / TikTok Shop / Lazada) — React + Vite + Recharts บนหน้าเว็บ, Vercel Serverless Functions + Google Sheets เป็น backend ใช้ **free tier ทั้งหมด**

## โครงสร้าง

```
mona-ops/
├── src/
│   ├── App.jsx              # โครงแอปหลัก (sidebar + tab, ไม่ใช้ router)
│   ├── theme.css            # ธีม PAYI (CSS variables)
│   ├── components/KpiCard.jsx
│   └── pages/
│       ├── Upload.jsx       # 🔥 นำเข้าออเดอร์ Shopee/TikTok/Lazada → Google Sheets
│       ├── ClaimView.jsx    # วิเคราะห์เคลมสินค้า + นำเข้าไฟล์เคลม
│       ├── SalesView.jsx    # บันทึกยอดขายนอกแพลตฟอร์ม (local-first)
│       ├── PackingView.jsx  # กระดานงานแพ็ก (local-first)
│       ├── LinksHub.jsx     # รวมลิงก์ทรัพยากร
│       └── DevHub.jsx       # คู่มือ developer
├── api/                     # Vercel Serverless Functions (บน Google Sheets)
│   ├── dashboard.js         # หน้า Executive: totals, trends, top SKUs, alerts
│   ├── claims.js            # เคลม: ?view=summary|monthly|sku|imports-list|import
│   ├── claims-import.js     # นำเข้าไฟล์เคลม (รับ rows ที่ parse จาก client)
│   ├── import-orders.js     # นำเข้าออเดอร์ + จับคู่ SKU + กันซ้ำ + แยก tab รายเดือน
│   ├── summary.js / sheet.js / append.js / overwrite.js
│   └── _lib/sheets.js       # Google Sheets helpers
├── recovered/               # ไฟล์ต้นฉบับที่กู้มาจาก claude.ai (สำรองไว้)
└── vercel.json
```

## รันในเครื่อง

```bash
npm install
npm run dev        # http://localhost:5173 — เสิร์ฟทั้งหน้าเว็บและ /api/*
```

> ต้องมีไฟล์ `.env` ที่ root (มีอยู่แล้ว) — `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `SHEET_ID`
> `vite.config.js` มี middleware จำลอง Vercel functions ให้ `/api/*` ทำงานตอน dev

## Deploy แบบฟรีทั้งหมด

### 1. Push ขึ้น GitHub (git commit ไว้แล้ว)

```bash
# สร้าง repo ว่างชื่อ mona-ops บน github.com ก่อน แล้ว:
git remote add origin https://github.com/monalll13/mona-ops.git
git branch -M main
git push -u origin main
```

⚠️ `.gitignore` กัน `.env` ไว้แล้ว — private key ไม่หลุดขึ้น GitHub

### 2. Deploy บน Vercel

1. สมัคร [vercel.com](https://vercel.com) ด้วยบัญชี GitHub (ฟรี ไม่ต้องใส่บัตร)
2. **Add New → Project** → เลือก repo `mona-ops` (Vercel ตรวจเจอ Vite อัตโนมัติ)
3. ตั้ง **Environment Variables** 3 ตัว (ค่าเดียวกับใน `.env`):

   | ชื่อ | ค่า |
   |---|---|
   | `GOOGLE_SERVICE_ACCOUNT_EMAIL` | อีเมล service account |
   | `GOOGLE_PRIVATE_KEY` | private key ทั้งก้อน (รวม `\n`) |
   | `SHEET_ID` | `13eMPa3ISNd8HwrlsK-CtQsmzRvzqxpimy67cJVRBZGg` |

4. กด **Deploy** → ได้ URL `.vercel.app` — push ครั้งต่อไป deploy อัตโนมัติ

## ข้อมูลจริง

ออเดอร์ ~190,000 แถวใน `raw_orders_2026_MM` (ม.ค.–พ.ค.), 3 ธุรกิจ (Payi / Payi Outlet / กรอบรูป), ยอดรวม ~฿34.5M
`/api/dashboard` และ `/api/claims` aggregate ฝั่ง server แล้ว cache ที่ CDN — เลี่ยงชน rate limit ของ Sheets

## ขั้นต่อไป (ยังไม่ได้ทำ)

- Push GitHub + Deploy Vercel (ต้องใช้บัญชีของคุณ)
- เพิ่ม auth ให้ API (ตอนนี้ endpoint เปิด public)
- ปิดการแชร์ Google Sheet แบบ "anyone with link"
- อัปเกรด SalesView / PackingView จาก localStorage → เก็บใน Google Sheets (ให้แชร์ข้ามเครื่อง)
