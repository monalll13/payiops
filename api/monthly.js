// GET /api/monthly?year=2026
// สรุปยอดขาย/ออเดอร์ แยกรายเดือน และแยกร้าน (business × platform) จาก raw_orders_*
import { requireAuth, cacheable } from './_lib/auth.js'
import { getMeta, batchGetValues } from './_lib/sheets.js'

const isCancelled = (s = '') => s.includes('ยกเลิก') || s.toLowerCase().includes('cancel')
const num = (v) => parseFloat(String(v ?? '').replace(/,/g, '')) || 0
const round2 = (n) => Math.round(n * 100) / 100
const platShort = (p) => String(p || '').replace(' Shop', '')

// เหตุผลเดียวกับ dashboard.js — cacheable() บังคับ no-store ตอนเปิด auth เลย cache ในหน่วยความจำแทน CDN
const monthlyCache = new Map()
const MONTHLY_CACHE_MS = 300000

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' })
  const year = String(req.query.year || '').trim()

  const cached = monthlyCache.get(year)
  if (cached && Date.now() - cached.at < MONTHLY_CACHE_MS) {
    res.setHeader('Cache-Control', cacheable('public, s-maxage=300, stale-while-revalidate=1800'))
    return res.status(200).json(cached.data)
  }

  try {
    const meta = await getMeta()
    const tabs = meta.sheets.map((s) => s.properties.title).filter((t) => t.startsWith('raw_orders'))
    // B:F = order_id, order_item_id, date, platform, business ; L:N = qty, revenue, status
    const ranges = tabs.flatMap((t) => [`${t}!B:F`, `${t}!L:N`])
    const vr = await batchGetValues(ranges)

    const trend = new Map()        // 'YYYY-MM' -> { sales, units, orderIds:Set }
    const store = new Map()        // 'YYYY-MM' -> Map(storeKey -> { business, platform, sales, units, orderIds:Set })
    const yearsSet = new Set()

    for (let i = 0; i < tabs.length; i++) {
      const left = vr[2 * i].values || []
      const right = vr[2 * i + 1].values || []
      const n = Math.max(left.length, right.length)
      for (let j = 1; j < n; j++) {
        const l = left[j] || [], r = right[j] || []
        const orderId = l[0], date = l[2], platform = l[3] || '', business = l[4] || ''
        const qty = parseInt(r[0], 10) || 0, rev = num(r[1]), status = r[2]
        if (!date || isCancelled(status)) continue
        const ym = String(date).slice(0, 7)
        yearsSet.add(String(date).slice(0, 4))
        if (year && !ym.startsWith(year)) continue

        let t = trend.get(ym)
        if (!t) trend.set(ym, (t = { sales: 0, units: 0, orderIds: new Set() }))
        t.sales += rev; t.units += qty; if (orderId) t.orderIds.add(orderId)

        let sm = store.get(ym)
        if (!sm) store.set(ym, (sm = new Map()))
        const key = `${business} ${platShort(platform)}`
        let s = sm.get(key)
        if (!s) sm.set(key, (s = { store: key, business, platform, sales: 0, units: 0, orderIds: new Set() }))
        s.sales += rev; s.units += qty; if (orderId) s.orderIds.add(orderId)
      }
    }

    const trendArr = [...trend.entries()]
      .map(([month, v]) => ({ month, sales: round2(v.sales), orders: v.orderIds.size, units: v.units }))
      .sort((a, b) => a.month.localeCompare(b.month))

    const byStore = {}
    for (const [ym, sm] of store.entries()) {
      byStore[ym] = [...sm.values()]
        .map((s) => ({ store: s.store, business: s.business, platform: s.platform, sales: round2(s.sales), orders: s.orderIds.size, units: s.units }))
        .sort((a, b) => b.sales - a.sales)
    }

    const data = {
      success: true,
      year: year || null,
      years: [...yearsSet].sort(),
      months: trendArr.map((t) => t.month),
      trend: trendArr,
      byStore,
    }
    monthlyCache.set(year, { data, at: Date.now() })
    res.setHeader('Cache-Control', cacheable('public, s-maxage=300, stale-while-revalidate=1800'))
    res.status(200).json(data)
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
}
