// GET/POST /api/marketing-inputs
// ตัวเลข "กรอกมือ" รายเดือน: ค่า Ads (ต่อร้าน/แพลตฟอร์ม) และ TikTok channel (Affiliate/Live/VDO/อื่นๆ)
// ข้อมูลนี้ไม่มีใน raw_orders — เจ้าของกรอกเอง เก็บในแท็บ marketing_inputs (สร้างอัตโนมัติ)
// Sales/Orders รายเดือนดึงจาก /api/monthly (raw_orders) แล้ว frontend รวมเอง
import { requireAuth } from './auth.js'
import { ensureSheet, getSheet, overwriteSheet } from './sheets.js'

const SHEET = 'marketing_inputs'
const HEADERS = ['month', 'business', 'platform', 'metric', 'value', 'updated_at']
const num = (v) => parseFloat(String(v ?? '').replace(/,/g, '')) || 0

function rowToInput(row) {
  return {
    month: String(row.month || '').slice(0, 7),
    business: String(row.business || '').trim(),
    platform: String(row.platform || '').trim(),
    metric: String(row.metric || '').trim(),
    value: num(row.value),
  }
}

async function getRows() {
  await ensureSheet(SHEET, HEADERS)
  return (await getSheet(SHEET)).map(rowToInput).filter((r) => r.month && r.metric)
}

function bodyFromReq(req) {
  return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
}

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  try {
    if (req.method === 'GET') {
      const inputs = await getRows()
      res.setHeader('Cache-Control', 'no-store')
      return res.status(200).json({
        success: true,
        inputs,
        months: [...new Set(inputs.map((r) => r.month))].sort(),
      })
    }

    // POST: บันทึกทั้งเดือน — ลบแถวเดิมของเดือนนั้นแล้วเขียนชุดใหม่
    if (req.method === 'POST') {
      const body = bodyFromReq(req)
      const month = String(body.month || '').slice(0, 7)
      if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ success: false, error: 'month (YYYY-MM) is required' })
      const incoming = Array.isArray(body.rows) ? body.rows : []
      const now = new Date().toISOString()

      const existing = await getRows()
      const kept = existing.filter((r) => r.month !== month)
      const nextRows = [
        ...kept.map((r) => [r.month, r.business, r.platform, r.metric, r.value, '']),
        ...incoming
          .filter((r) => num(r.value) !== 0) // ไม่เก็บค่า 0 เปล่า ๆ
          .map((r) => [month, String(r.business || '').trim(), String(r.platform || '').trim(), String(r.metric || '').trim(), num(r.value), now]),
      ]

      // เขียนทับทั้งแท็บเสมอ (แม้ nextRows ว่าง = เคลียร์เดือนนั้นออกจริง) — overwriteSheet เขียนหัวคอลัมน์ให้อยู่แล้ว
      await overwriteSheet(SHEET, HEADERS, nextRows)
      return res.status(200).json({ success: true, saved: incoming.length, month })
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
}
