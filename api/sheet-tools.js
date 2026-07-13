// GET/POST /api/sheet-tools?op=summary|sheet|append|overwrite
// รวม 4 endpoint เครื่องมือชีตเดิม (/api/summary /api/sheet /api/append /api/overwrite)
// เป็นฟังก์ชันเดียว — Vercel Hobby จำกัด 12 serverless functions ต่อโปรเจค
import { requireAuth, cacheable, authEnabled } from './_lib/auth.js'
import { getMeta, batchGetValues, getSheet, appendRows, overwriteSheet, ensureSheet, downloadDriveFile } from './_lib/sheets.js'
import { createRequire } from 'node:module'
// import * as XLSX from 'xlsx' พังตอน deploy จริงบน Vercel (esbuild bundle แพ็กเกจ CJS นี้แล้ว namespace ไม่ตรง
// ทำให้ทั้งไฟล์ crash ตั้งแต่โหลดโมดูล ก่อนจะถึง handler ด้วยซ้ำ) — ใช้ createRequire บังคับ require แบบ CJS ตรงๆ แทน
const XLSX = createRequire(import.meta.url)('xlsx')

const OT_HEADERS = ['id', 'date', 'employee', 'team', 'task', 'planned_start', 'planned_end', 'planned_minutes', 'actual_start', 'actual_end', 'actual_minutes', 'status', 'reason', 'note', 'created_at', 'closed_at']
const MANPOWER_HEADERS = ['id', 'date', 'employee', 'team', 'task', 'start_time', 'end_time', 'note', 'created_at']
const EVENT_HEADERS = ['id', 'title', 'date', 'team', 'note', 'created_at', 'end_date']
const OT_HISTORY_HEADERS = ['id', 'plan_id', 'date', 'employee', 'before_start', 'before_end', 'after_start', 'after_end', 'before_note', 'after_note', 'changed_at', 'changed_by']
const OT_APPROVAL_HEADERS = ['id', 'month', 'employee', 'actual_minutes', 'approved_at', 'approved_by']
const PEOPLE_HEADERS = ['code', 'name', 'group']
const OT_LIMIT_HEADERS = ['employee', 'limit_hours', 'updated_at', 'updated_by']
const OT_APPROVAL_HISTORY_HEADERS = ['id', 'month', 'employee', 'before_minutes', 'after_minutes', 'changed_at', 'changed_by']
const WORKFORCE_SHEETS = [['workforce_ot', OT_HEADERS], ['workforce_manpower', MANPOWER_HEADERS], ['workforce_events', EVENT_HEADERS], ['workforce_ot_history', OT_HISTORY_HEADERS], ['workforce_ot_approvals', OT_APPROVAL_HEADERS], ['workforce_people', PEOPLE_HEADERS], ['workforce_ot_limits', OT_LIMIT_HEADERS], ['workforce_ot_approval_history', OT_APPROVAL_HISTORY_HEADERS]]
let workforceEnsurePromise
let workforceCache = { at: 0, data: null }
const ensureWorkforceSheets = () => workforceEnsurePromise ||= Promise.all(WORKFORCE_SHEETS.map(([name, headers]) => ensureSheet(name, headers)))
// กลุ่มพื้นเหลืองในไฟล์ต้นฉบับ (TOON/KED/MO) เป็นอีกหน่วยงาน (ออฟฟิศ) ไม่ใช่บ้านล่าง — ไม่ต้องเพิ่มแถวใน workforce_people ให้กลุ่มนั้น จึงไม่ถูกดึงเข้าปฏิทินนี้
// รายชื่อบ้านล่างตอนเริ่มระบบ ใช้ seed แท็บ workforce_people ครั้งแรกเท่านั้น — หลังจากนี้แก้/เพิ่มคนได้ตรงในชีตเลย ไม่ต้องแก้โค้ด
const DEFAULT_PEOPLE_ROWS = [['TANG', 'แตง', 'คนแพ็ก'], ['PANG', 'แป้ง', 'คนแพ็ก'], ['FAH', 'ฟ้า', 'คนแพ็ก'], ['MII', 'มี่', 'คนแพ็ก'], ['PANID', 'ป้านิด', 'พาร์ทไทม์'], ['MAPRANG', 'มะปราง', 'พาร์ทไทม์'], ['ATOM', 'อะตอม', 'อื่น ๆ'], ['BAS', 'บาส', 'อื่น ๆ'], ['NEOY', 'เนย', 'อื่น ๆ']]
const MONTH_BY_TAB = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' }
const rowsToObjects = (values = []) => { const [headers, ...rows] = values; return headers ? rows.map((row) => Object.fromEntries(headers.map((h, i) => [h, row[i] ?? '']))) : [] }
// workforce_ot_approvals/workforce_ot_limits เป็น append-only log (ไม่ overwrite แถวเดิม) — กัน race condition ตอนแก้พร้อมกันหลายเครื่อง
// อ่านตอน GET ต้องลดเหลือ "ล่าสุดต่อ key" เอง
const latestByKey = (rows, keyFn, timeField) => { const map = new Map(); for (const r of rows) { const k = keyFn(r); const prev = map.get(k); if (!prev || String(r[timeField]) >= String(prev[timeField])) map.set(k, r) } return [...map.values()] }
const requireAdmin = (req, res) => { if (authEnabled() && req.user?.role !== 'admin') { res.status(403).json({ error: 'ต้องเป็น admin เท่านั้น' }); return false } return true }
const clearWorkforceCache = () => { workforceCache = { at: 0, data: null } }

