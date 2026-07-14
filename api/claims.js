// /api/claims?view=summary|monthly|sku|by-product|imports-list|import
// อ่าน/จัดการข้อมูลเคลมจาก sheet "claims" (Google Sheets)
import { requireAuth } from './_lib/auth.js'
import { getSheet, getMeta, batchGetValues, appendRows, overwriteSheet } from './_lib/sheets.js'
import { deriveGroup, buildOverrideMap } from './_lib/productGroup.js'
import { buildClaimAliasLookup, resolveClaimAlias } from './_lib/claimMapping.js'

const num = (v) => parseFloat(String(v ?? '').replace(/,/g, '')) || 0
const truthy = (v) => v === '1' || v === 1 || v === true || String(v).toLowerCase() === 'true'
const round2 = (n) => Math.round(n * 100) / 100
const isCancelled = (s = '') => String(s).includes('ยกเลิก') || String(s).toLowerCase().includes('cancel')
// เคลมบางแถวไม่ได้ติ๊กประเภทไหนเลย (เสีย/ส่งไม่ครบ/ส่งผิด) — ถ้าไม่นับแยกไว้ ยอดรวม 3 ประเภทจะน้อยกว่ายอดเคลมทั้งหมดโดยไม่มีอะไรเตือน
const noneFlagged = (r) => !truthy(r.is_damaged) && !truthy(r.is_incomplete) && !truthy(r.is_wrong_item)
// เคลมบางแถวมีแต่ product_name (display_name/master_sku ว่าง) — ไม่ fallback จะรวมเป็น "(ไม่ระบุ)" กลุ่มเดียวทั้งที่เป็นคนละสินค้า
const claimGroup = (r, overrideMap) => deriveGroup(r.display_name || r.product_name, r.master_sku, overrideMap)

