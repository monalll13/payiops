// GET/POST /api/sheet-tools?op=inventory&view=items|movements
// สต็อกสินค้า — คงเหลือคำนวณสด (opening_balance + sum(stock_movements)) ไม่เก็บเลขนิ่งๆ
// เพื่อกันเพี้ยนแบบไฟล์ Excel เดิม (คงเหลือแยกชีตต้องพิมพ์เชื่อมมือทุกเดือน)
// นับสต็อกระดับ SKU จริง (master_sku) ไม่ใช่ product-family group — M/L/สี คือของคนละถังจริง
// ต้องแยกนับ ไม่รวมแบบ deriveGroup ที่ใช้กับหน้า Products/Claims (นั่นไว้แค่ดูภาพรวมยอดขาย)
import { getSheet, appendRows, overwriteSheet, ensureSheet } from './sheets.js'
import { isoDate } from './dates.js'

const ITEMS_SHEET = 'inventory_items'
const MOVEMENTS_SHEET = 'stock_movements'
// ต่อท้ายรายการเดิมเท่านั้น (ห้ามแทรกกลาง) — แถวเดิมใน Sheet อิงตำแหน่งคอลัมน์เดิมอยู่ เหมือน claims sheet
const ITEMS_HEADERS = ['sku', 'display_name', 'unit', 'safety_stock', 'opening_balance', 'opening_date', 'active', 'created_at', 'updated_at', 'reorder_date', 'expected_arrival']
const MOVEMENTS_HEADERS = ['id', 'date', 'sku', 'type', 'qty', 'note', 'created_by', 'created_at']
const MOVEMENT_TYPES = new Set(['in', 'out', 'adjust'])