async function getPersonMap() {
  const people = await getSheet('workforce_people')
  if (!people.length) { await appendRows('workforce_people', DEFAULT_PEOPLE_ROWS); return getPersonMap() }
  const map = {}
  for (const p of people) { if (p.code) map[String(p.code).toUpperCase()] = [p.name, p.group || 'อื่น ๆ'] }
  return map
}

export function parseManpowerWorkbook(buffer, personMap = {}) {
  const wb = XLSX.read(buffer, { type: 'buffer' }); const result = []; const warnings = []
  for (const sheetName of wb.SheetNames) {
    const tab = sheetName.slice(0, 3).toUpperCase(); const month = MONTH_BY_TAB[tab]; if (!month) continue
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: false, defval: '' })
    const yearMatch = sheetName.match(/(\d{2,4})/); const year = yearMatch ? (yearMatch[1].length === 2 ? `20${yearMatch[1]}` : yearMatch[1]) : '2026'
    const dateRows = []
    for (let r = 0; r < rows.length; r++) {
      const days = Array.from({ length: 7 }, (_, c) => { const m = String(rows[r]?.[c] || '').trim().match(/(?:^|\s)(\d{1,2})$/); const d = m ? Number(m[1]) : 0; return d >= 1 && d <= 31 ? d : 0 })
      if (days.filter(Boolean).length >= 2) dateRows.push({ r, days })
    }
    if (!dateRows.length) { warnings.push(`อ่านชีต "${sheetName}" ไม่ได้ — หารูปแบบวันที่ในตารางไม่เจอ (รูปแบบไฟล์อาจเปลี่ยน)`); continue }
    for (let i = 0; i < dateRows.length; i++) {
      const { r, days } = dateRows[i]; const end = dateRows[i + 1]?.r ?? rows.length
      for (let c = 0; c < 7; c++) {
        if (!days[c]) continue
        const date = `${year}-${month}-${String(days[c]).padStart(2, '0')}`
        for (let rr = r + 1; rr < end; rr++) {
          const raw = String(rows[rr]?.[c] || '').trim(); if (!raw || raw === '**') continue
          const code = raw.toUpperCase().match(/^[A-Z]+/)?.[0]; const person = personMap[code]; if (!person) continue
          const upper = raw.toUpperCase(); const absent = /\b(OFF|VAC|SICK|ABSENT|LWP)\b/.test(upper); if (absent) continue
          result.push({ id: `source-${date}-${code}-${rr}`, date, employee: person[0], group: person[1], fraction: /0[.,]5|O[.,]5/.test(upper) ? 0.5 : 1, raw, source: 'SKJ2026' })
        }
      }
    }
  }
  result.warnings = warnings
  return result
}

const minutesBetween = (start, end) => {
  if (!start || !end) return 0
  const [sh, sm] = start.split(':').map(Number); const [eh, em] = end.split(':').map(Number)
  let n = (eh * 60 + em) - (sh * 60 + sm)
  if (n < 0) n += 1440
  return Math.max(0, n)
}
const validTime = (v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || ''))
const clockMinutes = (v) => { const [h, m] = String(v).split(':').map(Number); return h * 60 + m }
const overlaps = (aStart, aEnd, bStart, bEnd) => clockMinutes(aStart) < clockMinutes(bEnd) && clockMinutes(bStart) < clockMinutes(aEnd)
const manpowerNameMatches = (planned, scheduled) => planned === scheduled || (planned === 'ป้า' && String(scheduled).startsWith('ป้า'))

