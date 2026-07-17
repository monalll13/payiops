// GET/POST /api/sheet-tools?op=summary|sheet|append|overwrite|workforce|planner|hr
// รวม 4 endpoint เครื่องมือชีตเดิม (/api/summary /api/sheet /api/append /api/overwrite)
// เป็นฟังก์ชันเดียว — Vercel Hobby จำกัด 12 serverless functions ต่อโปรเจค
import { requireAuth, cacheable, authEnabled } from './_lib/auth.js'
import { getMeta, batchGetValues, getSheet, appendRows, overwriteSheet, ensureSheet, downloadDriveFile } from './_lib/sheets.js'
import { verifySignature, pushMessage, replyMessage } from './_lib/line.js'

// ปิด body parser อัตโนมัติของ Vercel — ต้องอ่าน raw body เองเพื่อตรวจลายเซ็น LINE webhook (HMAC ต้องใช้ byte ดิบ)
// req.body ยังใช้ได้ตามปกติในทุก op เดิม เพราะ readRawBody() ด้านล่าง parse JSON ให้เหมือน Vercel ทำเอง
export const config = { api: { bodyParser: false } }
async function readRawBody(req) {
  if (typeof req.rawBody === 'string') return req.rawBody // dev middleware (vite.config.js) เซ็ตไว้ให้แล้ว
  const chunks = []
  for await (const c of req) chunks.push(c)
  req.rawBody = Buffer.concat(chunks).toString()
  return req.rawBody
}
// import ต้องเป็น static (ไม่ใช่ createRequire) ไม่งั้น @vercel/nft ตอน deploy ตรวจไม่เจอว่าไฟล์นี้ใช้ xlsx
// แล้วไม่ bundle แพ็กเกจไปด้วย → "Cannot find module 'xlsx'" ตอนรันจริงบน Vercel (yืนยันจาก log จริง)
// แต่ static import ของแพ็กเกจ CJS นี้บาง bundler ก็ห่อ exports ไว้ใต้ .default แทนที่จะแปะตรงๆ บน namespace
// จึง unwrap เผื่อไว้ทั้งสองแบบ ให้ใช้ได้ทั้งตอน dev (Vite/Node) และตอน deploy จริง (esbuild)
import * as XLSX_NS from 'xlsx'
const XLSX = XLSX_NS.default && typeof XLSX_NS.default.read === 'function' ? XLSX_NS.default : XLSX_NS

const OT_HEADERS = ['id', 'date', 'employee', 'team', 'task', 'planned_start', 'planned_end', 'planned_minutes', 'actual_start', 'actual_end', 'actual_minutes', 'status', 'reason', 'note', 'created_at', 'closed_at']
const MANPOWER_HEADERS = ['id', 'date', 'employee', 'team', 'task', 'start_time', 'end_time', 'note', 'created_at']
const EVENT_HEADERS = ['id', 'title', 'date', 'team', 'note', 'created_at', 'end_date']
const OT_HISTORY_HEADERS = ['id', 'plan_id', 'date', 'employee', 'before_start', 'before_end', 'after_start', 'after_end', 'before_note', 'after_note', 'changed_at', 'changed_by']
const OT_APPROVAL_HEADERS = ['id', 'month', 'employee', 'actual_minutes', 'approved_at', 'approved_by']
const PEOPLE_HEADERS = ['code', 'name', 'group']
const OT_LIMIT_HEADERS = ['employee', 'limit_hours', 'updated_at', 'updated_by']
const OT_APPROVAL_HISTORY_HEADERS = ['id', 'month', 'employee', 'before_minutes', 'after_minutes', 'changed_at', 'changed_by']
const LEAVE_HEADERS = ['id', 'username', 'employee_name', 'leave_type', 'start_date', 'end_date', 'days', 'reason', 'status', 'requested_by', 'requested_at', 'decided_by', 'decided_at', 'decision_note']
const SCHEDULE_HEADERS = ['id', 'date', 'username', 'employee_name', 'shift_start', 'shift_end', 'role_note', 'created_at', 'created_by']
const LINE_LINK_HEADERS = ['username', 'line_user_id', 'updated_at']
const LINE_SESSION_HEADERS = ['line_user_id', 'step', 'leave_type', 'date', 'date2', 'updated_at']
const HR_SHEETS = [['hr_leave', LEAVE_HEADERS], ['hr_schedule', SCHEDULE_HEADERS], ['hr_line_links', LINE_LINK_HEADERS], ['hr_line_sessions', LINE_SESSION_HEADERS]]
let hrEnsurePromise
let hrCache = { at: 0, data: null }
const ensureHrSheets = () => hrEnsurePromise ||= Promise.all(HR_SHEETS.map(([name, headers]) => ensureSheet(name, headers)))
const clearHrCache = () => { hrCache = { at: 0, data: null } }
const daysBetween = (start, end) => Math.round((new Date(`${end}T00:00:00`) - new Date(`${start}T00:00:00`)) / 86400000) + 1

// ใช้ร่วมกันทั้งจาก action decide-leave (กดในเว็บ) และ webhook LINE (กดปุ่มในแชท)
async function applyLeaveDecision(id, decision, decidedBy, decisionNote = '') {
  if (!id || !['approved', 'rejected'].includes(decision)) return { error: 'ข้อมูลไม่ถูกต้อง' }
  const current = await getSheet('hr_leave')
  const target = current.find((r) => String(r.id) === String(id))
  if (!target) return { error: 'ไม่พบคำขอลานี้' }
  if (target.status !== 'pending') return { error: 'คำขอนี้ถูกพิจารณาไปแล้ว', target }
  const now = new Date().toISOString()
  const record = { ...target, status: decision, decided_by: decidedBy, decided_at: now, decision_note: decisionNote }
  const next = current.map((r) => String(r.id) === String(id) ? record : r)
  await overwriteSheet('hr_leave', LEAVE_HEADERS, next.map((r) => LEAVE_HEADERS.map((h) => r[h] ?? '')))
  clearHrCache()
  return { record }
}

