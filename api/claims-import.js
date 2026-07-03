// POST /api/claims-import  body: { fileName, rows: [ {..excel row..} ] }
// map แถวจาก Excel เข้า sheet "claims" + จับคู่ master_sku ผ่าน product_aliases
import { getSheet, appendRows } from './_lib/sheets.js'

const normalize = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
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
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' })
  const { fileName = '', rows } = req.body || {}
  if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ success: false, error: 'ไม่พบข้อมูลในไฟล์' })

  try {
    // สร้าง lookup จาก product_aliases: ชื่อสินค้า -> { master_sku, display_name }
    let aliasByName = new Map()
    try {
      const aliases = await getSheet('product_aliases')
      for (const a of aliases) {
        const master = a.master_sku, disp = a.display_name
        for (const nameField of [a.alias_product_name, a.display_name]) {
          const key = normalize(nameField)
          if (key && !aliasByName.has(key)) aliasByName.set(key, { master_sku: master, display_name: disp })
        }
      }
    } catch { /* ไม่มี tab product_aliases ก็ข้าม */ }

    const importId = genImportId()
    const importedAt = new Date().toISOString()
    const headers = ['date', 'business', 'product_name', 'free_item', 'claim_value', 'is_damaged', 'is_incomplete', 'is_wrong_item', 'note', 'master_sku', 'display_name', 'imported_at', 'import_id', 'source_file']

    let mapped = 0
    const out = rows.map((row) => {
      const productName = pick(row, ['product_name', 'ชื่อสินค้า', 'สินค้า', 'product'])
      const alias = aliasByName.get(normalize(productName))
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
