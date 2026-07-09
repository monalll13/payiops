// POST /api/claims-import  body: { fileName, rows: [ {..excel row..} ] }
// map แถวจาก Excel เข้า sheet "claims" + จับคู่ master_sku ผ่าน product_aliases
import { requireAuth } from './_lib/auth.js'
import { getSheet, appendRows } from './_lib/sheets.js'

const normalize = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
const aliasKey = (name, variation) => `${normalize(name)}|${normalize(variation)}`
const truthy = (v) => {
  const s = String(v ?? '').trim().toLowerCase()
  return s === '1' || s === 'true' || s === 'yes' || s === 'x' || s === '✓' || s === 'y'
}

// ดึงค่าจาก object โดยลองหลายชื่อคอลัมน์ (รองรับหัวตารางไทย/อังกฤษ)
function pick(row, keys) {
  for (const k of Object.keys(row)) {
    const nk = normalize(k)
    if (keys.some((cand) => nk === normalize(cand) || nk.includes(normalize(cand)))) return row[k]
  }
  return ''
}

function genImportId() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase()
  return `IMP${stamp}-${rand}`
}

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' })
  const { fileName = '', rows } = req.body || {}
  if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ success: false, error: 'ไม่พบข้อมูลในไฟล์' })

  try {
    // สร้าง lookup จาก product_aliases:
    // - ชื่อสินค้า + variation -> SKU ใช้เป็นหลัก เพราะชื่อยาวซ้ำข้ามไซซ์/สีได้
    // - ชื่อสินค้าอย่างเดียว -> ใช้เฉพาะกรณีไม่กำกวม
    let aliasByKey = new Map()
    let aliasByName = new Map()
    try {
      const aliases = await getSheet('product_aliases')
      const candidates = new Map()
      const addCandidate = (name, alias) => {
        const key = normalize(name)
        if (!key) return
        if (!candidates.has(key)) candidates.set(key, [])
        candidates.get(key).push(alias)
      }
      for (const a of aliases) {
        const master = a.master_sku, disp = a.display_name
        const alias = { master_sku: master, display_name: disp }
        if (a.alias_product_name && a.alias_variation) aliasByKey.set(aliasKey(a.alias_product_name, a.alias_variation), alias)
        addCandidate(a.alias_product_name, alias)
        addCandidate(a.display_name, alias)
      }
      for (const [key, list] of candidates) {
        const skus = [...new Set(list.map((x) => String(x.master_sku || '').trim()).filter(Boolean))]
        if (skus.length === 1) aliasByName.set(key, list[0])
      }
    } catch { /* ไม่มี tab product_aliases ก็ข้าม */ }

    const importId = genImportId()
    const importedAt = new Date().toISOString()
    const headers = ['date', 'business', 'product_name', 'free_item', 'claim_value', 'is_damaged', 'is_incomplete', 'is_wrong_item', 'note', 'master_sku', 'display_name', 'imported_at', 'import_id', 'source_file']

    let mapped = 0
    const out = rows.map((row) => {
      const productName = pick(row, ['product_name', 'ชื่อสินค้า', 'สินค้า', 'product'])
      const variation = pick(row, ['alias_variation', 'variation_name', 'variation', 'ตัวเลือกสินค้า', 'ประเภทสินค้า', 'แบบ', 'ไซซ์', 'ขนาด', 'สี'])
      const alias = aliasByKey.get(aliasKey(productName, variation)) || aliasByName.get(normalize(productName))
      if (alias) mapped++
      const dateRaw = pick(row, ['date', 'วันที่'])
      let date = String(dateRaw)
      if (date.includes('T')) date = date.slice(0, 10)
      return [
        date,
        pick(row, ['business', 'ธุรกิจ', 'แบรนด์', 'brand']),
        productName,
        pick(row, ['free_item', 'ของแถม', 'สินค้าที่แถม']),
        num(pick(row, ['claim_value', 'มูลค่า', 'มูลค่าเคลม', 'value'])),
        truthy(pick(row, ['is_damaged', 'เสียหาย', 'พัง', 'damaged'])) ? '1' : '',
        truthy(pick(row, ['is_incomplete', 'ส่งไม่ครบ', 'ไม่ครบ', 'incomplete'])) ? '1' : '',
        truthy(pick(row, ['is_wrong_item', 'ส่งผิด', 'ผิด', 'wrong'])) ? '1' : '',
        pick(row, ['note', 'หมายเหตุ', 'remark']),
        alias?.master_sku || '',
        alias?.display_name || productName,
        importedAt,
        importId,
        fileName,
      ]
    })

    await appendRows('claims', out)
    res.status(200).json({ success: true, importId, rowsImported: out.length, mappedCount: mapped, unmappedCount: out.length - mapped })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
}

function num(v) { return parseFloat(String(v ?? '').replace(/,/g, '')) || 0 }
