// mapping ที่แก้ได้จากชีทตรงๆ ไม่ต้องแก้โค้ด/deploy ใหม่ทุกครั้งที่เจอปัญหา SKU ปนกัน/ย้ายโค้ด
// - sku_redirects: SKU เก่าที่ย้าย/เปลี่ยนโค้ดแล้ว แต่ raw_orders/สต็อกยังอ้างโค้ดเดิมอยู่ (เช่น
//   PY065→PY041, PY075→PY077 บอลเทาปุ่ม) — ใช้ทั้งฝั่งขาย (Dashboard/Products/Claims) และสต็อก (Inventory)
// - set_recipes: แถวที่จริงๆ เป็น Set/สินค้าปนโค้ดผิด (เช่น PY075 บางแถวจริงๆ ขายเก้าอี้ PY026)
//   ระบุด้วย (master_sku, variation_name) — Planner ใช้แตกเป็น SKU จริงข้างในเพื่อวางแผนสต็อก
//   แต่ฝั่งขาย (Dashboard/Products/Claims) ไม่แตก แค่ต้อง "ไม่" เอาแถวเหล่านี้ไป redirect ปนกับ
//   ยอด SKU ปลายทางที่ redirect ไป (เช่น อย่าเอา [Set คลายเส้น] ไปนับเป็นบอลเทาปุ่ม PY077)
import { getSheet, ensureSheet } from './sheets.js'

export const SET_RECIPES_SHEET = 'set_recipes'
export const SET_RECIPES_HEADERS = ['set_sku', 'variation_name', 'component_sku', 'qty_per_unit', 'keep_set_sales']
export const SKU_REDIRECTS_SHEET = 'sku_redirects'
export const SKU_REDIRECTS_HEADERS = ['old_sku', 'new_sku', 'note', 'created_at']

export async function getSkuRedirectMap() {
  await ensureSheet(SKU_REDIRECTS_SHEET, SKU_REDIRECTS_HEADERS)
  let rows = []
  try { rows = await getSheet(SKU_REDIRECTS_SHEET) } catch { return new Map() }
  const map = new Map()
  for (const r of rows) {
    const from = String(r.old_sku || '').trim().toUpperCase()
    const to = String(r.new_sku || '').trim().toUpperCase()
    if (from && to && from !== to) map.set(from, to)
  }
  return map
}

// เดินตาม chain เผื่อย้ายต่อกันหลายทอด กันวนลูปไม่รู้จบด้วย seen set
export function resolveRedirect(sku, redirectMap) {
  const start = String(sku || '').trim().toUpperCase()
  if (!start || !redirectMap || redirectMap.size === 0) return start
  let cur = start
  const seen = new Set()
  while (redirectMap.has(cur) && !seen.has(cur)) { seen.add(cur); cur = redirectMap.get(cur) }
  return cur
}

// key set ของ (set_sku|variation_name) ที่มีสูตรอยู่ใน set_recipes — ใช้เช็คว่าแถวนี้ "ปนโค้ด/เป็น Set" ไหม
export async function getSetRecipeKeySet() {
  let rows = []
  try { rows = await getSheet(SET_RECIPES_SHEET) } catch { return new Set() }
  const keys = new Set()
  for (const row of rows) {
    const setSku = String(row.set_sku || '').trim().toUpperCase()
    const variation = String(row.variation_name || '').trim()
    const componentSku = String(row.component_sku || '').trim()
    if (!setSku || !variation || !componentSku) continue
    keys.add(`${setSku}|${variation}`)
  }
  return keys
}

// สำหรับหน้าขาย (ไม่แตกเป็นหลายแถวแบบ Planner) — คืน masterSku ที่ควรใช้จัดกลุ่ม/แสดงผล:
// ถ้าแถวนี้ตรง set_recipes (เป็น Set/ปนโค้ด) ให้คงค่าเดิมไว้ ไม่ redirect (กันไปปนกับ SKU ปลายทาง)
// ถ้าไม่ตรง ค่อย redirect ตาม sku_redirects ตามปกติ
export function resolveSalesSku(masterSku, variationName, redirectMap, recipeKeySet) {
  const sku = String(masterSku || '').trim().toUpperCase()
  if (recipeKeySet && recipeKeySet.has(`${sku}|${String(variationName || '').trim()}`)) return sku
  return resolveRedirect(sku, redirectMap)
}