// รายชื่อ admin ที่ผูก LINE ไว้แล้ว (username, line_user_id) — ใช้ตอนแจ้งเตือนคำขอลาใหม่
async function getAdminLineTargets() {
  const [users, links] = await Promise.all([getSheet('users'), getSheet('hr_line_links')])
  const linkByUsername = Object.fromEntries(links.filter((l) => l.username && l.line_user_id).map((l) => [l.username, l.line_user_id]))
  return users.filter((u) => (u.role || 'staff') === 'admin' && linkByUsername[u.username]).map((u) => ({ username: u.username, line_user_id: linkByUsername[u.username] }))
}

const leaveSummaryText = (l) => l.leave_type === 'สลับวันหยุด'
  ? `${l.employee_name} ขอสลับวันหยุด จาก ${l.start_date} เป็น ${l.end_date}${l.reason ? `\nเหตุผล: ${l.reason}` : ''}`
  : `${l.employee_name} ขอลา${l.leave_type}\n${l.start_date}${Number(l.days) === 0.5 ? ' (ครึ่งวัน)' : l.end_date !== l.start_date ? ` – ${l.end_date}` : ''} · ${l.days} วัน${l.reason ? `\nเหตุผล: ${l.reason}` : ''}`

// แจ้งเตือน admin ที่ผูก LINE ไว้ทุกคน พร้อมปุ่มอนุมัติ/ปฏิเสธ — best-effort ล้วนๆ ห้ามทำให้คำขอลาพัง แม้ LINE ล่ม
async function notifyNewLeaveRequest(record) {
  const targets = await getAdminLineTargets()
  if (!targets.length) return
  const message = {
    type: 'template', altText: `คำขอลาใหม่: ${leaveSummaryText(record)}`,
    template: {
      type: 'buttons', text: leaveSummaryText(record).slice(0, 160),
      actions: [
        { type: 'postback', label: 'อนุมัติ', data: `hr-approve:${record.id}`, displayText: 'อนุมัติคำขอลา' },
        { type: 'postback', label: 'ปฏิเสธ', data: `hr-reject:${record.id}`, displayText: 'ปฏิเสธคำขอลา' },
      ],
    },
  }
  await Promise.all(targets.map((t) => pushMessage(t.line_user_id, [message])))
}

const PLANNER_CONFIG_SHEET = 'planner_config'
const PLANNER_DAILY_SHEET = 'planner_daily'
const PLANNER_CONFIG_HEADERS = ['master_sku', 'enabled', 'reserve_days', 'safety_percent', 'updated_at', 'updated_by']
const PLANNER_DAILY_HEADERS = ['id', 'date', 'master_sku', 'fg', 'sales_average', 'demand_mode', 'recommended_feed', 'planned_feed', 'feeders', 'updated_at', 'updated_by']
const WORKFORCE_SHEETS = [['workforce_ot', OT_HEADERS], ['workforce_manpower', MANPOWER_HEADERS], ['workforce_events', EVENT_HEADERS], ['workforce_ot_history', OT_HISTORY_HEADERS], ['workforce_ot_approvals', OT_APPROVAL_HEADERS], ['workforce_people', PEOPLE_HEADERS], ['workforce_ot_limits', OT_LIMIT_HEADERS], ['workforce_ot_approval_history', OT_APPROVAL_HISTORY_HEADERS]]
let workforceEnsurePromise
let workforceCache = { at: 0, data: null }
const ensureWorkforceSheets = () => workforceEnsurePromise ||= Promise.all(WORKFORCE_SHEETS.map(([name, headers]) => ensureSheet(name, headers)))
// กลุ่มพื้นเหลืองในไฟล์ต้นฉบับ (TOON/KED/MO) เป็นอีกหน่วยงาน (ออฟฟิศ) ไม่ใช่บ้านล่าง — ไม่ต้องเพิ่มแถวใน workforce_people ให้กลุ่มนั้น จึงไม่ถูกดึงเข้าปฏิทินนี้
// รายชื่อบ้านล่างตอนเริ่มระบบ ใช้ seed แท็บ workforce_people ครั้งแรกเท่านั้น — หลังจากนี้แก้/เพิ่มคนได้ตรงในชีตเลย ไม่ต้องแก้โค้ด
const DEFAULT_PEOPLE_ROWS = [['TANG', 'แตง', 'คนแพ็ก'], ['PANG', 'แป้ง', 'คนแพ็ก'], ['FAH', 'ฟ้า', 'คนแพ็ก'], ['MII', 'มี่', 'คนแพ็ก'], ['PANID', 'ป้านิด', 'คนฟีด'], ['MOM', 'แม่', 'คนฟีด'], ['MAPRANG', 'มะปราง', 'พาร์ทไทม์'], ['ATOM', 'อะตอม', 'อื่น ๆ'], ['BAS', 'บาส', 'อื่น ๆ'], ['NEOY', 'เนย', 'อื่น ๆ']]
const MONTH_BY_TAB = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' }
const rowsToObjects = (values = []) => { const [headers, ...rows] = values; return headers ? rows.map((row) => Object.fromEntries(headers.map((h, i) => [h, row[i] ?? '']))) : [] }
// workforce_ot_approvals/workforce_ot_limits เป็น append-only log (ไม่ overwrite แถวเดิม) — กัน race condition ตอนแก้พร้อมกันหลายเครื่อง
// อ่านตอน GET ต้องลดเหลือ "ล่าสุดต่อ key" เอง
const latestByKey = (rows, keyFn, timeField) => { const map = new Map(); for (const r of rows) { const k = keyFn(r); const prev = map.get(k); if (!prev || String(r[timeField]) >= String(prev[timeField])) map.set(k, r) } return [...map.values()] }
const requireAdmin = (req, res) => { if (authEnabled() && req.user?.role !== 'admin') { res.status(403).json({ error: 'ต้องเป็น admin เท่านั้น' }); return false } return true }
const clearWorkforceCache = () => { workforceCache = { at: 0, data: null } }