async function loadClaims() {
  return await getSheet('claims') // [{ date, business, product_name, free_item, claim_value, is_damaged, is_incomplete, is_wrong_item, note, master_sku, display_name, imported_at, import_id }]
}

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
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

    if (view === 'mapping-options') {
      const aliases = await getSheet('product_aliases')
      const products = new Map()
      for (const a of aliases) if (a.master_sku && !products.has(a.master_sku)) products.set(a.master_sku, { master_sku: a.master_sku, display_name: a.display_name || a.master_sku })
      return res.status(200).json({ success: true, products: [...products.values()].sort((a, b) => a.display_name.localeCompare(b.display_name, 'th')) })
    }

    if (view === 'map-product' && req.method === 'POST') {
      const claimName = String(req.body?.claimName || '').trim()
      const masterSku = String(req.body?.masterSku || '').trim()
      if (!claimName || !masterSku) return res.status(400).json({ success: false, error: 'ต้องระบุชื่อ Claims และ master SKU' })
      const aliases = await getSheet('product_aliases')
      const target = aliases.find((a) => String(a.master_sku).trim() === masterSku)
      if (!target) return res.status(404).json({ success: false, error: `ไม่พบ ${masterSku} ใน product_aliases` })
      if (!aliases.some((a) => String(a.alias_product_name).trim() === claimName && String(a.master_sku).trim() === masterSku)) {
        const vr = await batchGetValues(['product_aliases!A1:Z1'])
        const headers = vr[0].values?.[0] || []
        const values = {
          master_sku: masterSku, display_name: target.display_name || masterSku, business: target.business || 'Payi',
          platform: 'Claims', alias_product_name: claimName, alias_variation: '', alias_key: `${claimName}|`, created_at: new Date().toISOString(),
        }
        await appendRows('product_aliases', [headers.map((h) => values[h] || '')])
      }
      return res.status(200).json({ success: true, master_sku: masterSku, display_name: target.display_name || masterSku })
    }

    if (view === 'backfill' && req.method === 'POST') {
      const vr = await batchGetValues(['claims!A:Z'])
      const values = vr[0].values || [], headers = values[0] || []
      const skuIdx = headers.indexOf('master_sku'), displayIdx = headers.indexOf('display_name'), productIdx = headers.indexOf('product_name')
      if (skuIdx < 0 || displayIdx < 0 || productIdx < 0) return res.status(400).json({ success: false, error: 'claims schema ไม่ครบ' })
      const lookup = buildClaimAliasLookup(await getSheet('product_aliases'))
      let updated = 0, fuzzyUpdated = 0
      const kept = values.slice(1).map((row) => {
        if (row[skuIdx]) return row
        const alias = resolveClaimAlias(lookup, row[productIdx])
        if (!alias) return row
        const next = [...row]; next[skuIdx] = alias.master_sku; next[displayIdx] = alias.display_name; updated++; if (alias.match_method === 'fuzzy') fuzzyUpdated++; return next
      })
      if (updated) await overwriteSheet('claims', headers, kept)
      return res.status(200).json({ success: true, updated, fuzzyUpdated })
    }

    const rows = await loadClaims()
    const { startDate = '', endDate = '', business = '', product = '', reason = '' } = req.query
    const inDate = (d) => (!startDate || d >= startDate) && (!endDate || d <= endDate)
    const keepBiz = (b) => !business || business === 'all' || b === business

    if (view === 'monthly') {
      const year = req.query.year || String(new Date().getFullYear())
      const monthly = Array.from({ length: 12 }, () => ({ count: 0, value: 0, damaged: 0, incomplete: 0, wrong: 0, unspecified: 0 }))
      const businessesSet = new Set()
      const byBiz = Array.from({ length: 12 }, () => ({})) // [{ [biz]: {value,count} }]
      const byBizTotal = {}

      // ตัวหารที่ตรวจสอบย้อนกลับได้: qty จาก raw_orders_YYYY_MM เฉพาะรายการที่ไม่ยกเลิก
      const meta = await getMeta()
      const monthTabs = meta.sheets
        .map((s) => s.properties.title)
        .filter((t) => t.startsWith(`raw_orders_${year}_`))
      const outgoingByMonth = Array(12).fill(0)
      if (monthTabs.length) {
        const orderRanges = await batchGetValues(monthTabs.map((t) => `${t}!J:N`))
        for (let i = 0; i < monthTabs.length; i++) {
          const monthIndex = parseInt(monthTabs[i].slice(-2), 10) - 1
          if (monthIndex < 0 || monthIndex > 11) continue
          for (const row of (orderRanges[i].values || []).slice(1)) {
            if (!isCancelled(row[4])) outgoingByMonth[monthIndex] += parseInt(row[2], 10) || 0
          }
        }
      }

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
        if (noneFlagged(r)) monthly[m].unspecified++
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
      monthly.forEach((mo, i) => {
        mo.outgoingUnits = outgoingByMonth[i]
        mo.claimRate = mo.outgoingUnits > 0 ? round2((mo.count / mo.outgoingUnits) * 100) : null
      })
      // %MoM แยกตามแบรนด์ — เหมือน monthly.pctChange แต่ไล่ทีละแบรนด์
      for (const b of businesses) {
        let prevBizValue = null
        for (const row of byBiz) {
          row[b].value = round2(row[b].value)
          row[b].pctChange = prevBizValue !== null && prevBizValue > 0 ? Math.round(((row[b].value - prevBizValue) / prevBizValue) * 100) : null
          prevBizValue = row[b].value
        }
      }
      const monthlyTotal = monthly.reduce(
        (a, m) => ({ count: a.count + m.count, value: round2(a.value + m.value), damaged: a.damaged + m.damaged, incomplete: a.incomplete + m.incomplete, wrong: a.wrong + m.wrong, unspecified: a.unspecified + m.unspecified, outgoingUnits: a.outgoingUnits + m.outgoingUnits, pctChange: null }),
        { count: 0, value: 0, damaged: 0, incomplete: 0, wrong: 0, unspecified: 0, outgoingUnits: 0 }
      )
      monthlyTotal.claimRate = monthlyTotal.outgoingUnits > 0 ? round2((monthlyTotal.count / monthlyTotal.outgoingUnits) * 100) : null
      for (const b of businesses) byBizTotal[b].value = round2(byBizTotal[b].value)

      return res.status(200).json({ success: true, monthly, monthlyTotal, businesses, byBusinessMonthly: byBiz, byBusinessTotal: byBizTotal })
    }

    if (view === 'sku') {
      const sku = req.query.sku
      const productKey = String(req.query.productKey || '').trim()
      let overrideMap = new Map()
      if (productKey) {
        try { overrideMap = buildOverrideMap(await getSheet('product_aliases')) } catch { /* ข้ามได้ */ }
      }
      const recs = rows.filter((r) => {
        if (!inDate(r.date) || !keepBiz(r.business)) return false
        if (productKey) return claimGroup(r, overrideMap).key === productKey
        return (r.master_sku || 'UNMAPPED') === sku
      })
      const bizMap = new Map()
      const reason = { damaged: { count: 0, value: 0 }, incomplete: { count: 0, value: 0 }, wrong: { count: 0, value: 0 }, unspecified: { count: 0, value: 0 } }
      let totalValue = 0
      const monthlyMap = new Map()
      for (const r of recs) {
        const val = num(r.claim_value); totalValue += val
        const b = r.business || '(ไม่ระบุ)'
        if (!bizMap.has(b)) bizMap.set(b, { business: b, count: 0, value: 0 })
        const x = bizMap.get(b); x.count++; x.value += val
        if (truthy(r.is_damaged)) { reason.damaged.count++; reason.damaged.value += val }
        if (truthy(r.is_incomplete)) { reason.incomplete.count++; reason.incomplete.value += val }
        if (truthy(r.is_wrong_item)) { reason.wrong.count++; reason.wrong.value += val }
        if (noneFlagged(r)) { reason.unspecified.count++; reason.unspecified.value += val }
        const ym = String(r.date || '').slice(0, 7)
        if (ym) { const m = monthlyMap.get(ym) || { month: ym, count: 0, value: 0 }; m.count++; m.value += val; monthlyMap.set(ym, m) }
      }
      return res.status(200).json({
        success: true,
        totalCount: recs.length,
        totalValue: round2(totalValue),
        byBusiness: [...bizMap.values()].map((x) => ({ ...x, value: round2(x.value) })).sort((a, b) => b.count - a.count),
        reasonSummary: reason,
        monthlyTrend: [...monthlyMap.values()].map(m => ({ ...m, value: round2(m.value) })).sort((a, b) => a.month.localeCompare(b.month)),
        records: recs.map((r) => ({
          date: r.date, business: r.business, master_sku: r.master_sku, display_name: r.display_name, product_name: r.product_name,
          claim_value: num(r.claim_value),
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
      const groupMap = new Map() // key -> { key, label, count, value, damaged, incomplete, wrong, unspecified, skus:Set }
      for (const r of recs) {
        const { key, label } = claimGroup(r, overrideMap)
        let g = groupMap.get(key)
        if (!g) groupMap.set(key, (g = { key, label, count: 0, value: 0, damaged: 0, incomplete: 0, wrong: 0, unspecified: 0, skus: new Set() }))
        g.count++
        g.value += num(r.claim_value)
        if (truthy(r.is_damaged)) g.damaged++
        if (truthy(r.is_incomplete)) g.incomplete++
        if (truthy(r.is_wrong_item)) g.wrong++
        if (noneFlagged(r)) g.unspecified++
        if (r.master_sku) g.skus.add(r.master_sku)
      }
      const products = [...groupMap.values()]
        .map((g) => ({ ...g, value: round2(g.value), skuCount: g.skus.size, skus: [...g.skus] }))
        .sort((a, b) => b.count - a.count)
      return res.status(200).json({ success: true, totalCount: recs.length, products })
    }

    // ---- view === 'summary' ----
    const filtered = rows.filter((r) => {
      if (!inDate(r.date) || !keepBiz(r.business)) return false
      if (product && !String(r.display_name || r.product_name || '').toLowerCase().includes(String(product).toLowerCase())) return false
      if (reason === 'damaged' && !truthy(r.is_damaged)) return false
      if (reason === 'incomplete' && !truthy(r.is_incomplete)) return false
      if (reason === 'wrong' && !truthy(r.is_wrong_item)) return false
      if (reason === 'unspecified' && !noneFlagged(r)) return false
      return true
    })
    let claimValue = 0, damageCount = 0, incompleteCount = 0, wrongItemCount = 0, unspecifiedCount = 0
    let overrideMap = new Map()
    try { overrideMap = buildOverrideMap(await getSheet('product_aliases')) } catch { /* ข้ามได้ */ }
    const productMap = new Map()
    const dateMap = new Map()
    const unmappedMap = new Map()
    for (const r of filtered) {
      const val = num(r.claim_value); claimValue += val
      if (truthy(r.is_damaged)) damageCount++
      if (truthy(r.is_incomplete)) incompleteCount++
      if (truthy(r.is_wrong_item)) wrongItemCount++
      if (noneFlagged(r)) unspecifiedCount++
      const { key, label } = claimGroup(r, overrideMap)
      if (!productMap.has(key)) productMap.set(key, { product_key: key, master_sku: '', display_name: label, count: 0, mappedCount: 0, value: 0, skus: new Set() })
      const s = productMap.get(key); s.count++; s.value += val
      if (r.master_sku) { s.skus.add(r.master_sku); s.mappedCount++ }
      else {
        const name = r.product_name || r.display_name || '(ไม่ระบุ)'
        const u = unmappedMap.get(name) || { product_name: name, count: 0 }
        u.count++; unmappedMap.set(name, u)
      }
      if (r.date) dateMap.set(r.date, (dateMap.get(r.date) || 0) + 1)
    }
    // ตัวหารรายสินค้า ใช้ flow เดียวกับ Dashboard: raw order -> master_sku/display_name -> deriveGroup
    const unitsByProduct = new Map()
    const meta = await getMeta()
    const orderTabs = meta.sheets.map((x) => x.properties.title).filter((t) => t.startsWith('raw_orders_'))
    if (orderTabs.length) {
      const orderData = await batchGetValues(orderTabs.flatMap((t) => [`${t}!B:F`, `${t}!J:N`]))
      for (let i = 0; i < orderTabs.length; i++) {
        const left = orderData[i * 2].values || [], right = orderData[i * 2 + 1].values || []
        for (let j = 1; j < Math.max(left.length, right.length); j++) {
          const l = left[j] || [], r = right[j] || []
          if (!inDate(String(l[2] || '')) || !keepBiz(l[4]) || isCancelled(r[4])) continue
          const { key } = deriveGroup(r[1], r[0], overrideMap)
          unitsByProduct.set(key, (unitsByProduct.get(key) || 0) + (parseInt(r[2], 10) || 0))
        }
      }
    }
    const topClaimProducts = [...productMap.values()]
      .map((s) => {
        const outgoingUnits = unitsByProduct.get(s.product_key) || 0
        const mappingCoverage = s.count > 0 ? round2((s.mappedCount / s.count) * 100) : 0
        const claimRate = mappingCoverage === 100 && outgoingUnits > 0 ? round2((s.count / outgoingUnits) * 100) : null
        return { ...s, value: round2(s.value), skuCount: s.skus.size, skus: [...s.skus], outgoingUnits, mappingCoverage, claimRate }
      })
      .sort((a, b) => b.count - a.count)

    return res.status(200).json({
      success: true,
      totalClaims: filtered.length,
      claimValue: round2(claimValue),
      totalValue: round2(claimValue),
      damageCount, incompleteCount, wrongItemCount, unspecifiedCount,
      mapping: { mapped: filtered.length - [...unmappedMap.values()].reduce((n, x) => n + x.count, 0), unmapped: [...unmappedMap.values()].reduce((n, x) => n + x.count, 0), unmappedProducts: [...unmappedMap.values()].sort((a, b) => b.count - a.count) },
      topClaimProducts,
      topClaimSkus: topClaimProducts, // backward compatibility สำหรับหน้าเว็บเวอร์ชันก่อนเปลี่ยนชื่อ contract
      claimByDate: [...dateMap.entries()].map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date)),
    })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
}
