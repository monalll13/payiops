// GET /api/planner-sales
// ABC และยอดเฉลี่ยต่อวันจากจำนวนชิ้นขาย 90 วันล่าสุด (ยึดวันล่าสุดที่มีข้อมูล)
import { requireAuth } from './_lib/auth.js'
import { batchGetValues, getMeta, getSheet } from './_lib/sheets.js'

// ABC ไม่จำเป็นต้องไล่อ่าน raw_orders ทุกครั้งที่เปิดหน้า — 6 ชม. ลดทั้งเวลาและ Sheets quota
const CACHE_MS = 6 * 60 * 60 * 1000
let cache = null
const normalizeName = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, '')
const addDays = (iso, days) => {
  const date = new Date(`${String(iso).slice(0, 10)}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' })
  if (cache && Date.now() - cache.at < CACHE_MS) {
    res.setHeader('Cache-Control', 'private, max-age=300, stale-while-revalidate=21600')
    return res.status(200).json(cache.data)
  }

  try {
    const [meta, aliases] = await Promise.all([getMeta(), getSheet('product_aliases')])
    const mapped = new Map()
    for (const row of aliases) {
      const masterSku = String(row.master_sku || '').trim().toUpperCase()
      if (!/^PY/.test(masterSku)) continue
      const displayName = String(row.display_name || '').trim() || masterSku
      if (!mapped.has(masterSku)) mapped.set(masterSku, { masterSku, displayName })
    }
    const productMapping = [...mapped.values()].sort((a, b) => a.masterSku.localeCompare(b.masterSku, undefined, { numeric: true }))
    const tabs = meta.sheets.map((sheet) => sheet.properties.title).filter((title) => title.startsWith('raw_orders')).sort().slice(-4)
    if (!tabs.length) return res.status(200).json({ success: true, items: [], productMapping, anchor: '', start: '', days: 90, fetchedAt: new Date().toISOString() })

    const ranges = tabs.flatMap((tab) => [`${tab}!D:D`, `${tab}!J:N`])
    const values = await batchGetValues(ranges)
    const raw = []
    let anchor = ''

    for (let index = 0; index < tabs.length; index += 1) {
      const dates = values[index * 2]?.values || []
      const products = values[index * 2 + 1]?.values || []
      const length = Math.max(dates.length, products.length)
      for (let rowIndex = 1; rowIndex < length; rowIndex += 1) {
        const date = String(dates[rowIndex]?.[0] || '').slice(0, 10)
        const row = products[rowIndex] || []
        const masterSku = String(row[0] || '').trim()
        const name = String(row[1] || masterSku).trim()
        const qty = parseInt(row[2], 10) || 0
        // แพลนฟีดอ้างอิงงานที่ออกทั้งหมด จึงนับจำนวนชิ้นรวมสถานะยกเลิก/ตีคืนด้วย
        if (!date || !name || qty <= 0) continue
        if (date > anchor) anchor = date
        raw.push({ date, masterSku, name, qty })
      }
    }

    const start = anchor ? addDays(anchor, -89) : ''
    const aggregated = new Map()
    for (const row of raw) {
      if (!start || row.date < start || row.date > anchor) continue
      const key = row.masterSku.toUpperCase() || normalizeName(row.name)
      let item = aggregated.get(key)
      if (!item) aggregated.set(key, (item = { key, name: row.name, masterSku: row.masterSku, units90: 0, lastDate: '' }))
      item.units90 += row.qty
      if (row.date > item.lastDate) item.lastDate = row.date
    }

    const ranked = [...aggregated.values()].sort((a, b) => b.units90 - a.units90)
    const totalUnits = ranked.reduce((sum, item) => sum + item.units90, 0)
    let cumulative = 0
    const items = ranked.map((item) => {
      const before = totalUnits ? cumulative / totalUnits : 1
      const abc = before < 0.8 ? 'A' : before < 0.95 ? 'B' : 'C'
      cumulative += item.units90
      return { ...item, abc, dailyAverage: Math.round((item.units90 / 90) * 10) / 10, cumulativePercent: totalUnits ? Math.round((cumulative / totalUnits) * 1000) / 10 : 0 }
    })

    const data = { success: true, items, productMapping, anchor, start, days: 90, totalUnits, includesCancelledReturned: true, fetchedAt: new Date().toISOString() }
    cache = { at: Date.now(), data }
    res.setHeader('Cache-Control', 'private, max-age=300, stale-while-revalidate=21600')
    return res.status(200).json(data)
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message })
  }
}
