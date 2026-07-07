// /api/import-orders
//   GET  ?view=log            → ประวัติการนำเข้าจาก import_log
//   POST { fileName, platform, business, rows } → นำเข้าออเดอร์เข้า raw_orders_YYYY_MM
import { requireAuth } from './_lib/auth.js'
import { getSheet, appendRows, batchGetValues } from './_lib/sheets.js'

const normalize = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
const num = (v) => parseFloat(String(v ?? '').replace(/,/g, '')) || 0

const RAW_HEADERS = ['order_key', 'order_id', 'order_item_id', 'date', 'platform', 'business', 'sku_platform', 'product_name', 'variation_name', 'master_sku', 'display_name', 'qty', 'revenue', 'order_status', 'imported_at', 'source_file', 'import_id', 'alias_key']

function pick(row, keys) {
  for (const k of Object.keys(row)) {
    const nk = normalize(k)
    if (keys.some((c) => nk === normalize(c) || nk.includes(normalize(c)))) return row[k]
  }
  return ''
}

function detectPlatform(row, fallback) {
  if (fallback && fallback !== 'auto') return fallback
  const blob = normalize(Object.keys(row).join(' ') + ' ' + Object.values(row).join(' '))
  if (blob.includes('tiktok')) return 'TikTok Shop'
  if (blob.includes('lazada')) return 'Lazada'
  if (blob.includes('shopee')) return 'Shopee'
  return 'Shopee'
}

function isoDate(v) {
  let s = String(v ?? '').trim()
  if (!s) return ''
  if (s.includes('T')) return s.slice(0, 10)
  // dd/mm/yyyy หรือ yyyy-mm-dd
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (slash) return `${slash[3]}-${slash[2].padStart(2, '0')}-${slash[1].padStart(2, '0')}`
  const dash = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (dash) return `${dash[1]}-${dash[2].padStart(2, '0')}-${dash[3].padStart(2, '0')}`
  const d = new Date(s)
  return isNaN(d) ? '' : d.toISOString().slice(0, 10)
}

function genImportId() {
  const d = new Date(), p = (n) => String(n).padStart(2, '0')
  return `IMP${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`
}

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  try {
    if (req.method === 'GET' && (req.query.view || 'log') === 'log') {
      let imports = []
      try {
        const log = await getSheet('import_log')
        imports = log.filter((r) => r.status === 'active' || !r.status).slice(-15).reverse().map((r) => ({
          file: r.filename, business: r.business, platform: r.platform, rows: Number(r.rows_imported) || 0, at: r.uploaded_at,
        }))
      } catch { /* no import_log tab */ }
      return res.status(200).json({ success: true, imports })
    }

    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' })
    const { fileName = 'upload.xlsx', platform: platformSel = 'auto', business: bizSel = '', rows } = req.body || {}
    if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ success: false, error: 'ไม่พบข้อมูลในไฟล์' })

    // ---- alias lookup ----
    const aliasByKey = new Map(), aliasByName = new Map()
    try {
      const aliases = await getSheet('product_aliases')
      for (const a of aliases) {
        if (a.alias_key) aliasByKey.set(normalize(a.alias_key), { master_sku: a.master_sku, display_name: a.display_name })
        const nm = normalize(a.alias_product_name || a.display_name)
        if (nm && !aliasByName.has(nm)) aliasByName.set(nm, { master_sku: a.master_sku, display_name: a.display_name })
      }
    } catch { /* ignore */ }

    const importId = genImportId()
    const importedAt = new Date().toISOString()

    // ---- map แต่ละแถว → raw schema, จัดกลุ่มตามเดือน ----
    const byMonth = new Map() // 'raw_orders_YYYY_MM' -> [rowArray]
    const seenInFile = new Set()
    let mapped = 0, skippedInvalid = 0

    for (const row of rows) {
      const platform = detectPlatform(row, platformSel)
      const orderId = String(pick(row, ['order_id', 'order id', 'เลขที่คำสั่งซื้อ', 'order sn', 'orderid']) || '')
      const orderItemId = String(pick(row, ['order_item_id', 'order item id', 'item id']) || '')
      const date = isoDate(pick(row, ['date', 'วันที่', 'order creation', 'created time', 'เวลาการชำระ', 'วันเวลาที่ทำการสั่งซื้อ']))
      if (!orderId || !date) { skippedInvalid++; continue }
      const business = pick(row, ['business', 'ธุรกิจ', 'แบรนด์', 'brand']) || bizSel
      const skuPlatform = pick(row, ['sku_platform', 'seller sku', 'sku reference', 'sku'])
      const productName = pick(row, ['product_name', 'ชื่อสินค้า', 'product name', 'สินค้า'])
      const variation = pick(row, ['variation_name', 'variation', 'ตัวเลือกสินค้า', 'ประเภทสินค้า'])
      const qty = parseInt(pick(row, ['qty', 'quantity', 'จำนวน', 'amount']), 10) || 0
      const revenue = num(pick(row, ['revenue', 'ยอดขาย', 'total', 'ราคาขายสุทธิ', 'grand total', 'ยอดรวม']))
      const status = pick(row, ['order_status', 'status', 'สถานะ', 'order status']) || ''

      const orderKey = `${platform}:${orderId}:${orderItemId}`
      if (seenInFile.has(orderKey)) continue
      seenInFile.add(orderKey)

      const aliasKey = `${normalize(productName)}|${normalize(variation)}`
      const alias = aliasByKey.get(aliasKey) || aliasByName.get(normalize(productName))
      if (alias) mapped++

      const tab = `raw_orders_${date.slice(0, 4)}_${date.slice(5, 7)}`
      if (!byMonth.has(tab)) byMonth.set(tab, [])
      byMonth.get(tab).push({
        orderKey,
        arr: [orderKey, orderId, orderItemId, date, platform, business, skuPlatform, productName, variation, alias?.master_sku || '', alias?.display_name || productName, qty, revenue, status, importedAt, fileName, importId, aliasKey],
      })
    }

    // ---- กันซ้ำกับข้อมูลเดิม (อ่าน order_key คอลัมน์ A ของ tab ที่เกี่ยวข้อง) ----
    const tabs = [...byMonth.keys()]
    let skippedDup = 0, imported = 0
    if (tabs.length) {
      let existing = []
      try { existing = await batchGetValues(tabs.map((t) => `${t}!A:A`)) } catch { existing = [] }
      for (let i = 0; i < tabs.length; i++) {
        const tab = tabs[i]
        const existSet = new Set((existing[i]?.values || []).flat())
        const fresh = byMonth.get(tab).filter((r) => { if (existSet.has(r.orderKey)) { skippedDup++; return false } return true })
        if (fresh.length) {
          await appendRows(tab, fresh.map((r) => r.arr))
          imported += fresh.length
        }
      }
    }

    // ---- บันทึก import_log ----
    try {
      await appendRows('import_log', [[importId, fileName, bizSel || (byMonth.size ? '' : ''), platformSel === 'auto' ? '' : platformSel, imported, mapped, imported - mapped, importedAt, tabs.join(','), 'active']])
    } catch { /* ignore */ }

    res.status(200).json({ success: true, importId, imported, mapped, skipped: skippedDup + skippedInvalid, tabs })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
}