// ดาวน์โหลด + parse ไฟล์ manpower จาก Drive เป็นส่วนที่ช้าที่สุดของหน้านี้ (ไฟล์ใหญ่ + ต้อง auth ใหม่ทุกครั้ง)
// ตารางคนทำงานเปลี่ยนไม่บ่อย จึง cache แยกจาก workforceCache ด้วย TTL ยาวกว่ามาก (5 นาที) ลดเวลาโหลดที่ผู้ใช้เจอ
let manpowerSourceCache = { at: 0, data: null }
const MANPOWER_SOURCE_CACHE_MS = 900000
async function getManpowerSource(personMap) {
  if (!process.env.MANPOWER_FILE_ID) return []
  if (manpowerSourceCache.data && Date.now() - manpowerSourceCache.at < MANPOWER_SOURCE_CACHE_MS) return manpowerSourceCache.data
  const data = parseManpowerWorkbook(await downloadDriveFile(process.env.MANPOWER_FILE_ID), personMap)
  manpowerSourceCache = { at: Date.now(), data }
  return data
}

async function getPersonMap() {
  const people = await getSheet('workforce_people')
  if (!people.length) { await appendRows('workforce_people', DEFAULT_PEOPLE_ROWS); return getPersonMap() }
  const map = Object.fromEntries(DEFAULT_PEOPLE_ROWS.map(([code, name, group]) => [code, [name, group]]))
  for (const p of people) {
    if (!p.code) continue
    const code = String(p.code).toUpperCase()
    const forcedName = code === 'PANID' ? 'ป้านิด' : code === 'MOM' ? 'แม่' : ''
    map[code] = [forcedName || p.name || map[code]?.[0] || code, ['PANID', 'MOM'].includes(code) ? 'คนฟีด' : (p.group || 'อื่น ๆ')]
  }
  return map
}

