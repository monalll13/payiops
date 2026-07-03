// รวม SKU ที่เป็นสินค้าตัวเดียวกันแต่คนละไซส์/รุ่นย่อย เข้าเป็น "กลุ่มสินค้า" (product family)
// เช่น PY006 "ถุงเท้าเจล 2in1 M" + PY007 "ถุงเท้าเจล 2in1 L" → กลุ่มเดียว "ถุงเท้าเจล 2in1"
//
// สร้างที่เดียว ใช้ทั้งหน้า Dashboard สินค้า (api/products.js) และมุมมองเคลมรายสินค้า
// (api/claims.js?view=by-product) — ตาม TODO#2 ใน CLAUDE.md
//
// ลำดับการตัดสินใจ:
//   1) ถ้ามี override จาก product_aliases (คอลัมน์ product_group) → ใช้ค่านั้นเป็นชื่อกลุ่ม
//   2) ไม่งั้น strip token ที่เป็นไซส์/รุ่นย่อยออกจาก display_name → เหลือชื่อกลุ่ม

// token ที่เป็น "ไซส์ล้วน" — ตัดทิ้งเมื่อยืนเดี่ยว (คั่นด้วยช่องว่าง/ขีด/สแลช ฯลฯ)
const SIZE_TOKENS = new Set([
  'xs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl',
  '2xl', '3xl', '4xl', 'freesize', 'onesize',
])

// token ที่เป็น "สีล้วน" — ตัดเมื่อยืนเดี่ยว เช่น "แผ่นรองเท้า M ดำ" / "... M ฟ้า" = สินค้าเดียวกัน
// (ตัดเฉพาะสีที่แยกด้วยช่องว่าง — ถ้าสีติดกับคำ เช่น "สลิปเปอร์ฟ้า" จะไม่ถูกตัด ให้ใช้ product_group override)
const COLOR_TOKENS = new Set([
  'ดำ', 'ขาว', 'แดง', 'ฟ้า', 'เขียว', 'เหลือง', 'ชมพู', 'ม่วง', 'ส้ม', 'เทา',
  'น้ำเงิน', 'น้ำตาล', 'ครีม', 'เบจ', 'ทอง', 'เงิน', 'คละสี', 'คละ',
  'black', 'white', 'red', 'blue', 'green', 'yellow', 'pink', 'purple',
  'orange', 'gray', 'grey', 'brown', 'navy', 'beige', 'gold', 'silver',
])

// รูปแบบ "ไซส์/size/เบอร์/ขนาด X" ที่ตัดทั้งวลี
const SIZE_PHRASE = /(?:ไซส์|ไซซ์|size|เบอร์|ขนาด|no\.?)\s*[:：]?\s*[\wก-๙]+/gi

// วงเล็บ/ก้อน variation ท้ายชื่อ เช่น "... (M)", "...(คละสี)", "…[L]"
const TRAILING_PAREN = /[([（【][^)\]）】]*[)\]）】]\s*$/

// แปลง display_name → ชื่อกลุ่มสินค้า (ตัดไซส์/รุ่นย่อยออก)
export function normalizeGroupLabel(name = '') {
  const raw = String(name).trim()
  if (!raw) return ''

  // 1) ตัดก้อนในวงเล็บท้ายชื่อ (มักเป็นสี/ไซส์)
  let s = raw.replace(TRAILING_PAREN, ' ')
  // 2) ตัดวลี "ไซส์/เบอร์/ขนาด X"
  s = s.replace(SIZE_PHRASE, ' ')
  // 3) แยก token ตามตัวคั่น แล้วทิ้ง token ที่เป็นไซส์/สีล้วน
  const kept = s
    .split(/[\s\-_/|·•]+/)
    .filter(Boolean)
    .filter((t) => {
      const lc = t.toLowerCase()
      return !SIZE_TOKENS.has(lc) && !COLOR_TOKENS.has(lc)
    })

  const out = kept.join(' ').replace(/\s{2,}/g, ' ').trim()
  // ถ้าตัดจนเหลือว่าง (ชื่อเป็นไซส์ล้วน) ให้คงชื่อเดิมไว้ ไม่งั้นข้อมูลหาย
  return out || raw
}

// คีย์สำหรับจับกลุ่ม (ไม่สนตัวพิมพ์/ช่องว่างซ้ำ)
export function groupKey(label = '') {
  return String(label).toLowerCase().replace(/\s+/g, ' ').trim()
}

// สร้าง map: master_sku → product_group (จากคอลัมน์ product_group ใน product_aliases ถ้ามี)
export function buildOverrideMap(aliasRows = []) {
  const map = new Map()
  for (const r of aliasRows) {
    const sku = String(r.master_sku || '').trim()
    const grp = String(r.product_group || '').trim()
    if (sku && grp) map.set(sku, grp)
  }
  return map
}

// หากลุ่มของ 1 แถว: คืน { key, label }
// overrideMap = ผลจาก buildOverrideMap (optional)
export function deriveGroup(displayName, masterSku, overrideMap) {
  const sku = masterSku != null ? String(masterSku).trim() : ''
  const ov = overrideMap && sku ? overrideMap.get(sku) : null
  const label = ov || normalizeGroupLabel(displayName || sku || '(ไม่ระบุ)')
  return { key: groupKey(label) || '(ไม่ระบุ)', label: label || '(ไม่ระบุ)' }
}
