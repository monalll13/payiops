// GET /api/dashboard?business=&platform=&startDate=&endDate=
// สรุปข้อมูลสำหรับหน้า Executive จากทุก tab raw_orders_* (Google Sheets)
import { requireAuth, cacheable } from './_lib/auth.js'
import { getMeta, batchGetValues, getSheet } from './_lib/sheets.js'
import { deriveGroup, buildOverrideMap } from './_lib/productGroup.js'

const isCancelled = (s = '') => s.includes('ยกเลิก') || s.toLowerCase().includes('cancel')
const num = (v) => parseFloat(String(v ?? '').replace(/,/g, '')) || 0
const round2 = (n) => Math.round(n * 100) / 100

// อ่าน raw_orders ทั้งหมดช้า (~5-12s) — cache แบบ public Cache-Control ใช้ไม่ได้ตอนเปิด auth
// (cacheable() บังคับ no-store เพราะ response แต่ละคนไม่ควร cache ที่ CDN) จึงต้อง cache ในหน่วยความจำแทน
const dashboardCache = new Map()
const DASHBOARD_CACHE_MS = 120000

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' })

  const { business = 'all', platform = 'all', startDate = '', endDate = '' } = req.query
  const inDate = (d) => (!startDate || d >= startDate) && (!endDate || d <= endDate)
  const keepBiz = (b) => business === 'all' || b === business
  const keepPlat = (p) => platform === 'all' || p === platform

  const cacheKey = `${business}|${platform}|${startDate}|${endDate}`
  const cached = dashboardCache.get(cacheKey)
  if (cached && Date.now() - cached.at < DASHBOARD_CACHE_MS) {
    res.setHeader('Cache-Control', cacheable('public, s-maxage=120, stale-while-revalidate=600'))
    return res.status(200).json(cached.data)
  }

  try {
    // override รายชื่อกลุ่มจาก product_aliases (เหมือน products.js/product-trends.js) — ไม่มีก็ข้าม
    let overrideMap = new Map()
    try { overrideMap = buildOverrideMap(await getSheet('product_aliases')) } catch { /* ไม่มี sheet — ใช้การ strip อัตโนมัติแทน */ }

    const meta = await getMeta()
    const tabs = meta.sheets.map((s) => s.properties.title).filter((t) => t.startsWith('raw_orders'))

    // อ่าน B:F (order_id, order_item_id, date, platform, business) และ J:N (master_sku, display_name, qty, revenue, status)
    const ranges = tabs.flatMap((t) => [`${t}!B:F`, `${t}!J:N`])
    const vr = await batchGetValues(ranges)

    // ---- PASS 1: หา distinct dates ที่ผ่าน filter เพื่อกำหนด "today / yesterday" ----
    const availableDateSet = new Set()
    const dateSet = new Set()
    for (let i = 0; i < tabs.length; i++) {
      const left = vr[2 * i].values || []
      for (let j = 1; j < left.length; j++) {
        const row = left[j]
        if (!row) continue
        const date = row[2], plat = row[3], biz = row[4]
        if (!date || !keepBiz(biz) || !keepPlat(plat)) continue
        availableDateSet.add(date)
        if (inDate(date)) dateSet.add(date)
      }
    }
    const sortedAvailableDates = [...availableDateSet].sort()
    const sortedDates = [...dateSet].sort()
    const latestDataDate = sortedAvailableDates[sortedAvailableDates.length - 1] || null
    const earliestDataDate = sortedAvailableDates[0] || null
    const todayD = sortedDates[sortedDates.length - 1] || null
    const yestD = sortedDates[sortedDates.length - 2] || null

    // ---- ช่วงก่อนหน้า (สำหรับ trend %) เมื่อมี date range ----
    let prevStart = null, prevEnd = null
    if (startDate && endDate) {
      const s = new Date(startDate), e = new Date(endDate)
      const days = Math.round((e - s) / 86400000) + 1
      const pe = new Date(s); pe.setDate(pe.getDate() - 1)
      const ps = new Date(pe); ps.setDate(ps.getDate() - days + 1)
      prevStart = ps.toISOString().slice(0, 10)
      prevEnd = pe.toISOString().slice(0, 10)
    }
    const inPrev = (d) => prevStart && d >= prevStart && d <= prevEnd

    // ---- PASS 2: aggregate ----
    let revenue = 0, units = 0
    const orderIds = new Set()
    let prevRevenue = 0, prevUnits = 0
    const prevOrderIds = new Set()

    const dailyRev = new Map()          // date -> amount
    const dailyOrders = new Map()       // date -> Set(order_id)
    const bizRev = new Map()            // business -> amount
    const platRev = new Map()           // platform -> amount
    // "สินค้าขายดี" ตอนนี้รวมเป็นรายกลุ่มสินค้า (product family) ไม่ใช่รายแยก SKU/ไซส์
    // ใช้ deriveGroup ตัวเดียวกับ products.js/product-trends.js — SKU จริงยังดูได้ผ่าน skuCount/skus
    const sku = new Map()               // product-group key -> { name, orderIds:Set, qty, revenue, platforms:Map, platformUnits:Map, skus:Set }
    const groupToday = new Map()        // product-group key -> revenue (today) — ใช้กับ Trending Up/Down + Alert Center
    const groupYest = new Map()         // product-group key -> revenue (yesterday)

    for (let i = 0; i < tabs.length; i++) {
      const left = vr[2 * i].values || []
      const right = vr[2 * i + 1].values || []
      const n = Math.max(left.length, right.length)
      for (let j = 1; j < n; j++) {
        const l = left[j] || [], r = right[j] || []
        const orderId = l[0], date = l[2], plat = l[3], biz = l[4]
        const masterSku = r[0], name = r[1], qty = parseInt(r[2], 10) || 0, rev = num(r[3]), status = r[4]
        if (!date || isCancelled(status)) continue

        // ช่วงก่อนหน้า (ไม่สน platform/biz filter ยกเว้นที่ผู้ใช้เลือก) — ใช้เทียบ trend
        if (inPrev(date) && keepBiz(biz) && keepPlat(plat)) {
          prevRevenue += rev; prevUnits += qty
          if (orderId) prevOrderIds.add(orderId)
        }

        if (!inDate(date) || !keepBiz(biz) || !keepPlat(plat)) continue

        revenue += rev; units += qty
        if (orderId) orderIds.add(orderId)

        dailyRev.set(date, (dailyRev.get(date) || 0) + rev)
        let ds = dailyOrders.get(date); if (!ds) dailyOrders.set(date, (ds = new Set())); if (orderId) ds.add(orderId)
        bizRev.set(biz, (bizRev.get(biz) || 0) + rev)
        platRev.set(plat, (platRev.get(plat) || 0) + rev)

        const { key: groupKey, label: groupLabel } = deriveGroup(name, masterSku, overrideMap)
        let s = sku.get(groupKey)
        if (!s) sku.set(groupKey, (s = { name: groupLabel, orderIds: new Set(), qty: 0, revenue: 0, platforms: new Map(), platformUnits: new Map(), skus: new Set() }))
        s.qty += qty; s.revenue += rev
        if (orderId) s.orderIds.add(orderId)
        if (masterSku) s.skus.add(masterSku)
        if (plat) {
          s.platforms.set(plat, (s.platforms.get(plat) || 0) + rev)
          s.platformUnits.set(plat, (s.platformUnits.get(plat) || 0) + qty)
        }

        if (date === todayD) groupToday.set(groupKey, (groupToday.get(groupKey) || 0) + rev)
        else if (date === yestD) groupYest.set(groupKey, (groupYest.get(groupKey) || 0) + rev)
      }
    }

    const orders = orderIds.size
    const aov = orders ? revenue / orders : 0

    // ---- trends (%) ----
    const pct = (cur, prev) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null)
    const prevOrders = prevOrderIds.size
    const revenueTrend = prevStart ? pct(revenue, prevRevenue) : null
    const ordersTrend = prevStart ? pct(orders, prevOrders) : null
    const unitsTrend = prevStart ? pct(units, prevUnits) : null
    const aovTrend = prevStart ? pct(aov, prevOrders ? prevRevenue / prevOrders : 0) : null

    // ---- breakdowns ----
    const revenueByDay = [...dailyRev.entries()].map(([date, amount]) => ({ date, amount: round2(amount) })).sort((a, b) => a.date.localeCompare(b.date))
    const ordersByDay = [...dailyOrders.entries()].map(([date, set]) => ({ date, count: set.size })).sort((a, b) => a.date.localeCompare(b.date))
    const businessBreakdown = [...bizRev.entries()].map(([name, amount]) => ({ name, amount: round2(amount) })).sort((a, b) => b.amount - a.amount)
    const platformBreakdown = [...platRev.entries()].map(([name, amount]) => ({ name, amount: round2(amount) })).sort((a, b) => b.amount - a.amount)

    const topSkus = [...sku.entries()]
      .map(([groupKey, v]) => ({
        key: groupKey,           // product-group key (ไม่ใช่ SKU จริง — ดู skuCount/skus สำหรับ SKU)
        display_name: v.name,
        skuCount: v.skus.size,
        skus: [...v.skus],
        orders: v.orderIds.size,
        qty: v.qty,
        amount: round2(v.revenue),
        platforms: Object.fromEntries([...v.platforms.entries()].map(([k, x]) => [k, round2(x)])),
        platformUnits: Object.fromEntries(v.platformUnits.entries()),
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 50)

    // ---- command center ----
    const todayRevenue = todayD ? round2(dailyRev.get(todayD) || 0) : 0
    const yestRevenue = yestD ? (dailyRev.get(yestD) || 0) : 0
    const revenueGrowth = yestRevenue > 0 ? Math.round(((todayRevenue - yestRevenue) / yestRevenue) * 100) : null

    const deltas = [...new Set([...groupToday.keys(), ...groupYest.keys()])].map((k) => {
      const t = groupToday.get(k) || 0, y = groupYest.get(k) || 0
      const g = sku.get(k)
      return { key: k, display_name: g?.name || k, delta: round2(t - y), todayRevenue: round2(t) }
    })
    const trendingUp = deltas.filter((d) => d.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 5)
    const trendingDown = deltas.filter((d) => d.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 5)

    const alerts = []
    if (revenueGrowth !== null && revenueGrowth <= -30) {
      alerts.push({ type: 'critical', category: 'ยอดขายตก', message: `รายได้วันนี้ (${todayD}) ต่ำกว่าเมื่อวาน ${Math.abs(revenueGrowth)}% — ควรตรวจสอบช่องทางที่ตก` })
    }
    if (trendingDown.length > 0 && trendingDown[0].delta < 0) {
      const t = trendingDown[0]
      alerts.push({ type: 'warning', category: 'สินค้ายอดตก', message: `${t.display_name} ยอดตกจากเมื่อวาน ฿${Math.abs(t.delta).toLocaleString()}` })
    }

    const data = {
      success: true,
      revenue: round2(revenue),
      orders,
      units,
      aov: Math.round(aov),
      revenueTrend, ordersTrend, unitsTrend, aovTrend,
      revenueByDay, ordersByDay,
      businessBreakdown, platformBreakdown,
      topSkus,
      commandCenter: { alerts, trendingUp, trendingDown, todayRevenue, revenueGrowth },
      dataRange: { earliestDate: earliestDataDate, latestDate: latestDataDate },
    }
    dashboardCache.set(cacheKey, { data, at: Date.now() })
    res.setHeader('Cache-Control', cacheable('public, s-maxage=120, stale-while-revalidate=600'))
    res.status(200).json(data)
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
}