let ensurePromise
const ensureInventorySheets = () => ensurePromise ||= Promise.all([
  ensureSheet(ITEMS_SHEET, ITEMS_HEADERS),
  ensureSheet(MOVEMENTS_SHEET, MOVEMENTS_HEADERS),
])

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const truthyActive = (v) => v === '' || v === undefined || v === null || String(v) === '1' || String(v).toLowerCase() === 'true'
const genId = () => `mv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
const todayBKK = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })

// สถานะ: หมด (คงเหลือ <= 0) / ใกล้หมด (คงเหลือ <= safety stock) / ปกติ
function statusOf(balance, safetyStock) {
  if (balance <= 0) return 'หมด'
  if (safetyStock > 0 && balance <= safetyStock) return 'ใกล้หมด'
  return 'ปกติ'
}

async function loadItemsWithBalance() {
  await ensureInventorySheets()
  const [items, movements] = await Promise.all([getSheet(ITEMS_SHEET), getSheet(MOVEMENTS_SHEET)])
  const bySku = new Map()
  for (const m of movements) {
    const sku = String(m.sku || '')
    if (!sku) continue
    bySku.set(sku, (bySku.get(sku) || 0) + num(m.qty))
  }
  const today = todayBKK()
  const transactionsToday = movements.filter((m) => isoDate(m.date) === today).length

  const activeItems = items.filter((it) => it.sku && truthyActive(it.active))
  const rows = activeItems.map((it) => {
    const balance = num(it.opening_balance) + (bySku.get(String(it.sku)) || 0)
    const safetyStock = num(it.safety_stock)
    return {
      sku: it.sku,
      display_name: it.display_name || it.sku,
      unit: it.unit || 'ชิ้น',
      safety_stock: safetyStock,
      balance,
      status: statusOf(balance, safetyStock),
      reorder_date: it.reorder_date || '',
      expected_arrival: it.expected_arrival || '',
    }
  })
  rows.sort((a, b) => a.display_name.localeCompare(b.display_name, 'th'))

  return {
    items: rows,
    totals: {
      totalProducts: rows.length,
      totalStock: rows.reduce((s, r) => s + r.balance, 0),
      lowStockCount: rows.filter((r) => r.status !== 'ปกติ').length,
      transactionsToday,
    },
  }
}

async function loadMovements({ type, q, from, to }) {
  await ensureInventorySheets()
  const [items, movements] = await Promise.all([getSheet(ITEMS_SHEET), getSheet(MOVEMENTS_SHEET)])
  const nameBySku = new Map(items.map((it) => [String(it.sku), it.display_name || it.sku]))
  const query = String(q || '').trim().toLowerCase()

  let rows = movements.map((m) => ({
    id: m.id,
    date: isoDate(m.date),
    sku: m.sku,
    display_name: nameBySku.get(String(m.sku)) || m.sku,
    type: m.type,
    qty: num(m.qty),
    note: m.note || '',
    created_by: m.created_by || '',
    created_at: m.created_at || '',
  }))

  if (type && type !== 'all') rows = rows.filter((r) => r.type === type)
  if (from) rows = rows.filter((r) => r.date >= from)
  if (to) rows = rows.filter((r) => r.date <= to)
  if (query) rows = rows.filter((r) =>
    r.display_name.toLowerCase().includes(query) ||
    String(r.sku).toLowerCase().includes(query) ||
    r.created_by.toLowerCase().includes(query) ||
    r.note.toLowerCase().includes(query)
  )

  rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
  return rows
}

async function upsertItem(body, actorName) {
  const sku = String(body.sku || '').trim()
  if (!sku) throw new Error('ต้องระบุ sku')
  await ensureInventorySheets()
  const items = await getSheet(ITEMS_SHEET)
  const now = new Date().toISOString()
  const idx = items.findIndex((it) => String(it.sku) === sku)

  if (idx === -1) {
    const row = {
      sku,
      display_name: body.display_name || sku,
      unit: body.unit || 'ชิ้น',
      safety_stock: num(body.safety_stock),
      opening_balance: num(body.opening_balance),
      opening_date: isoDate(body.opening_date) || todayBKK(),
      reorder_date: body.reorder_date ? isoDate(body.reorder_date) : '',
      expected_arrival: body.expected_arrival ? isoDate(body.expected_arrival) : '',
      active: '1',
      created_at: now,
      updated_at: now,
    }
    items.push(row)
  } else {
    const row = items[idx]
    if (body.display_name !== undefined) row.display_name = body.display_name
    if (body.unit !== undefined) row.unit = body.unit
    if (body.safety_stock !== undefined) row.safety_stock = num(body.safety_stock)
    if (body.opening_balance !== undefined) row.opening_balance = num(body.opening_balance)
    // วันสั่ง/เช็คของ + วันคาดว่าจะเข้า — เคลียร์ได้ (ส่ง '' มา) ตอนของเข้าแล้วไม่ต้องรอ/ติดตามต่อ
    if (body.reorder_date !== undefined) row.reorder_date = body.reorder_date ? isoDate(body.reorder_date) : ''
    if (body.expected_arrival !== undefined) row.expected_arrival = body.expected_arrival ? isoDate(body.expected_arrival) : ''
    if (body.active !== undefined) row.active = body.active ? '1' : '0'
    row.updated_at = now
  }
  await overwriteSheet(ITEMS_SHEET, ITEMS_HEADERS, items.map((it) => ITEMS_HEADERS.map((h) => it[h] ?? '')))
  return { sku }
}

async function addMovement(body, actorName) {
  const sku = String(body.sku || '').trim()
  const type = String(body.type || '').trim()
  const qtyInput = Number(body.qty)
  if (!sku) throw new Error('ต้องระบุสินค้า')
  if (!MOVEMENT_TYPES.has(type)) throw new Error('ประเภทรายการไม่ถูกต้อง')
  if (!Number.isFinite(qtyInput) || qtyInput === 0) throw new Error('ต้องระบุจำนวน')

  await ensureInventorySheets()
  const items = await getSheet(ITEMS_SHEET)
  if (!items.some((it) => String(it.sku) === sku)) throw new Error('ไม่พบสินค้านี้ในระบบ')

  // in/out รับจำนวนเป็นบวกจาก UI เสมอ แล้วกำหนดเครื่องหมายเองตามประเภท —
  // adjust (ปรับยอด) ผู้ใช้พิมพ์เลขติดลบ/บวกเองตรงๆ เพราะเป็นการแก้ยอดให้ตรงของจริง
  let qty = qtyInput
  if (type === 'in') qty = Math.abs(qtyInput)
  if (type === 'out') qty = -Math.abs(qtyInput)

  const now = new Date().toISOString()
  const row = {
    id: genId(),
    date: isoDate(body.date) || todayBKK(),
    sku,
    type,
    qty,
    note: body.note || '',
    created_by: actorName || '',
    created_at: now,
  }
  await appendRows(MOVEMENTS_SHEET, [MOVEMENTS_HEADERS.map((h) => row[h] ?? '')])
  return row
}

export default async function opInventory(req, res) {
  try {
    const actorName = req.user?.display_name || req.user?.username || ''

    if (req.method === 'GET') {
      const view = String(req.query.view || 'items')
      if (view === 'movements') {
        const rows = await loadMovements({
          type: req.query.type,
          q: req.query.q,
          from: req.query.from,
          to: req.query.to,
        })
        return res.status(200).json({ success: true, movements: rows })
      }
      const data = await loadItemsWithBalance()
      return res.status(200).json({ success: true, ...data })
    }

    if (req.method === 'POST') {
      const action = String(req.body?.action || '')
      if (action === 'upsert-item') {
        const result = await upsertItem(req.body, actorName)
        return res.status(200).json({ success: true, ...result })
      }
      if (action === 'add-movement') {
        const result = await addMovement(req.body, actorName)
        return res.status(200).json({ success: true, movement: result })
      }
      return res.status(400).json({ success: false, error: 'action ไม่ถูกต้อง' })
    }

    return res.status(405).json({ success: false, error: 'method not allowed' })
  } catch (e) {
    return res.status(400).json({ success: false, error: e.message })
  }
}
