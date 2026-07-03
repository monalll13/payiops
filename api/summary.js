// GET /api/summary → สรุปยอดขายจาก raw_orders_* ทุก tab ให้เป็นก้อนเล็กพอส่งให้หน้าเว็บ
// (ออเดอร์ดิบมีเป็นแสนแถว ส่งตรงไม่ได้ ต้อง aggregate ฝั่ง server)
//
// ตอบกลับ:
// {
//   maxDate: "2026-05-31",
//   daily: [{ date, business, platform, revenue, qty, orders }],   // ยอดรวมรายวัน
//   skus:  [{ sku, name, business, platform, revenue, qty, orders }], // ยอดรวมราย SKU
//   imports: [{ file, business, platform, rows, at }]              // การ import ล่าสุด
// }
import { getMeta, batchGetValues, getSheet } from './_lib/sheets.js'

const isCancelled = (status = '') =>
  status.includes('ยกเลิก') || status.toLowerCase().includes('cancel')

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  try {
    const meta = await getMeta()
    const tabs = meta.sheets
      .map(s => s.properties.title)
      .filter(t => t.startsWith('raw_orders'))

    // ต่อ tab อ่าน 2 ช่วง: B:F (order_id, -, date, platform, business) และ J:N (sku, name, qty, revenue, status)
    // เลี่ยงคอลัมน์ G-I (ชื่อสินค้ายาว ๆ) เพื่อลด payload จาก Sheets API
    const ranges = tabs.flatMap(t => [`${t}!B:F`, `${t}!J:N`])
    const valueRanges = await batchGetValues(ranges)

    const daily = new Map() // date|business|platform → { revenue, qty, orderIds }
    const skus = new Map()  // sku|business|platform → { name, revenue, qty, orders }

    for (let i = 0; i < tabs.length; i++) {
      const left = valueRanges[2 * i].values || []
      const right = valueRanges[2 * i + 1].values || []
      const n = Math.max(left.length, right.length)
      for (let j = 1; j < n; j++) {
        const [orderId, , date, platform, business] = left[j] || []
        const [sku, name, qtyS, revS, status] = right[j] || []
        if (!date || isCancelled(status)) continue
        const qty = parseInt(qtyS, 10) || 0
        const revenue = parseFloat(String(revS ?? '').replace(/,/g, '')) || 0

        const dKey = `${date}|${business}|${platform}`
        let d = daily.get(dKey)
        if (!d) daily.set(dKey, d = { revenue: 0, qty: 0, orderIds: new Set() })
        d.revenue += revenue
        d.qty += qty
        if (orderId) d.orderIds.add(orderId)

        const sKey = `${sku || '?'}|${business}|${platform}`
        let s = skus.get(sKey)
        if (!s) skus.set(sKey, s = { name: name || sku || '(ไม่ระบุ)', revenue: 0, qty: 0, orders: 0 })
        s.revenue += revenue
        s.qty += qty
        s.orders += 1
      }
    }

    const dailyRows = [...daily.entries()].map(([key, v]) => {
      const [date, business, platform] = key.split('|')
      return {
        date, business, platform,
        revenue: Math.round(v.revenue * 100) / 100,
        qty: v.qty,
        orders: v.orderIds.size,
      }
    }).sort((a, b) => a.date.localeCompare(b.date))

    const skuRows = [...skus.entries()].map(([key, v]) => {
      const [sku, business, platform] = key.split('|')
      return {
        sku, business, platform,
        name: v.name,
        revenue: Math.round(v.revenue * 100) / 100,
        qty: v.qty,
        orders: v.orders,
      }
    })

    // การ import ล่าสุด (เฉพาะที่ยัง active)
    let imports = []
    try {
      const log = await getSheet('import_log')
      imports = log
        .filter(r => r.status === 'active')
        .slice(-6)
        .reverse()
        .map(r => ({
          file: r.filename,
          business: r.business,
          platform: r.platform,
          rows: Number(r.rows_imported) || 0,
          at: r.uploaded_at,
        }))
    } catch { /* ไม่มี tab import_log ก็ข้าม */ }

    // cache ที่ Vercel CDN 5 นาที — ลดจำนวนครั้งที่ต้องอ่าน Sheets
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600')
    res.status(200).json({
      maxDate: dailyRows.length ? dailyRows[dailyRows.length - 1].date : null,
      daily: dailyRows,
      skus: skuRows,
      imports,
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