// กลุ่มออฟฟิศ (พื้นเหลืองในไฟล์ SKJ) — จงใจไม่ใส่ใน workforce_people เพราะไม่ต้องการให้ขึ้นปฏิทิน Manpower & OT เดิม
// แต่ระบบลา/LINE ต้องเห็นคนกลุ่มนี้ด้วย จึงใช้ personMap แยกต่างหากเฉพาะตอนอ่านไฟล์ manpower สำหรับ op=hr เท่านั้น (cache คนละก้อนกับ getManpowerSource ของ Workforce OT กันชนกัน)
const HR_EXTRA_PEOPLE = { TOON: ['ตูน', 'ออฟฟิศ'], KED: ['เกด', 'ออฟฟิศ'], MO: ['โม', 'ออฟฟิศ'] }
// คนหนึ่งคนสำหรับระบบลา/LINE — เช็ค workforce_people ก่อน (บ้านล่าง) แล้วค่อย fallback ไป HR_EXTRA_PEOPLE (ออฟฟิศ)
async function findHrPerson(code) {
  const fromSheet = (await getSheet('workforce_people')).find((p) => p.code === code)
  if (fromSheet) return { code, name: fromSheet.name }
  const extra = HR_EXTRA_PEOPLE[code]
  return extra ? { code, name: extra[0] } : null
}
let hrManpowerSourceCache = { at: 0, data: null }
async function getHrManpowerSource() {
  if (!process.env.MANPOWER_FILE_ID) return []
  if (hrManpowerSourceCache.data && Date.now() - hrManpowerSourceCache.at < MANPOWER_SOURCE_CACHE_MS) return hrManpowerSourceCache.data
  const personMap = { ...(await getPersonMap()), ...HR_EXTRA_PEOPLE }
  const data = parseManpowerWorkbook(await downloadDriveFile(process.env.MANPOWER_FILE_ID), personMap)
  hrManpowerSourceCache = { at: Date.now(), data }
  return data
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
          result.push({ id: `source-${date}-${code}-${rr}`, date, employee: person[0], code, group: person[1], fraction: /0[.,]5|O[.,]5/.test(upper) ? 0.5 : 1, raw, source: 'SKJ2026' })
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
      const sourceManpower = await getManpowerSource(personMap)
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
    try { sourceManpower = await getManpowerSource(personMap); sourceWarnings = sourceManpower.warnings || [] } catch (e) { console.error('manpower source:', e.message) }
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
        const dayManpower = (await getManpowerSource(personMap)).filter((r) => r.date === body.date)
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

async function opHr(req, res) {
  try {
    return await opHrInner(req, res)
  } catch (e) {
    console.error('opHr:', e)
    return res.status(500).json({ success: false, error: e.message })
  }
}

async function opHrInner(req, res) {
  const actorUsername = () => req.user?.u || null
  const actorName = () => req.user?.name || 'Boss'
  await ensureHrSheets()

  if (req.method === 'GET') {
    if (hrCache.data && Date.now() - hrCache.at < 20000) return res.status(200).json(hrCache.data)
    const [leaveRange, scheduleRange, lineLinkRange, peopleRange] = await batchGetValues(['hr_leave!A:Z', 'hr_schedule!A:Z', 'hr_line_links!A:Z', 'workforce_people!A:Z'])
    // เดือนที่แต่ละคนมีงานจริง (จากไฟล์ manpower บน Drive) — ใช้กรอง dropdown "ยื่นแทนพนักงาน"/"ผูก LINE" ไม่ให้โชว์คนออกแล้ว/พาร์ทไทม์ที่ไม่ได้ทำเดือนนั้น
    // ใช้ getHrManpowerSource (personMap รวมกลุ่มออฟฟิศ HR_EXTRA_PEOPLE) ไม่ใช่ getManpowerSource ของ Workforce OT — กันคนกลุ่มนี้หลุดเข้าปฏิทิน OT
    let activeMonths = {}
    try {
      const manpowerRows = await getHrManpowerSource()
      for (const r of manpowerRows) (activeMonths[r.code] ||= new Set()).add(String(r.date).slice(0, 7))
      activeMonths = Object.fromEntries(Object.entries(activeMonths).map(([code, set]) => [code, [...set]]))
    } catch (e) { console.error('activeMonths:', e.message) } // ไฟล์ manpower โหลดไม่ได้ก็ไม่ให้ทั้งหน้า HR พัง — แค่ไม่กรองเดือน
    const peopleFromSheet = rowsToObjects(peopleRange.values || [])
    const extraPeople = Object.entries(HR_EXTRA_PEOPLE)
      .filter(([code]) => !peopleFromSheet.some((p) => String(p.code).toUpperCase() === code))
      .map(([code, [name, group]]) => ({ code, name, group }))
    const data = { success: true, leave: rowsToObjects(leaveRange.values || []), schedule: rowsToObjects(scheduleRange.values || []), lineLinks: rowsToObjects(lineLinkRange.values || []), people: [...peopleFromSheet, ...extraPeople], activeMonths }
    res.setHeader('Cache-Control', cacheable('public, s-maxage=20, stale-while-revalidate=60'))
    hrCache = { at: Date.now(), data }
    return res.status(200).json(data)
  }
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' })
  const body = req.body || {}
  const action = String(body.action || '').trim().toLowerCase()

  if (action === 'request-leave' || action === 'request-leave-for') {
    const forSomeoneElse = action === 'request-leave-for'
    if (forSomeoneElse && !requireAdmin(req, res)) return
    if (!body.start_date || !body.leave_type) return res.status(400).json({ success: false, error: 'กรุณาระบุประเภทการลาและวันที่' })
    const isSwap = body.leave_type === 'สลับวันหยุด' // "จาก...เป็น..." ไม่ใช่ช่วงต่อเนื่อง วันที่ 2 มาก่อนวันที่ 1 ได้ ไม่ใช่ error
    const halfDay = Boolean(body.half_day) && !isSwap
    const endDate = halfDay ? body.start_date : body.end_date
    if (!halfDay && !endDate) return res.status(400).json({ success: false, error: isSwap ? 'กรุณาระบุวันหยุดใหม่' : 'กรุณาระบุวันสิ้นสุด' })
    if (!halfDay && !isSwap && endDate < body.start_date) return res.status(400).json({ success: false, error: 'วันสิ้นสุดต้องไม่ก่อนวันเริ่ม' })

    let username, employeeName
    if (forSomeoneElse) {
      // ยื่นแทนพนักงานที่ไม่มีบัญชี login — ระบุตัวตนจากตาราง manpower (workforce_people + กลุ่มออฟฟิศ) ไม่ใช่ users
      const code = String(body.employee_code || '').trim()
      const person = code ? await findHrPerson(code) : null
      if (!code || !person) return res.status(400).json({ success: false, error: 'ไม่พบพนักงานในตาราง manpower' })
      username = `mp:${code}`
      employeeName = person.name
    } else {
      username = actorUsername() || 'boss'
      employeeName = actorName()
    }

    const now = new Date().toISOString()
    const record = {
      id: `leave-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      username, employee_name: employeeName, leave_type: body.leave_type,
      start_date: body.start_date, end_date: endDate,
      days: isSwap ? 1 : halfDay ? 0.5 : daysBetween(body.start_date, endDate),
      reason: body.reason || '', status: 'pending',
      requested_by: actorName(), requested_at: now,
      decided_by: '', decided_at: '', decision_note: '',
    }
    await appendRows('hr_leave', [LEAVE_HEADERS.map((h) => record[h] ?? '')])
    clearHrCache()
    notifyNewLeaveRequest(record).catch((e) => console.error('notifyNewLeaveRequest:', e.message))
    return res.status(200).json({ success: true, leave: record })
  }
  if (action === 'decide-leave') {
    if (!requireAdmin(req, res)) return
    const { record, error } = await applyLeaveDecision(body.id, body.decision, actorName(), body.decision_note || '')
    if (error) return res.status(record ? 400 : 404).json({ success: false, error })
    return res.status(200).json({ success: true, leave: record })
  }
  if (action === 'cancel-leave') {
    if (!body.id) return res.status(400).json({ success: false, error: 'กรุณาระบุ id' })
    const current = await getSheet('hr_leave')
    const target = current.find((r) => String(r.id) === String(body.id))
    if (!target) return res.status(404).json({ success: false, error: 'ไม่พบคำขอลานี้' })
    const isOwner = target.username === actorUsername()
    const isAdmin = !authEnabled() || req.user?.role === 'admin'
    if (!isOwner && !isAdmin) return res.status(403).json({ success: false, error: 'ยกเลิกได้เฉพาะคำขอของตัวเองหรือ admin' })
    if (target.status !== 'pending') return res.status(400).json({ success: false, error: 'ยกเลิกได้เฉพาะรายการที่ยัง pending' })
    const kept = current.filter((r) => String(r.id) !== String(body.id))
    await overwriteSheet('hr_leave', LEAVE_HEADERS, kept.map((r) => LEAVE_HEADERS.map((h) => r[h] ?? '')))
    clearHrCache()
    return res.status(200).json({ success: true })
  }
  if (action === 'set-line-id' || action === 'set-line-id-for') {
    let username
    if (action === 'set-line-id-for') {
      if (!requireAdmin(req, res)) return
      const code = String(body.employee_code || '').trim()
      if (!code) return res.status(400).json({ success: false, error: 'กรุณาระบุพนักงาน' })
      username = `mp:${code}`
    } else {
      username = actorUsername() || 'boss'
    }
    const lineUserId = String(body.line_user_id || '').trim()
    const current = await getSheet('hr_line_links')
    const now = new Date().toISOString()
    const kept = current.filter((r) => r.username !== username).map((r) => LINE_LINK_HEADERS.map((h) => r[h] ?? ''))
    const rows = lineUserId ? [...kept, LINE_LINK_HEADERS.map((h) => ({ username, line_user_id: lineUserId, updated_at: now })[h] ?? '')] : kept
    await overwriteSheet('hr_line_links', LINE_LINK_HEADERS, rows)
    clearHrCache()
    return res.status(200).json({ success: true, line_user_id: lineUserId })
  }
  if (action === 'create-schedule') {
    if (!requireAdmin(req, res)) return
    if (!body.date || !body.username || !validTime(body.shift_start) || !validTime(body.shift_end) || clockMinutes(body.shift_end) <= clockMinutes(body.shift_start)) {
      return res.status(400).json({ success: false, error: 'กรุณาระบุวันที่ พนักงาน และเวลากะให้ถูกต้อง' })
    }
    const now = new Date().toISOString()
    const record = {
      id: `sched-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      date: body.date, username: body.username, employee_name: body.employee_name || body.username,
      shift_start: body.shift_start, shift_end: body.shift_end, role_note: body.role_note || '',
      created_at: now, created_by: actorName(),
    }
    await appendRows('hr_schedule', [SCHEDULE_HEADERS.map((h) => record[h] ?? '')])
    clearHrCache()
    return res.status(200).json({ success: true, schedule: record })
  }
  if (action === 'delete-schedule') {
    if (!requireAdmin(req, res)) return
    if (!body.id) return res.status(400).json({ success: false, error: 'กรุณาระบุ id' })
    const current = await getSheet('hr_schedule')
    const kept = current.filter((r) => String(r.id) !== String(body.id))
    await overwriteSheet('hr_schedule', SCHEDULE_HEADERS, kept.map((r) => SCHEDULE_HEADERS.map((h) => r[h] ?? '')))
    clearHrCache()
    return res.status(200).json({ success: true, deleted: current.length - kept.length })
  }
  return res.status(400).json({ success: false, error: `Unknown hr action: ${action || '(empty)'}` })
}

const isCancelled = (status = '') =>
  status.includes('ยกเลิก') || status.toLowerCase().includes('cancel')
const isReturned = (status = '') => status.toLowerCase().includes('return')

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
        if (!date) continue
        // จำนวนออเดอร์นับรวมยกเลิก/ตีคืน (งานแพ็คเกิดขึ้นแล้ว) ยอดขาย/จำนวนชิ้นไม่นับ
        const excluded = isCancelled(status) || isReturned(status)
        const qty = parseInt(qtyS, 10) || 0
        const revenue = parseFloat(String(revS ?? '').replace(/,/g, '')) || 0

        const dKey = `${date}|${business}|${platform}`
        let d = daily.get(dKey)
        if (!d) daily.set(dKey, d = { revenue: 0, qty: 0, grossQty: 0, orderIds: new Set() })
        if (orderId) d.orderIds.add(orderId)
        d.grossQty += qty
        if (!excluded) { d.revenue += revenue; d.qty += qty }

        const sKey = `${sku || '?'}|${business}|${platform}`
        let s = skus.get(sKey)
        if (!s) skus.set(sKey, s = { name: name || sku || '(ไม่ระบุ)', revenue: 0, qty: 0, grossQty: 0, orders: 0 })
        s.orders += 1
        s.grossQty += qty
        if (!excluded) { s.revenue += revenue; s.qty += qty }
      }
    }

    const dailyRows = [...daily.entries()].map(([key, v]) => {
      const [date, business, platform] = key.split('|')
      return {
        date, business, platform,
        revenue: Math.round(v.revenue * 100) / 100,
        qty: v.qty,
        grossQty: v.grossQty,
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
        grossQty: v.grossQty,
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

// ── op=planner: อ่าน/บันทึก Planner ลง Google Sheet เดิม ──
async function opPlanner(req, res) {
  const text = (value) => String(value ?? '').trim()
  const number = (value) => Math.max(0, Number(value) || 0)
  const truthy = (value) => value === true || value === 1 || ['1', 'true', 'yes'].includes(String(value).toLowerCase())
  try {
    // ทำตามลำดับเพื่อลดโอกาสชนกันตอนสร้างแท็บครั้งแรก
    await ensureSheet(PLANNER_CONFIG_SHEET, PLANNER_CONFIG_HEADERS)
    await ensureSheet(PLANNER_DAILY_SHEET, PLANNER_DAILY_HEADERS)

    if (req.method === 'GET') {
      const date = text(req.query.date).slice(0, 10)
      const [config, allDaily] = await Promise.all([getSheet(PLANNER_CONFIG_SHEET), getSheet(PLANNER_DAILY_SHEET)])
      const daily = date ? allDaily.filter((row) => row.date === date) : allDaily
      res.setHeader('Cache-Control', 'no-store')
      return res.status(200).json({ success: true, config, daily })
    }

    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' })
    const body = req.body || {}
    if (body.action !== 'save-all') return res.status(400).json({ success: false, error: 'Unknown planner action' })

    const now = new Date().toISOString()
    const updatedBy = req.user?.name || text(body.updated_by) || 'Planner'
    const config = (Array.isArray(body.config) ? body.config : []).filter((row) => /^PY/i.test(text(row.master_sku))).map((row) => ({
      master_sku: text(row.master_sku).toUpperCase(),
      enabled: truthy(row.enabled) ? '1' : '0',
      reserve_days: number(row.reserve_days),
      safety_percent: number(row.safety_percent),
      updated_at: now,
      updated_by: updatedBy,
    }))
    const daily = (Array.isArray(body.daily) ? body.daily : []).filter((row) => row.date && /^PY/i.test(text(row.master_sku))).map((row) => ({
      id: `${text(row.date).slice(0, 10)}|${text(row.master_sku).toUpperCase()}`,
      date: text(row.date).slice(0, 10),
      master_sku: text(row.master_sku).toUpperCase(),
      fg: number(row.fg),
      sales_average: number(row.sales_average),
      demand_mode: ['normal', 'surge', 'promo'].includes(row.demand_mode) ? row.demand_mode : 'normal',
      recommended_feed: number(row.recommended_feed),
      planned_feed: number(row.planned_feed),
      feeders: [...new Set(Array.isArray(row.feeders) ? row.feeders.map(text).filter(Boolean) : [])].join(' · '),
      updated_at: now,
      updated_by: updatedBy,
    }))

    const saveDate = text(body.date).slice(0, 10)
    const currentDaily = await getSheet(PLANNER_DAILY_SHEET)
    const incomingKeys = new Set(daily.map((row) => row.id))
    const keptDaily = currentDaily.filter((row) => row.date !== saveDate && !incomingKeys.has(row.id))
    await overwriteSheet(PLANNER_CONFIG_SHEET, PLANNER_CONFIG_HEADERS, config.map((row) => PLANNER_CONFIG_HEADERS.map((header) => row[header] ?? '')))
    await overwriteSheet(PLANNER_DAILY_SHEET, PLANNER_DAILY_HEADERS, [...keptDaily, ...daily].map((row) => PLANNER_DAILY_HEADERS.map((header) => row[header] ?? '')))
    return res.status(200).json({ success: true, configSaved: config.length, dailySaved: daily.length, updatedAt: now, updatedBy })
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message })
  }
}

// ── op=line-webhook: LINE เรียกเข้ามาตอนกดปุ่มอนุมัติ/ปฏิเสธในแชท — ไม่มี x-api-token ต้องตรวจลายเซ็นแทน ──
// ── ตัวช่วยขั้นตอนยื่นลาผ่านแชท LINE (พนักงานที่ไม่มีบัญชี login กดเมนูสำเร็จรูปแทนเข้าเว็บ) ──
const LEAVE_TRIGGER = 'ลา'
const LEAVE_TYPES_LINE = ['พักร้อน', 'ลากิจ', 'ลาป่วย', 'ขาดงาน', 'สลับวันหยุด']
const THAI_MONTH_ABBR = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const todayStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
const addDaysStr = (dateStr, n) => { const d = new Date(`${dateStr}T00:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
const thaiDateLabel = (dateStr) => { const [, m, d] = dateStr.split('-'); return `${Number(d)} ${THAI_MONTH_ABBR[Number(m) - 1]}` }

// เลือกประเภทการลา — ใช้ quick reply (ไม่ใช่ buttons template) เพราะ buttons template จำกัดแค่ 4 ปุ่ม แต่ตอนนี้มี 5 ประเภทแล้ว
const typeQuickReplyMessage = () => ({ type: 'text', text: 'ลาประเภทไหนครับ?', quickReply: { items: LEAVE_TYPES_LINE.map((t) => ({ type: 'action', action: { type: 'postback', label: t, data: `hr-wiz-type:${t}`, displayText: t } })) } })
// ปฏิทินจริงของ LINE (datetimepicker) กันพิมพ์วันที่ผิด — ใช้แทนการพิมพ์วันที่เองทั้งหมด
const dtPicker = (label, data, min) => ({ type: 'datetimepicker', label, data, mode: 'date', initial: min || todayStr(), min: min || todayStr() })
// ประเภทลาทั่วไป: วันเดียว (วันนี้/พรุ่งนี้) หรือเลือกช่วงวันที่เอง (ลาหลายวัน/หยุดยาว)
const dateChoiceMessage = () => ({ type: 'template', altText: 'เลือกวันที่ลา', template: { type: 'buttons', text: 'ลาวันไหนครับ?', actions: [
  { type: 'postback', label: 'วันนี้', data: 'hr-wiz-date:today', displayText: 'วันนี้' },
  { type: 'postback', label: 'พรุ่งนี้', data: 'hr-wiz-date:tomorrow', displayText: 'พรุ่งนี้' },
  { type: 'postback', label: 'เลือกวัน/ช่วงวันที่', data: 'hr-wiz-date:range', displayText: 'เลือกวัน/ช่วงวันที่' },
] } })
const rangeStartMessage = () => ({ type: 'template', altText: 'เลือกวันเริ่มลา', template: { type: 'buttons', text: 'เริ่มลาวันไหนครับ?', actions: [dtPicker('เลือกวันที่', 'hr-wiz-range-start:pick')] } })
const rangeEndMessage = (minDate) => ({ type: 'template', altText: 'เลือกวันสิ้นสุด', template: { type: 'buttons', text: 'ถึงวันไหนครับ? (เลือกวันเดียวกันถ้าลาวันเดียว)', actions: [dtPicker('เลือกวันที่', 'hr-wiz-range-end:pick', minDate)] } })
// สลับวันหยุด: ต้องมี 2 วันแยกกัน (วันหยุดเดิม -> วันหยุดใหม่) ไม่ใช่ช่วงต่อเนื่อง
const swapFromMessage = () => ({ type: 'template', altText: 'เลือกวันหยุดเดิม', template: { type: 'buttons', text: 'จากวันไหนครับ (วันหยุดเดิม)?', actions: [dtPicker('เลือกวันที่', 'hr-wiz-swap-from:pick')] } })
const swapToMessage = () => ({ type: 'template', altText: 'เลือกวันหยุดใหม่', template: { type: 'buttons', text: 'เป็นวันไหนครับ (วันหยุดใหม่)?', actions: [dtPicker('เลือกวันที่', 'hr-wiz-swap-to:pick')] } })
const confirmMessage = (session) => {
  const isSwap = session.leave_type === 'สลับวันหยุด'
  const isRange = !isSwap && session.date2 && session.date2 !== session.date
  const text = isSwap
    ? `ยืนยันขอสลับวันหยุด จาก ${thaiDateLabel(session.date)} เป็น ${thaiDateLabel(session.date2)} ใช่ไหมครับ?`
    : isRange
      ? `ยืนยันลา${session.leave_type} วันที่ ${thaiDateLabel(session.date)} – ${thaiDateLabel(session.date2)} ใช่ไหมครับ?`
      : `ยืนยันลา${session.leave_type} วันที่ ${thaiDateLabel(session.date)} 1 วัน ใช่ไหมครับ?`
  return { type: 'template', altText: 'ยืนยันคำขอลา', template: { type: 'buttons', text, actions: [
    { type: 'postback', label: 'ยืนยัน', data: 'hr-wiz-confirm:yes', displayText: 'ยืนยัน' },
    { type: 'postback', label: 'ยกเลิก', data: 'hr-wiz-confirm:no', displayText: 'ยกเลิก' },
  ] } }
}

const getLineSessions = () => getSheet('hr_line_sessions')
async function upsertSession(lineUserId, patch) {
  const current = await getLineSessions()
  const existing = current.find((r) => r.line_user_id === lineUserId) || { line_user_id: lineUserId, step: '', leave_type: '', date: '' }
  const next = { ...existing, ...patch, updated_at: new Date().toISOString() }
  const rows = current.filter((r) => r.line_user_id !== lineUserId).map((r) => LINE_SESSION_HEADERS.map((h) => r[h] ?? ''))
  rows.push(LINE_SESSION_HEADERS.map((h) => next[h] ?? ''))
  await overwriteSheet('hr_line_sessions', LINE_SESSION_HEADERS, rows)
  return next
}
async function clearSession(lineUserId) {
  const current = await getLineSessions()
  const rows = current.filter((r) => r.line_user_id !== lineUserId).map((r) => LINE_SESSION_HEADERS.map((h) => r[h] ?? ''))
  await overwriteSheet('hr_line_sessions', LINE_SESSION_HEADERS, rows)
}

// พนักงาน manpower ที่ผูก LINE ไว้แล้ว (username เก็บเป็น mp:<code> เหมือน request-leave-for) — ไม่พบ = ยังไม่ได้ผูก ใช้เมนูลาไม่ได้
async function findStaffLink(lineUserId) {
  const links = await getSheet('hr_line_links')
  const link = links.find((l) => l.line_user_id === lineUserId && String(l.username || '').startsWith('mp:'))
  if (!link) return null
  const code = link.username.slice(3)
  const person = await findHrPerson(code)
  if (!person) return null
  return { username: link.username, code, name: person.name }
}

async function handleLeaveWizard(event, staffLink) {
  const lineUserId = event.source?.userId
  const replyToken = event.replyToken
  if (!replyToken) return
  const invalid = () => replyMessage(replyToken, [{ type: 'text', text: 'เริ่มใหม่โดยพิมพ์ "ลา" ครับ' }])

  if (event.type === 'message' && event.message?.type === 'text') {
    const text = String(event.message.text || '').trim()
    const session = (await getLineSessions()).find((s) => s.line_user_id === lineUserId)

    // พิมพ์ "ลา" เริ่มใหม่ได้เสมอ แม้มี session ค้างจากรอบก่อน (เช่น กดออกจากแชทกลางคัน ไม่กดปุ่มจนจบ) — ไม่งั้นบอทจะเงียบตลอดไปเพราะข้อความอื่นไม่ถูกจับเลย
    if (text === LEAVE_TRIGGER) {
      await upsertSession(lineUserId, { step: 'await_type', leave_type: '', date: '', date2: '' })
      return replyMessage(replyToken, [typeQuickReplyMessage()])
    }
    return // ข้อความอื่นที่ไม่เข้าเงื่อนไข ไม่ตอบ กันสแปมแชท
  }

  if (event.type === 'postback') {
    const data = String(event.postback?.data || '')
    const session = (await getLineSessions()).find((s) => s.line_user_id === lineUserId)
    const pickedDate = event.postback?.params?.date // มาจากปฏิทินจริงของ LINE (datetimepicker) เท่านั้น ไม่มีทางพิมพ์ผิด

    if (data.startsWith('hr-wiz-type:')) {
      if (session?.step !== 'await_type') return invalid()
      const leaveType = data.slice('hr-wiz-type:'.length)
      if (leaveType === 'สลับวันหยุด') {
        await upsertSession(lineUserId, { leave_type: leaveType, step: 'await_swap_from' })
        return replyMessage(replyToken, [swapFromMessage()])
      }
      await upsertSession(lineUserId, { leave_type: leaveType, step: 'await_date' })
      return replyMessage(replyToken, [dateChoiceMessage()])
    }

    // ── ประเภทลาทั่วไป: วันเดียว (วันนี้/พรุ่งนี้) หรือเลือกช่วงวันที่เอง (ลาหลายวัน/หยุดยาว) ──
    if (data.startsWith('hr-wiz-date:')) {
      if (session?.step !== 'await_date') return invalid()
      const choice = data.slice('hr-wiz-date:'.length)
      if (choice === 'range') {
        await upsertSession(lineUserId, { step: 'await_range_start' })
        return replyMessage(replyToken, [rangeStartMessage()])
      }
      const date = choice === 'today' ? todayStr() : addDaysStr(todayStr(), 1)
      const next = await upsertSession(lineUserId, { date, date2: date, step: 'await_confirm' })
      return replyMessage(replyToken, [confirmMessage(next)])
    }
    if (data === 'hr-wiz-range-start:pick') {
      if (session?.step !== 'await_range_start' || !pickedDate) return invalid()
      await upsertSession(lineUserId, { date: pickedDate, step: 'await_range_end' })
      return replyMessage(replyToken, [rangeEndMessage(pickedDate)])
    }
    if (data === 'hr-wiz-range-end:pick') {
      if (session?.step !== 'await_range_end' || !pickedDate) return invalid()
      if (pickedDate < session.date) return replyMessage(replyToken, [{ type: 'text', text: 'วันสิ้นสุดต้องไม่ก่อนวันเริ่มครับ ลองเลือกใหม่' }, rangeEndMessage(session.date)])
      const next = await upsertSession(lineUserId, { date2: pickedDate, step: 'await_confirm' })
      return replyMessage(replyToken, [confirmMessage(next)])
    }

    // ── สลับวันหยุด: จาก (วันหยุดเดิม) -> เป็น (วันหยุดใหม่) ──
    if (data === 'hr-wiz-swap-from:pick') {
      if (session?.step !== 'await_swap_from' || !pickedDate) return invalid()
      await upsertSession(lineUserId, { date: pickedDate, step: 'await_swap_to' })
      return replyMessage(replyToken, [swapToMessage()])
    }
    if (data === 'hr-wiz-swap-to:pick') {
      if (session?.step !== 'await_swap_to' || !pickedDate) return invalid()
      const next = await upsertSession(lineUserId, { date2: pickedDate, step: 'await_confirm' })
      return replyMessage(replyToken, [confirmMessage(next)])
    }

    if (data === 'hr-wiz-confirm:yes') {
      if (session?.step !== 'await_confirm' || !staffLink) return invalid()
      const isSwap = session.leave_type === 'สลับวันหยุด'
      const now = new Date().toISOString()
      const record = {
        id: `leave-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        username: staffLink.username, employee_name: staffLink.name, leave_type: session.leave_type,
        start_date: session.date, end_date: session.date2 || session.date,
        days: isSwap ? 1 : daysBetween(session.date, session.date2 || session.date),
        reason: '', status: 'pending',
        requested_by: staffLink.name, requested_at: now,
        decided_by: '', decided_at: '', decision_note: '',
      }
      await appendRows('hr_leave', [LEAVE_HEADERS.map((h) => record[h] ?? '')])
      clearHrCache()
      await clearSession(lineUserId)
      notifyNewLeaveRequest(record).catch((e) => console.error('notifyNewLeaveRequest:', e.message))
      return replyMessage(replyToken, [{ type: 'text', text: 'ส่งคำขอแล้วครับ รอหัวหน้าอนุมัติ' }])
    }
    if (data === 'hr-wiz-confirm:no') {
      await clearSession(lineUserId)
      return replyMessage(replyToken, [{ type: 'text', text: 'ยกเลิกแล้วครับ' }])
    }
  }
}

