// /api/claims?view=summary|monthly|sku|by-product|imports-list|import
// อ่าน/จัดการข้อมูลเคลมจาก sheet "claims" (Google Sheets)
import { getSheet, batchGetValues, overwriteSheet } from './_lib/sheets.js'
import { deriveGroup, buildOverrideMap } from './_lib/productGroup.js'

const num = (v) => parseFloat(String(v ?? '').replace(/,/g, '')) || 0
const truthy = (v) => v === '1' || v === 1 || v === true || String(v).toLowerCase() === 'true'
const round2 = (n) => Math.round(n * 100) / 100

async function loadClaims() {
  return await getSheet('claims') // [{ date, business, product_name, free_item, claim_value, is_damaged, is_incomplete, is_wrong_item, note, master_sku, display_name, imported_at, import_id }]
}

export default async function handler(req, res) {
  const view = req.query.view || 'summary'

  try {
    // ---- ลบข้อมูลล็อตไฟล์ (DELETE) ----
    if (req.method === 'DELETE' || view === 'import') {
      const importId = req.query.importId
      if (!importId) return res.status(400).json({ success: false, error: 'ต้องระบุ importId' })
      const vr = await batchGetValues(['claims!A:Z'])
      const values = vr[0].values || []
      const headers = values[0] || []
      const idIdx = headers.indexOf('import_id')
      const kept = values.slice(1).filter((row) => (row[idIdx] || '') !== importId)
      await overwriteSheet('claims', headers, kept)
      return res.status(200).json({ success: true, deleted: values.length - 1 - kept.length })
    }

    if (view === 'imports-list') {
      const rows = await loadClaims()
      const map = new Map()
      for (const r of rows) {
        const id = r.import_id
        if (!id) continue
        if (!map.has(id)) map.set(id, { import_id: id, file_name: r.source_file || id, row_count: 0 })
        map.get(id).row_count++
      }
      return res.status(200).json({ success: true, files: [...map.values()] })
    }

    const rows = await loadClaims()
    const { startDate = '', endDate = '', business = '' } = req.query
    const inDate = (d) => (!startDate || d >= startDate) && (!endDate || d <= endDate)
    const keepBiz = (b) => !business || business === 'all' || b === business

    if (view === 'monthly') {
      const year = req.query.year || '2026'
      const monthly = Array.from({ length: 12 }, () => ({ count: 0, value: 0, damaged: 0, incomplete: 0, wrong: 0 }))
      const businessesSet = new Set()
      const byBiz = Array.from({ length: 12 }, () => ({})) // [{ [biz]: {value,count} }]
      const byBizTotal = {}

      for (const r of rows) {
        const d = String(r.date || '')
        if (!d.startsWith(year)) continue
        const m = parseInt(d.slice(5, 7), 10) - 1
        if (m < 0 || m > 11) continue
        const val = num(r.claim_value)
        monthly[m].count++
        monthly[m].value += val
        if (truthy(r.is_damaged)) monthly[m].damaged++
        if (truthy(r.is_incomplete)) monthly[m].incomplete++
        if (truthy(r.is_wrong_item)) monthly[m].wrong++
        const biz = r.business || '(ไม่ระบุ)'
        businessesSet.add(biz)
        if (!byBiz[m][biz]) byBiz[m][biz] = { value: 0, count: 0 }
        byBiz[m][biz].value += val; byBiz[m][biz].count++
        if (!byBizTotal[biz]) byBizTotal[biz] = { value: 0, count: 0 }
        byBizTotal[biz].value += val; byBizTotal[biz].count++
      }

      const businesses = [...businessesSet].sort()
      for (const row of byBiz) for (const b of businesses) if (!row[b]) row[b] = { value: 0, count: 0 }

      let prev = null
      for (const mo of monthly) {
        mo.value = round2(mo.value)
        mo.pctChange = prev !== null && prev > 0 ? Math.round(((mo.value - prev) / prev) * 100) : null
        prev = mo.value
      }
      const monthlyTotal = monthly.reduce(
        (a, m) => ({ count: a.count + m.count, value: round2(a.value + m.value), damaged: a.damaged + m.damaged, incomplete: a.incomplete + m.incomplete, wrong: a.wrong + m.wrong, pctChange: null }),
        { count: 0, value: 0, damaged: 0, incomplete: 0, wrong: 0 }
      )
      for (const b of businesses) byBizTotal[b].value = round2(byBizTotal[b].value)

      return res.status(200).json({ success: true, monthly, monthlyTotal, businesses, byBusinessMonthly: byBiz, byBusinessTotal: byBizTotal })
    }

    if (view === 'sku') {
      const sku = req.query.sku
      const recs = rows.filter((r) => (r.master_sku || 'UNMAPPED') === sku && inDate(r.date) && keepBiz(r.business))
      const bizMap = new Map()
      const reason = { damaged: { count: 0, value: 0 }, incomplete: { count: 0, value: 0 }, wrong: { count: 0, value: 0 } }
      let totalValue = 0
      for (const r of recs) {
        const val = num(r.claim_value); totalValue += val
        const b = r.business || '(ไม่ระบุ)'
        if (!bizMap.has(b)) bizMap.set(b, { business: b, count: 0, value: 0 })
        const x = bizMap.get(b); x.count++; x.value += val
        if (truthy(r.is_damaged)) { reason.damaged.count++; reason.damaged.value += val }
        if (truthy(r.is_incomplete)) { reason.incomplete.count++; reason.incomplete.value += val }
        if (truthy(r.is_wrong_item)) { reason.wrong.count++; reason.wrong.value += val }
      }
      return res.status(200).json({
        success: true,
        totalCount: recs.length,
        totalValue: round2(totalValue),
        byBusiness: [...bizMap.values()].map((x) => ({ ...x, value: round2(x.value) })).sort((a, b) => b.count - a.count),
        reasonSummary: reason,
        records: recs.map((r) => ({
          date: r.date, business: r.business, claim_value: num(r.claim_value),
          is_damaged: truthy(r.is_damaged), is_incomplete: truthy(r.is_incomplete), is_wrong_item: truthy(r.is_wrong_item),
          note: r.note, free_item: r.free_item,
        })),
      })
    }

    if (view === 'by-product') {
      // เคลมรวมเป็น "รายกลุ่มสินค้า" (product family) — ใช้ util เดียวกับ Dashboard สินค้า
      let overrideMap = new Map()
      try { overrideMap = buildOverrideMap(await getSheet('product_aliases')) } catch { /* ข้ามได้ */ }

      const recs = rows.filter((r) => inDate(r.date) && keepBiz(r.business))
      const groupMap = new Map() // key -> { key, label, count, value, damaged, incomplete, wrong, skus:Set }
      for (const r of recs) {
        const { key, label } = deriveGroup(r.display_name, r.master_sku, overrideMap)
        let g = groupMap.get(key)
        if (!g) groupMap.set(key, (g = { key, label, count: 0, value: 0, damaged: 0, incomplete: 0, wrong: 0, skus: new Set() }))
        g.count++
        g.value += num(r.claim_value)
        if (truthy(r.is_damaged)) g.damaged++
        if (truthy(r.is_incomplete)) g.incomplete++
        if (truthy(r.is_wrong_item)) g.wrong++
        if (r.master_sku) g.skus.add(r.master_sku)
      }
      const products = [...groupMap.values()]
        .map((g) => ({ ...g, value: round2(g.value), skuCount: g.skus.size, skus: [...g.skus] }))
        .sort((a, b) => b.count - a.count)
      return res.status(200).json({ success: true, totalCount: recs.length, products })
    }

    // ---- view === 'summary' ----
    const filtered = rows.filter((r) => inDate(r.date) && keepBiz(r.business))
    let claimValue = 0, damageCount = 0, incompleteCount = 0, wrongItemCount = 0
    const skuMap = new Map()
    const dateMap = new Map()
    for (const r of filtered) {
      const val = num(r.claim_value); claimValue += val
      if (truthy(r.is_damaged)) damageCount++
      if (truthy(r.is_incomplete)) incompleteCount++
      if (truthy(r.is_wrong_item)) wrongItemCount++
      const key = r.master_sku || 'UNMAPPED'
      if (!skuMap.has(key)) skuMap.set(key, { master_sku: key, display_name: r.display_name || '', count: 0, value: 0 })
      const s = skuMap.get(key); s.count++; s.value += val
      if (r.date) dateMap.set(r.date, (dateMap.get(r.date) || 0) + 1)
    }
    return res.status(200).json({
      success: true,
      totalClaims: filtered.length,
      claimValue: round2(claimValue),
      totalValue: round2(claimValue),
      damageCount, incompleteCount, wrongItemCount,
      topClaimSkus: [...skuMap.values()].map((s) => ({ ...s, value: round2(s.value) })).sort((a, b) => b.count - a.count),
      claimByDate: [...dateMap.entries()].map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date)),
    })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
}
