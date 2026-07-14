const normalize = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
const key = (name, variation) => `${normalize(name)}|${normalize(variation)}`
const compact = (s) => normalize(s)
  .replace(/^\[[^\]]+\]\s*/, '')
  .replace(/ซัพพอร์ตเท้า|ซัพพอร์ต|รุ่น/g, '')
  .replace(/ส้นเท้า/g, 'ส้น')
  .replace(/ฝ่าเท้า/g, 'ฝ่า')
  .replace(/นิ้วโป้งเท้า/g, 'นิ้วโป้ง')
  .replace(/รองส้น/g, 'ส้น')
  .replace(/[^a-z0-9ก-๙]/gi, '')

function similarity(a, b) {
  a = compact(a); b = compact(b)
  if (!a || !b) return 0
  if (a === b) return 1
  if (a.includes(b) || b.includes(a)) {
    const shorter = Math.min(a.length, b.length)
    return shorter >= 6 ? 0.94 : shorter / Math.max(a.length, b.length)
  }
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diagonal = prev[0]; prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const old = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1))
      diagonal = old
    }
  }
  return 1 - prev[b.length] / Math.max(a.length, b.length)
}

export function buildClaimAliasLookup(rows = []) {
  const byKey = new Map(), bySku = new Map(), candidates = new Map()
  const add = (name, alias) => {
    const k = normalize(name); if (!k) return
    if (!candidates.has(k)) candidates.set(k, [])
    candidates.get(k).push(alias)
  }
  for (const row of rows) {
    const alias = { master_sku: row.master_sku || '', display_name: row.display_name || row.alias_product_name || '' }
    for (const sku of [row.master_sku, row.sku_platform, row.alias_sku, row.sku]) {
      const normalizedSku = normalize(sku)
      if (normalizedSku) bySku.set(normalizedSku, alias)
    }
    if (row.alias_product_name && row.alias_variation) byKey.set(key(row.alias_product_name, row.alias_variation), alias)
    add(row.alias_product_name, alias); add(row.display_name, alias)
  }
  const byName = new Map()
  for (const [k, list] of candidates) {
    const skus = new Set(list.map((x) => x.master_sku).filter(Boolean))
    if (skus.size === 1) byName.set(k, list[0])
  }
  const fuzzy = [...byName.entries()].map(([name, alias]) => ({ name, alias }))
  return { byKey, bySku, byName, fuzzy }
}

export function resolveClaimAlias(lookup, name, variation = '', sourceSku = '') {
  const skuMatch = sourceSku ? lookup.bySku.get(normalize(sourceSku)) : null
  if (skuMatch) return { ...skuMatch, match_method: 'sku', match_score: 1 }
  const exact = lookup.byKey.get(key(name, variation)) || lookup.byName.get(normalize(name))
  if (exact) return { ...exact, match_method: 'exact', match_score: 1 }
  const target = compact(name)
  if (target.length >= 5) {
    const contained = (lookup.fuzzy || []).filter((x) => {
      const candidate = compact(x.name)
      return candidate.includes(target) || target.includes(candidate)
    })
    const unique = new Map(contained.map((x) => [x.alias.master_sku || x.alias.display_name, x.alias]))
    if (unique.size === 1) return { ...unique.values().next().value, match_method: 'contained', match_score: 0.95 }
  }
  // alias หลายชื่ออาจชี้ SKU เดียวกัน ต้องรวมเป็นผู้สมัครตัวเดียวก่อนเทียบ margin
  const bestBySku = new Map()
  for (const x of (lookup.fuzzy || [])) {
    const score = similarity(name, x.name)
    const candidateKey = x.alias.master_sku || x.alias.display_name
    const old = bestBySku.get(candidateKey)
    if (!old || score > old.score) bestBySku.set(candidateKey, { ...x, score })
  }
  const ranked = [...bestBySku.values()].sort((a, b) => b.score - a.score)
  const best = ranked[0], second = ranked[1]
  // รับเฉพาะชื่อที่ใกล้มาก และต้องชนะอันดับสองชัดเจน ป้องกันรุ่น/ไซซ์ใกล้กันถูกจับผิด
  if (!best || best.score < 0.88 || (second && best.score - second.score < 0.06)) return null
  return { ...best.alias, match_method: 'fuzzy', match_score: Math.round(best.score * 100) / 100 }
}
