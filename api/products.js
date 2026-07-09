// GET /api/products?business=&platform=&startDate=&endDate=
// สรุปผลงานสินค้าแบบ "รายกลุ่มสินค้า" (product family) สำหรับหน้า Dashboard สินค้า
// รวม SKU คนละไซส์เข้าเป็นสินค้าเดียวด้วย api/_lib/productGroup.js (TODO#2/#4)
import { requireAuth, cacheable } from './_lib/auth.js'
import { getMeta, batchGetValues, getSheet } from './_lib/sheets.js'
import { deriveGroup, buildOverrideMap } from './_lib/productGroup.js'

const isCancelled = (s = '') => s.includes('ยกเลิก') || s.toLowerCase().includes('cancel')
const num = (v) => parseFloat(String(v ?? '').replace(/,/g, '')) || 0
const round2 = (n) => Math.round(n * 100) / 100

// จำนวนกลุ่มที่ส่ง monthly trend กลับไป (กราฟแนวโน้ม) — คุมขนาด response
const TREND_TOP_N = 8

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' })

  const { business = 'all', platform = 'all', startDate = '', endDate = '' } = req.query
  const inDate = (d) => (!startDate || d >= startDate) && (!endDate || d <= endDate)
  const keepBiz = (b) => business === 'all' || b === business
  const keepPlat = (p) => platform === 'all' || p === platform

  try {
    // override รายชื่อกลุ่มจาก product_aliases (คอลัมน์ product_group ถ้ามี) — ไม่มีก็ข้าม
    let overrideMap = new Map()
    try {
      overrideMap = buildOverrideMap(await getSheet('product_aliases'))
    } catch { /* ไม่มี sheet หรืออ่านไม่ได้ — ใช้การ strip อัตโนมัติแทน */ }

    const meta = await getMeta()
    const tabs = meta.sheets.map((s) => s.properties.title).filter((t) => t.startsWith('raw_orders'))

    // B:F = order_id, order_item_id, date, platform, business ; J:N = master_sku, display_name, qty, revenue, status
    const ranges = tabs.flatMap((t) => [`${t}!B:F`, `${t}!J:N`])
    const vr = await batchGetValues(ranges)

    const groups = new Map()  // key -> { key, label, revenue, units, orderIds:Set, skus:Map, platforms:Map, monthly:Map }
    const monthsSet = new Set()

    for (let i = 0; i < tabs.length; i++) {
      const left = vr[2 * i].values || []
      const right = vr[2 * i + 1].values || []
      const n = Math.max(left.length, right.length)
      for (let j = 1; j < n; j++) {
        const l = left[j] || [], r = right[j] || []
        const orderId = l[0], date = l[2], plat = l[3], biz = l[4]
        const masterSku = r[0], name = r[1], qty = parseInt(r[2], 10) || 0, rev = num(r[3]), status = r[4]
        if (!date || isCancelled(status)) continue
        if (!inDate(date) || !keepBiz(biz) || !keepPlat(plat)) continue

        const { key, label } = deriveGroup(name, masterSku, overrideMap)

        let g = groups.get(key)
        if (!g) groups.set(key, (g = {
          key, label, revenue: 0, units: 0,
          orderIds: new Set(), skus: new Map(), platforms: new Map(), monthly: new Map(),
        }))
        g.revenue += rev; g.units += qty
        if (orderId) g.orderIds.add(orderId)

        // สมาชิก SKU ในกลุ่ม
        const sk = masterSku || '(ไม่ระบุ)'
        let m = g.skus.get(sk)
        if (!m) g.skus.set(sk, (m = { master_sku: sk, display_name: name || sk, revenue: 0, units: 0 }))
        m.revenue += rev; m.units += qty
        if (!m.display_name && name) m.display_name = name

        if (plat) g.platforms.set(plat, (g.platforms.get(plat) || 0) + rev)

        const ym = String(date).slice(0, 7)
        monthsSet.add(ym)
        g.monthly.set(ym, (g.monthly.get(ym) || 0) + rev)
      }
    }

    const months = [...monthsSet].sort()

    const groupArr = [...groups.values()]
      .map((g) => ({
        key: g.key,
        label: g.label,
        revenue: round2(g.revenue),
        units: g.units,
        orders: g.orderIds.size,
        skuCount: g.skus.size,
        avgPrice: g.units > 0 ? Math.round(g.revenue / g.units) : 0,
        members: [...g.skus.values()]
          .map((m) => ({ ...m, revenue: round2(m.revenue) }))
          .sort((a, b) => b.revenue - a.revenue),
        platforms: Object.fromEntries([...g.platforms.entries()].map(([k, v]) => [k, round2(v)])),
        _monthly: g.monthly,
      }))
      .sort((a, b) => b.revenue - a.revenue)

    // แนวโน้มรายเดือนของกลุ่มขายดี top N (สำหรับกราฟเส้น)
    const trendTopGroups = groupArr.slice(0, TREND_TOP_N).map((g) => ({
      key: g.key,
      label: g.label,
      monthly: months.map((ym) => ({ month: ym, revenue: round2(g._monthly.get(ym) || 0) })),
    }))

    const totals = groupArr.reduce(
      (a, g) => ({
        revenue: round2(a.revenue + g.revenue),
        units: a.units + g.units,
        skuCount: a.skuCount + g.skuCount,
      }),
      { revenue: 0, units: 0, skuCount: 0 }
    )

    // ตัด _monthly ออกจาก payload หลัก (ใหญ่เกินจำเป็น) — ส่งเฉพาะใน trendTopGroups
    for (const g of groupArr) delete g._monthly

    res.setHeader('Cache-Control', cacheable('public, s-maxage=120, stale-while-revalidate=600'))
    res.status(200).json({
      success: true,
      totals: { ...totals, groupCount: groupArr.length },
      groups: groupArr.slice(0, 100),
      months,
      trendTopGroups,
    })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
}