async function opWorkforce(req, res) {
  try {
    return await opWorkforceInner(req, res)
  } catch (e) {
    console.error('opWorkforce:', e)
    return res.status(500).json({ error: e.message })
  }
}

async function opWorkforceInner(req, res) {
  const actorName = () => req.user?.name || null
  if (req.method === 'GET' && String(req.query.sourceOnly || '') === '1') {
    try {
      await ensureWorkforceSheets()
      const personMap = await getPersonMap()
      const sourceManpower = process.env.MANPOWER_FILE_ID ? parseManpowerWorkbook(await downloadDriveFile(process.env.MANPOWER_FILE_ID), personMap) : []
      return res.status(200).json({ success: true, sourceManpower, sourceWarnings: sourceManpower.warnings || [], sourceUpdatedAt: new Date().toISOString() })
    } catch (e) { return res.status(500).json({ success: false, error: e.message }) }
  }
  await ensureWorkforceSheets()
  if (req.method === 'GET') {
    if (workforceCache.data && Date.now() - workforceCache.at < 20000) return res.status(200).json(workforceCache.data)
    const ranges = WORKFORCE_SHEETS.map(([name]) => `${name}!A:Z`)
    const values = await batchGetValues(ranges)
    const [rows, manpower, events, history, rawApprovals, people, rawLimits, approvalHistory] = values.map((range) => rowsToObjects(range.values || []))
    const approvals = latestByKey(rawApprovals, (r) => `${r.month}|${r.employee}`, 'approved_at')
    const limits = latestByKey(rawLimits, (r) => r.employee, 'updated_at')
    const personMap = {}; for (const p of people) { if (p.code) personMap[String(p.code).toUpperCase()] = [p.name, p.group || 'อื่น ๆ'] }
    const otLimits = Object.fromEntries(limits.filter((l) => l.employee).map((l) => [l.employee, l.limit_hours]))
    let sourceManpower = []; let sourceWarnings = []
    try { if (process.env.MANPOWER_FILE_ID) { sourceManpower = parseManpowerWorkbook(await downloadDriveFile(process.env.MANPOWER_FILE_ID), personMap); sourceWarnings = sourceManpower.warnings || [] } } catch (e) { console.error('manpower source:', e.message) }
    res.setHeader('Cache-Control', cacheable('public, s-maxage=20, stale-while-revalidate=60'))
    const data = { success: true, rows: rows.sort((a, b) => String(b.date).localeCompare(String(a.date))), manpower, sourceManpower, sourceWarnings, events, history, approvals, approvalHistory, otLimits, people, sourceUpdatedAt: new Date().toISOString() }
    workforceCache = { at: Date.now(), data }
    return res.status(200).json(data)
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const body = req.body || {}
  const action = String(body.action || '').trim().toLowerCase()
  if (action === 'create-plan') {
    const employees = Array.isArray(body.employees) ? body.employees.filter(Boolean) : []
    if (!body.date || !employees.length || !body.planned_start || !body.planned_end) return res.status(400).json({ error: 'กรุณาระบุวันที่ รายชื่อ และเวลา OT' })
    if (!validTime(body.planned_start) || !validTime(body.planned_end) || clockMinutes(body.planned_end) <= clockMinutes(body.planned_start)) return res.status(400).json({ error: 'เวลาจบต้องมากกว่าเวลาเริ่มและอยู่ในวันเดียวกัน' })
    if (process.env.MANPOWER_FILE_ID) {
      try {
        const personMap = await getPersonMap()
        const dayManpower = parseManpowerWorkbook(await downloadDriveFile(process.env.MANPOWER_FILE_ID), personMap).filter((r) => r.date === body.date)
        if (dayManpower.length) {
          const absent = employees.filter((employee) => !dayManpower.some((r) => manpowerNameMatches(employee, r.employee)))
          if (absent.length) return res.status(400).json({ error: `ไม่มีรายชื่อใน Manpower วันที่เลือก: ${absent.join(', ')}` })
        }
      } catch (e) { return res.status(503).json({ error: `ตรวจสอบ Manpower ไม่สำเร็จ กรุณาลองใหม่: ${e.message}` }) }
    }
    const current = await getSheet('workforce_ot')
    const conflicts = employees.filter((employee) => current.some((r) => r.date === body.date && r.employee === employee && r.status !== 'cancelled' && overlaps(body.planned_start, body.planned_end, r.planned_start, r.planned_end)))
    if (conflicts.length) return res.status(409).json({ error: `แผน OT ซ้ำหรือเวลาชนกัน: ${conflicts.join(', ')}` })
    const now = new Date().toISOString(); const plannedMinutes = minutesBetween(body.planned_start, body.planned_end)
    const createdBy = actorName() || body.changed_by || 'Boss'
    const rows = employees.map((employee, index) => [`${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`, body.date, employee, body.team || 'บ้านล่าง', body.task || 'แพ็ก', body.planned_start, body.planned_end, plannedMinutes, '', '', '', 'planned', body.reason || '', body.note || '', now, ''])
    await appendRows('workforce_ot', rows)
    await appendRows('workforce_ot_history', rows.map((row, index) => [`hist-${Date.now()}-c${index}`, row[0], body.date, row[2], '', '', body.planned_start, body.planned_end, '', body.note || '', now, createdBy]))
    clearWorkforceCache()
    return res.status(200).json({ success: true, created: rows.length })
  }
  if (action === 'update-plan') {
    const updates = Array.isArray(body.updates) ? body.updates : []
    if (!updates.length) return res.status(200).json({ success: true, updated: 0, action: 'update-plan' })
    const current = await getSheet('workforce_ot'); const updateMap = new Map(updates.map((u) => [String(u.id), u]))
    for (const row of current) {
      const u = updateMap.get(String(row.id)); if (!u) continue
      if (!validTime(u.planned_start) || !validTime(u.planned_end) || clockMinutes(u.planned_end) <= clockMinutes(u.planned_start)) return res.status(400).json({ error: `เวลาไม่ถูกต้อง: ${row.employee}` })
      if (u.actual_minutes !== '' && u.actual_minutes != null && (!Number.isFinite(Number(u.actual_minutes)) || Number(u.actual_minutes) < 0)) return res.status(400).json({ error: `ชั่วโมงที่ทำจริงไม่ถูกต้อง: ${row.employee}` })
      const conflict = current.some((other) => String(other.id) !== String(row.id) && other.date === row.date && other.employee === row.employee && other.status !== 'cancelled' && overlaps(u.planned_start, u.planned_end, other.planned_start, other.planned_end))
      if (conflict) return res.status(409).json({ error: `เวลาชนกับแผนเดิม: ${row.employee}` })
    }
    const changedAt = new Date().toISOString()
    const changedBy = actorName() || body.changed_by || 'Boss'
    const changedRows = current.filter((row) => { const u = updateMap.get(String(row.id)); return u && (u.planned_start !== row.planned_start || u.planned_end !== row.planned_end || String(u.note ?? '') !== String(row.note ?? '')) })
    if (changedRows.length) await appendRows('workforce_ot_history', changedRows.map((row, index) => { const u = updateMap.get(String(row.id)); return [`hist-${Date.now()}-${index}`, row.id, row.date, row.employee, row.planned_start, row.planned_end, u.planned_start, u.planned_end, row.note || '', u.note ?? row.note ?? '', changedAt, changedBy] }))
    const next = current.map((row) => { const u = updateMap.get(String(row.id)); const merged = u ? { ...row, planned_start: u.planned_start, planned_end: u.planned_end, planned_minutes: minutesBetween(u.planned_start, u.planned_end), actual_minutes: u.actual_minutes === '' || u.actual_minutes == null ? '' : Math.round(Number(u.actual_minutes)), note: u.note ?? row.note, status: 'planned' } : row; return OT_HEADERS.map((h) => merged[h] ?? '') })
    await overwriteSheet('workforce_ot', OT_HEADERS, next); clearWorkforceCache(); return res.status(200).json({ success: true, updated: updates.length })
  }
  if (action === 'delete-plan') {
    const ids = new Set((Array.isArray(body.ids) ? body.ids : []).map(String)); const current = await getSheet('workforce_ot')
    const kept = current.filter((r) => !ids.has(String(r.id))).map((r) => OT_HEADERS.map((h) => r[h] ?? ''))
    await overwriteSheet('workforce_ot', OT_HEADERS, kept); clearWorkforceCache(); return res.status(200).json({ success: true, deleted: current.length - kept.length })
  }
  if (action === 'approve-actual-month') {
    if (!requireAdmin(req, res)) return
    if (!/^\d{4}-\d{2}$/.test(String(body.month || '')) || !body.employee || !Number.isFinite(Number(body.actual_minutes)) || Number(body.actual_minutes) < 0) return res.status(400).json({ error: 'ข้อมูลชั่วโมงจริงไม่ถูกต้อง' })
    const current = await getSheet('workforce_ot_approvals'); const now = new Date().toISOString()
    const changedBy = actorName() || body.approved_by || 'Boss'
    const record = { id: `approve-${body.month}-${body.employee}-${Date.now()}`, month: body.month, employee: body.employee, actual_minutes: Math.round(Number(body.actual_minutes)), approved_at: now, approved_by: changedBy }
    const existing = latestByKey(current, (r) => `${r.month}|${r.employee}`, 'approved_at').find((r) => r.month === body.month && r.employee === body.employee)
    if (existing) {
      await appendRows('workforce_ot_approval_history', [[`apphist-${Date.now()}`, body.month, body.employee, existing.actual_minutes, record.actual_minutes, now, changedBy]])
    }
    await appendRows('workforce_ot_approvals', [OT_APPROVAL_HEADERS.map((h) => record[h] ?? '')])
    clearWorkforceCache()
    return res.status(200).json({ success: true, approval: record })
  }
  if (action === 'set-ot-limit') {
    if (!requireAdmin(req, res)) return
    if (!body.employee) return res.status(400).json({ error: 'กรุณาระบุชื่อพนักงาน' })
    const limitHours = body.limit_hours === '' || body.limit_hours == null ? '' : Number(body.limit_hours)
    if (limitHours !== '' && (!Number.isFinite(limitHours) || limitHours < 0)) return res.status(400).json({ error: 'ลิมิตชั่วโมงไม่ถูกต้อง' })
    const current = await getSheet('workforce_ot_limits'); const now = new Date().toISOString()
    const record = { employee: body.employee, limit_hours: limitHours, updated_at: now, updated_by: actorName() || 'Boss' }
    await appendRows('workforce_ot_limits', [OT_LIMIT_HEADERS.map((h) => record[h] ?? '')])
    clearWorkforceCache()
    const latest = latestByKey([...current, record], (r) => r.employee, 'updated_at')
    return res.status(200).json({ success: true, otLimits: Object.fromEntries(latest.filter((r) => r.employee).map((r) => [r.employee, r.limit_hours])) })
  }
  if (action === 'create-manpower') {
    const employees = Array.isArray(body.employees) ? body.employees.filter(Boolean) : []
    if (!body.date || !employees.length) return res.status(400).json({ error: 'กรุณาระบุวันที่และรายชื่อ' })
    const now = new Date().toISOString()
    const rows = employees.map((employee, index) => [`mp-${Date.now()}-${index}`, body.date, employee, body.team || 'บ้านล่าง', body.task || 'แพ็ก', body.start_time || '09:00', body.end_time || '17:00', body.note || '', now])
    await appendRows('workforce_manpower', rows)
    clearWorkforceCache()
    return res.status(200).json({ success: true, created: rows.length })
  }
  if (action === 'create-event') {
    if (!body.date || !body.title) return res.status(400).json({ error: 'กรุณาระบุวันและชื่อโปร' })
    const endDate = body.end_date || body.date
    if (endDate < body.date) return res.status(400).json({ error: 'วันสิ้นสุดต้องไม่ก่อนวันเริ่ม' })
    await appendRows('workforce_events', [[`event-${Date.now()}`, body.title, body.date, body.team || 'ทุกทีม', body.note || '', new Date().toISOString(), endDate]])
    clearWorkforceCache()
    return res.status(200).json({ success: true })
  }
  if (action === 'delete-event') {
    if (!body.id) return res.status(400).json({ error: 'กรุณาระบุ id' })
    const current = await getSheet('workforce_events')
    const kept = current.filter((r) => String(r.id) !== String(body.id)).map((r) => EVENT_HEADERS.map((h) => r[h] ?? ''))
    await overwriteSheet('workforce_events', EVENT_HEADERS, kept)
    clearWorkforceCache()
    return res.status(200).json({ success: true, deleted: current.length - kept.length })
  }
  return res.status(400).json({ error: `Unknown workforce action: ${action || '(empty)'}` })
}

const isCancelled = (status = '') =>
  status.includes('ยกเลิก') || status.toLowerCase().includes('cancel')

// ── op=summary: สรุปยอดขายจาก raw_orders_* (รายวัน + ราย SKU + import ล่าสุด) ──
async function opSummary(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const meta = await getMeta()
    const tabs = meta.sheets
      .map(s => s.properties.title)
      .filter(t => t.startsWith('raw_orders'))

    // ต่อ tab อ่าน 2 ช่วง: B:F (order_id, -, date, platform, business) และ J:N (sku, name, qty, revenue, status)
    const ranges = tabs.flatMap(t => [`${t}!B:F`, `${t}!J:N`])
    const valueRanges = await batchGetValues(ranges)

    const daily = new Map() // date|business|platform → { revenue, qty, orderIds }
    const skus = new Map()  // sku|business|platform → { name, revenue, qty, orders }

    for (let i = 0; i < tabs.length; i++) {
      const left = valueRanges[2 * i].values || []
      const right = valueRanges[2 * i + 1].values || []
      const n = Math.max(left.length, right.length)
      for (let j = 1; j < n; j++) {
        const [orderId, , date, platform, business] = left[j] || []
        const [sku, name, qtyS, revS, status] = right[j] || []
        if (!date || isCancelled(status)) continue
        const qty = parseInt(qtyS, 10) || 0
        const revenue = parseFloat(String(revS ?? '').replace(/,/g, '')) || 0

        const dKey = `${date}|${business}|${platform}`
        let d = daily.get(dKey)
        if (!d) daily.set(dKey, d = { revenue: 0, qty: 0, orderIds: new Set() })
        d.revenue += revenue
        d.qty += qty
        if (orderId) d.orderIds.add(orderId)

        const sKey = `${sku || '?'}|${business}|${platform}`
        let s = skus.get(sKey)
        if (!s) skus.set(sKey, s = { name: name || sku || '(ไม่ระบุ)', revenue: 0, qty: 0, orders: 0 })
        s.revenue += revenue
        s.qty += qty
        s.orders += 1
      }
    }

    const dailyRows = [...daily.entries()].map(([key, v]) => {
      const [date, business, platform] = key.split('|')
      return {
        date, business, platform,
        revenue: Math.round(v.revenue * 100) / 100,
        qty: v.qty,
        orders: v.orderIds.size,
      }
    }).sort((a, b) => a.date.localeCompare(b.date))

    const skuRows = [...skus.entries()].map(([key, v]) => {
      const [sku, business, platform] = key.split('|')
      return {
        sku, business, platform,
        name: v.name,
        revenue: Math.round(v.revenue * 100) / 100,
        qty: v.qty,
        orders: v.orders,
      }
    })

    let imports = []
    try {
      const log = await getSheet('import_log')
      imports = log
        .filter(r => r.status === 'active')
        .slice(-6)
        .reverse()
        .map(r => ({
          file: r.filename,
          business: r.business,
          platform: r.platform,
          rows: Number(r.rows_imported) || 0,
          at: r.uploaded_at,
        }))
    } catch { /* ไม่มี tab import_log ก็ข้าม */ }

    res.setHeader('Cache-Control', cacheable('public, s-maxage=300, stale-while-revalidate=3600'))
    res.status(200).json({
      maxDate: dailyRows.length ? dailyRows[dailyRows.length - 1].date : null,
      daily: dailyRows,
      skus: skuRows,
      imports,
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}

// ── op=sheet: อ่านทั้ง sheet (?name=) ──
async function opSheet(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const { name } = req.query
  if (!name) return res.status(400).json({ error: 'ต้องระบุ &name=<ชื่อ sheet>' })
  try {
    res.status(200).json(await getSheet(name))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}

// ── op=append: เขียนต่อท้าย body { sheetName, rows } ──
async function opAppend(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { sheetName, rows } = req.body || {}
  if (!sheetName || !Array.isArray(rows)) return res.status(400).json({ error: 'ต้องส่ง sheetName และ rows (array)' })
  try {
    await appendRows(sheetName, rows)
    res.status(200).json({ ok: true, appended: rows.length })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}

// ── op=overwrite: เขียนทับทั้ง sheet body { sheetName, headers, rows } ──
async function opOverwrite(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { sheetName, headers, rows } = req.body || {}
  if (!sheetName || !Array.isArray(headers) || !Array.isArray(rows)) {
    return res.status(400).json({ error: 'ต้องส่ง sheetName, headers (array) และ rows (array)' })
  }
  try {
    await overwriteSheet(sheetName, headers, rows)
    res.status(200).json({ ok: true, written: rows.length })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  const op = String(req.query.op || '')
  if (op === 'summary') return opSummary(req, res)
  if (op === 'sheet') return opSheet(req, res)
  if (op === 'append') return opAppend(req, res)
  if (op === 'overwrite') return opOverwrite(req, res)
  if (op === 'workforce') return opWorkforce(req, res)
  return res.status(400).json({ error: 'ต้องระบุ ?op=summary|sheet|append|overwrite' })
}