async function opLineWebhook(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!verifySignature(req.rawBody, req.headers['x-line-signature'])) return res.status(401).end()
  const events = Array.isArray(req.body?.events) ? req.body.events : []
  for (const event of events) {
    try {
      const lineUserId = event.source?.userId
      const staffLink = lineUserId ? await findStaffLink(lineUserId) : null

      if (event.type === 'message' && event.message?.type === 'text') {
        if (staffLink) { await handleLeaveWizard(event, staffLink); continue }
        // ยังไม่ผูกเป็นพนักงาน (หรือเป็น admin) — ตอบ userId กลับไปให้ก็อปไปผูกในหน้า Settings ได้เลย ไม่ต้องเปิด log
        if (event.replyToken) await replyMessage(event.replyToken, [{ type: 'text', text: `LINE userId ของคุณคือ:\n${lineUserId || '(ไม่พบ)'}\n\nเอาไปวางที่เว็บ Payi Ops > Settings > แจ้งเตือนผ่าน LINE` }])
        continue
      }

      if (event.type !== 'postback') continue
      const data = String(event.postback?.data || '')
      if (data.startsWith('hr-wiz-')) { await handleLeaveWizard(event, staffLink); continue }

      const [, kind, id] = data.match(/^hr-(approve|reject):(.+)$/) || []
      if (!kind || !id) continue
      const decision = kind === 'approve' ? 'approved' : 'rejected'
      const links = await getSheet('hr_line_links')
      const link = links.find((l) => l.line_user_id === lineUserId)
      let decidedBy = 'LINE'
      if (link) {
        const user = (await getSheet('users')).find((u) => u.username === link.username)
        decidedBy = user?.display_name || link.username
      }
      const { record, error } = await applyLeaveDecision(id, decision, decidedBy)
      const text = error ? `ทำรายการไม่สำเร็จ: ${error}` : `${decision === 'approved' ? 'อนุมัติแล้ว' : 'ไม่อนุมัติแล้ว'}\n${leaveSummaryText(record)}`
      if (event.replyToken) await replyMessage(event.replyToken, [{ type: 'text', text }])
    } catch (e) { console.error('opLineWebhook event:', e.message) }
  }
  return res.status(200).end()
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    await readRawBody(req)
    try { req.body = JSON.parse(req.rawBody || '{}') } catch { req.body = {} }
  }
  const op = String(req.query.op || '')
  if (op === 'line-webhook') return opLineWebhook(req, res)
  if (!requireAuth(req, res)) return
  if (op === 'summary') return opSummary(req, res)
  if (op === 'sheet') return opSheet(req, res)
  if (op === 'append') return opAppend(req, res)
  if (op === 'overwrite') return opOverwrite(req, res)
  if (op === 'workforce') return opWorkforce(req, res)
  if (op === 'planner') return opPlanner(req, res)
  if (op === 'hr') return opHr(req, res)
  return res.status(400).json({ error: 'ต้องระบุ ?op=summary|sheet|append|overwrite|workforce|planner|hr|line-webhook' })
}
