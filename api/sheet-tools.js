// GET/POST /api/sheet-tools?op=summary|sheet|append|overwrite|workforce|planner|hr
// รวม 4 endpoint เครื่องมือชีตเดิม (/api/summary /api/sheet /api/append /api/overwrite)
// เป็นฟังก์ชันเดียว — Vercel Hobby จำกัด 12 serverless functions ต่อโปรเจค
import { requireAuth, cacheable, authEnabled } from './_lib/auth.js'
import { getMeta, batchGetValues, getSheet, appendRows, overwriteSheet, ensureSheet } from './_lib/sheets.js'
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
const OT_HEADERS = ['id', 'date', 'employee', 'team', 'task', 'planned_start', 'planned_end', 'planned_minutes', 'actual_start', 'actual_end', 'actual_minutes', 'status', 'reason', 'note', 'created_at', 'closed_at']
const MANPOWER_HEADERS = ['id', 'date', 'employee', 'team', 'task', 'start_time', 'end_time', 'note', 'created_at']
// ตารางพนักงานปี 2026 ที่คัดลอกมาเก็บในระบบแล้ว ทั้งบ้านล่างและออฟฟิศ
const SCHEDULE_SNAPSHOT_HEADERS = ['date', 'code', 'employee', 'group', 'fraction']
const EVENT_HEADERS = ['id', 'title', 'date', 'team', 'note', 'created_at', 'end_date', 'lead_days', 'lag_days']
const OT_HISTORY_HEADERS = ['id', 'plan_id', 'date', 'employee', 'before_start', 'before_end', 'after_start', 'after_end', 'before_note', 'after_note', 'changed_at', 'changed_by']
const OT_APPROVAL_HEADERS = ['id', 'month', 'employee', 'actual_minutes', 'approved_at', 'approved_by']
const PEOPLE_HEADERS = ['code', 'name', 'group', 'active']
const OT_LIMIT_HEADERS = ['employee', 'limit_hours', 'updated_at', 'updated_by']
const OT_APPROVAL_HISTORY_HEADERS = ['id', 'month', 'employee', 'before_minutes', 'after_minutes', 'changed_at', 'changed_by']
const LEAVE_HEADERS = ['id', 'username', 'employee_name', 'leave_type', 'start_date', 'end_date', 'days', 'reason', 'status', 'requested_by', 'requested_at', 'decided_by', 'decided_at', 'decision_note', 'backup_office']
const SCHEDULE_HEADERS = ['id', 'date', 'username', 'employee_name', 'shift_start', 'shift_end', 'role_note', 'created_at', 'created_by']
const LINE_LINK_HEADERS = ['username', 'line_user_id', 'updated_at']
const LINE_SESSION_HEADERS = ['line_user_id', 'step', 'leave_type', 'date', 'date2', 'backup_office', 'updated_at']
// โควตาวันลาพักร้อนต่อคนต่อปี — แยกชีตต่างหาก (ไม่ยุ่งกับ workforce_people) เพราะครอบคุมทั้งบ้านล่างและออฟฟิศ แก้ค่าตรงในชีตได้เลย ไม่ต้องแก้โค้ด
const QUOTA_HEADERS = ['code', 'quota', 'updated_at']
const DEFAULT_VACATION_QUOTA = 6
const NO_VACATION_GROUPS = new Set(['คนฟีด', 'พาร์ทไทม์'])
const hasVacationBenefit = (group) => !NO_VACATION_GROUPS.has(String(group || '').trim())
// รายชื่อออฟฟิศ — ย้ายจาก object hardcode มาเป็นชีต (เหมือน workforce_people) เพื่อให้เพิ่ม/ลบคนได้จากหน้าเว็บ ไม่ต้องแก้โค้ด
const OFFICE_HEADERS = ['code', 'name', 'active']
const DEFAULT_OFFICE_ROWS = [['TOON', 'ตูน', '1'], ['KED', 'เกด', '1'], ['MO', 'โม', '1']]
const HR_SHEETS = [['hr_leave', LEAVE_HEADERS], ['hr_schedule', SCHEDULE_HEADERS], ['hr_line_links', LINE_LINK_HEADERS], ['hr_line_sessions', LINE_SESSION_HEADERS], ['hr_leave_quota', QUOTA_HEADERS], ['hr_office_people', OFFICE_HEADERS], ['workforce_schedule_snapshot', SCHEDULE_SNAPSHOT_HEADERS]]
let hrEnsurePromise
let hrCache = { at: 0, data: null }
const ensureHrSheets = () => hrEnsurePromise ||= Promise.all(HR_SHEETS.map(([name, headers]) => ensureSheet(name, headers)))
const clearHrCache = () => { hrCache = { at: 0, data: null } }
const daysBetween = (start, end) => Math.round((new Date(`${end}T00:00:00`) - new Date(`${start}T00:00:00`)) / 86400000) + 1
const currentYearBKK = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }).slice(0, 4)

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
  try { await notifyLeaveDecision(record) } catch (e) { console.error('notifyLeaveDecision:', e.message) }
  return { record }
}

// แจ้งคนลากลับหลังถูกพิจารณา — คนละข้อความจาก notifyNewLeaveRequest (ที่ยิงหา admin) best-effort เหมือนกัน ห้ามทำให้การอนุมัติพัง
async function notifyLeaveDecision(record) {
  const links = await getSheet('hr_line_links')
  const link = links.find((l) => l.username === record.username && l.line_user_id)
  if (!link) return
  let balance = null
  if (record.status === 'approved' && record.leave_type === 'พักร้อน' && String(record.username || '').startsWith('mp:')) {
    try { balance = await vacationBalanceFor(record.username.slice(3)) } catch (e) { console.error('vacationBalanceFor:', e.message) }
  }
  await pushMessage(link.line_user_id, [leaveFlexMessage(record, record.status, await getOfficePeopleMap(), { balance })])
}

// รายชื่อ admin ที่ผูก LINE ไว้แล้ว (username, line_user_id) — ใช้ตอนแจ้งเตือนคำขอลาใหม่
async function getAdminLineTargets() {
  const [users, links] = await Promise.all([getSheet('users'), getSheet('hr_line_links')])
  const linkByUsername = Object.fromEntries(links.filter((l) => l.username && l.line_user_id).map((l) => [l.username, l.line_user_id]))
  return users.filter((u) => (u.role || 'staff') === 'admin' && linkByUsername[u.username]).map((u) => ({ username: u.username, line_user_id: linkByUsername[u.username] }))
}

const backupOfficeLine = (l, officeMap) => l.backup_office && officeMap[l.backup_office] ? `\nคนออฟฟิศทดแทน: ${officeMap[l.backup_office][0]}` : ''
const leaveSummaryText = (l, officeMap = {}) => l.leave_type === 'สลับวันหยุด'
  ? `${l.employee_name} ขอสลับวันหยุด จาก ${l.start_date} เป็น ${l.end_date}${l.reason ? `\nเหตุผล: ${l.reason}` : ''}${backupOfficeLine(l, officeMap)}`
  : `${l.employee_name} ขอลา${l.leave_type}\n${l.start_date}${Number(l.days) === 0.5 ? ' (ครึ่งวัน)' : l.end_date !== l.start_date ? ` – ${l.end_date}` : ''} · ${l.days} วัน${l.reason ? `\nเหตุผล: ${l.reason}` : ''}${backupOfficeLine(l, officeMap)}`

const LINE_LEAVE_THEME = {
  pending: { hero: '#C85A10', soft: '#FFE8AD', accent: '#A84400', title: 'คำขอลาใหม่', status: 'รออนุมัติ', icon: '⏰' },
  submitted: { hero: '#C85A10', soft: '#FFE8AD', accent: '#A84400', title: 'ยังรออนุมัติอยู่นะคะ', status: 'รอหัวหน้าอนุมัติ', icon: '⏰' },
  approved: { hero: '#155B35', soft: '#E7F7ED', accent: '#087044', title: 'คำขอลาได้รับการอนุมัติ', status: 'อนุมัติแล้ว', icon: '✅' },
  rejected: { hero: '#842E2E', soft: '#FFF0EF', accent: '#B83F3F', title: 'คำขอลายังไม่ผ่าน', status: 'ไม่อนุมัติ', icon: '✕' },
}
const flexText = (text, options = {}) => ({ type: 'text', text: String(text ?? ''), color: '#17243B', size: 'sm', wrap: true, scaling: true, ...options })
const lineDate = (date) => date ? new Date(`${date}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' }) : '—'
const lineCompactDate = (date) => date ? new Date(`${date}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'Asia/Bangkok' }) : '—'
const lineDateRange = (record) => record.start_date === record.end_date
  ? lineDate(record.start_date)
  : `${lineDate(record.start_date)} – ${lineDate(record.end_date)}`
const factRow = (label, value) => ({
  type: 'box', layout: 'horizontal', spacing: 'md',
  contents: [flexText(label, { size: 'xs', color: '#6A788E', flex: 2 }), flexText(value, { size: 'sm', weight: 'bold', align: 'end', flex: 4 })],
})
const leaveTypeIcon = (type) => ({ 'พักร้อน': '🏖️', 'ลากิจ': '📌', 'ลาป่วย': '🏥', 'ขาดงาน': '⚠️', 'สลับวันหยุด': '🔁' }[type] || '📅')
const summaryTile = (label, value, backgroundColor, valueColor = '#17243B') => ({
  type: 'box', layout: 'vertical', flex: 1, paddingAll: '10px', cornerRadius: '10px', backgroundColor, alignItems: 'center',
  contents: [
    flexText(value, { size: 'xs', weight: 'bold', color: valueColor, align: 'center', wrap: false, adjustMode: 'shrink-to-fit' }),
    flexText(label, { size: 'xxs', color: '#7B8799', align: 'center', margin: 'xs', wrap: false, adjustMode: 'shrink-to-fit' }),
  ],
})

// การ์ดเดียวกันทั้งแจ้ง admin และแจ้งผลกลับหาพนักงาน เพื่อให้สถานะอ่านได้เหมือนกันทุกจุด
const leaveFlexMessage = (record, variant = 'pending', officeMap = {}, { balance = null } = {}) => {
  const theme = LINE_LEAVE_THEME[variant] || LINE_LEAVE_THEME.pending
  const isSwap = record.leave_type === 'สลับวันหยุด'
  const facts = [factRow(isSwap ? 'วันหยุดเดิม → ใหม่' : 'วันที่ลา', isSwap ? `${lineDate(record.start_date)} → ${lineDate(record.end_date)}` : lineDateRange(record))]
  if (record.reason) facts.push(factRow('เหตุผล', record.reason))
  if (record.backup_office) facts.push(factRow('คนทดแทน', officeMap[record.backup_office]?.[0] || record.backup_office))
  if (record.decision_note) facts.push(factRow('หมายเหตุ', record.decision_note))
  if (balance) facts.push(factRow('พักร้อนคงเหลือ', `${balance.remaining} / ${balance.quota} วัน`))

  const bubble = {
    type: 'bubble', size: 'kilo',
    header: { type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'md', backgroundColor: theme.hero, contents: [
      { type: 'separator', color: '#D7B66B' },
      { type: 'box', layout: 'horizontal', alignItems: 'center', spacing: 'md', contents: [
        { type: 'box', layout: 'vertical', width: '42px', height: '42px', cornerRadius: '12px', backgroundColor: '#FFFFFF22', justifyContent: 'center', alignItems: 'center', contents: [flexText(theme.icon, { size: 'xl', align: 'center', color: '#FFFFFF' })] },
        { type: 'box', layout: 'vertical', flex: 1, contents: [
          flexText(theme.title, { color: '#FFFFFF', size: 'lg', weight: 'bold' }),
          flexText(record.employee_name || 'พนักงาน', { color: '#F3E5D7', size: 'xs', margin: 'sm' }),
        ] },
      ] },
    ] },
    body: { type: 'box', layout: 'vertical', paddingAll: '14px', spacing: 'md', contents: [
      { type: 'box', layout: 'horizontal', spacing: 'sm', contents: [
        summaryTile('ประเภท', `${leaveTypeIcon(record.leave_type)} ${record.leave_type}`, '#FFF3C4', '#9A4300'),
        summaryTile('จำนวน', `${record.days} วัน`, theme.soft, theme.accent),
        summaryTile('วันเริ่ม', lineCompactDate(record.start_date), '#FFF8E8', '#7C4A12'),
      ] },
      { type: 'separator', color: '#E3EAF2' },
      { type: 'box', layout: 'vertical', spacing: 'sm', contents: facts },
    ] },
  }
  if (variant === 'pending') bubble.footer = { type: 'box', layout: 'horizontal', spacing: 'sm', paddingAll: '12px', contents: [
    { type: 'button', style: 'secondary', color: '#F7DCDC', height: 'sm', scaling: true, action: { type: 'postback', label: 'ไม่อนุมัติ', data: `hr-reject:${record.id}`, displayText: 'ไม่อนุมัติคำขอลา' } },
    { type: 'button', style: 'primary', color: '#18A47B', height: 'sm', scaling: true, action: { type: 'postback', label: 'อนุมัติ', data: `hr-approve:${record.id}`, displayText: 'อนุมัติคำขอลา' } },
  ] }
  return { type: 'flex', altText: `${theme.title}: ${leaveSummaryText(record, officeMap)}`.slice(0, 400), contents: bubble }
}

// แจ้งเตือน admin ที่ผูก LINE ไว้ทุกคน พร้อมปุ่มอนุมัติ/ปฏิเสธ — best-effort ล้วนๆ ห้ามทำให้คำขอลาพัง แม้ LINE ล่ม
async function notifyNewLeaveRequest(record) {
  const targets = await getAdminLineTargets()
  if (!targets.length) return
  const officeMap = await getOfficePeopleMap()
  const message = leaveFlexMessage(record, 'pending', officeMap)
  await Promise.all(targets.map((t) => pushMessage(t.line_user_id, [message])))
}

async function notifyNewLeaveRequestSafely(record) {
  try { await notifyNewLeaveRequest(record) } catch (e) { console.error('notifyNewLeaveRequest:', e.message) }
}

const PLANNER_CONFIG_SHEET = 'planner_config'
const PLANNER_DAILY_SHEET = 'planner_daily'
const PLANNER_CONFIG_HEADERS = ['master_sku', 'enabled', 'reserve_days', 'safety_percent', 'updated_at', 'updated_by']
const PLANNER_DAILY_HEADERS = ['id', 'date', 'master_sku', 'fg', 'sales_average', 'demand_mode', 'recommended_feed', 'planned_feed', 'feeders', 'updated_at', 'updated_by']
const WORKFORCE_SHEETS = [['workforce_ot', OT_HEADERS], ['workforce_manpower', MANPOWER_HEADERS], ['workforce_events', EVENT_HEADERS], ['workforce_ot_history', OT_HISTORY_HEADERS], ['workforce_ot_approvals', OT_APPROVAL_HEADERS], ['workforce_people', PEOPLE_HEADERS], ['workforce_ot_limits', OT_LIMIT_HEADERS], ['workforce_ot_approval_history', OT_APPROVAL_HISTORY_HEADERS], ['workforce_schedule_snapshot', SCHEDULE_SNAPSHOT_HEADERS]]
let workforceEnsurePromise
let workforceCache = { at: 0, data: null }
const ensureWorkforceSheets = () => workforceEnsurePromise ||= Promise.all(WORKFORCE_SHEETS.map(([name, headers]) => ensureSheet(name, headers)))
// กลุ่มพื้นเหลืองในไฟล์ต้นฉบับ (TOON/KED/MO) เป็นอีกหน่วยงาน (ออฟฟิศ) ไม่ใช่บ้านล่าง — ไม่ต้องเพิ่มแถวใน workforce_people ให้กลุ่มนั้น จึงไม่ถูกดึงเข้าปฏิทินนี้
// รายชื่อบ้านล่างตอนเริ่มระบบ ใช้ seed แท็บ workforce_people ครั้งแรกเท่านั้น — หลังจากนี้แก้/เพิ่มคนได้ตรงในชีตเลย ไม่ต้องแก้โค้ด
const DEFAULT_PEOPLE_ROWS = [['TANG', 'แตง', 'คนแพ็ก', '1'], ['PANG', 'แป้ง', 'คนแพ็ก', '1'], ['FAH', 'ฟ้า', 'คนแพ็ก', '1'], ['MII', 'มี่', 'คนแพ็ก', '1'], ['PANID', 'ป้านิด', 'คนฟีด', '1'], ['MOM', 'แม่', 'คนฟีด', '1'], ['MAPRANG', 'มะปราง', 'พาร์ทไทม์', '1'], ['ATOM', 'อะตอม', 'อื่น ๆ', '1'], ['BAS', 'บาส', 'อื่น ๆ', '1'], ['NEOY', 'เนย', 'อื่น ๆ', '1']]
const rowsToObjects = (values = []) => { const [headers, ...rows] = values; return headers ? rows.map((row) => Object.fromEntries(headers.map((h, i) => [h, row[i] ?? '']))) : [] }
// workforce_ot_approvals/workforce_ot_limits เป็น append-only log (ไม่ overwrite แถวเดิม) — กัน race condition ตอนแก้พร้อมกันหลายเครื่อง
// อ่านตอน GET ต้องลดเหลือ "ล่าสุดต่อ key" เอง
const latestByKey = (rows, keyFn, timeField) => { const map = new Map(); for (const r of rows) { const k = keyFn(r); const prev = map.get(k); if (!prev || String(r[timeField]) >= String(prev[timeField])) map.set(k, r) } return [...map.values()] }
const requireAdmin = (req, res) => { if (authEnabled() && req.user?.role !== 'admin') { res.status(403).json({ error: 'ต้องเป็น admin เท่านั้น' }); return false } return true }
const clearWorkforceCache = () => { workforceCache = { at: 0, data: null } }

async function getPersonMap() {
  const people = await getSheet('workforce_people')
  if (!people.length) { await appendRows('workforce_people', DEFAULT_PEOPLE_ROWS); return getPersonMap() }
  const map = Object.fromEntries(DEFAULT_PEOPLE_ROWS.map(([code, name, group]) => [code, [name, group]]))
  for (const p of people) {
    if (!p.code) continue
    const code = String(p.code).toUpperCase()
    if (String(p.active) === '0') { delete map[code]; continue } // ลบออกแล้ว (soft-delete จากปุ่มในหน้าเว็บ) — ตัดออกจาก roster ทุกที่
    const forcedName = code === 'PANID' ? 'ป้านิด' : code === 'MOM' ? 'แม่' : ''
    // เดิมล็อกกลุ่มของ PANID/MOM ให้เป็น "คนฟีด" เสมอ แก้ในชีตไม่มีผล — ทำให้เปลี่ยนเป็นพาร์ทไทม์ (ตัดออกจากโควตาพักร้อน) ไม่ได้เลย
    // เลิกล็อก ให้กลุ่มตามชีตจริง — ปฏิทิน OT ยังจับ PANID/MOM เป็นคนฟีดถูกต้องอยู่ดี เพราะเช็คจาก code ตรงๆ ด้วย ไม่ได้เช็คแค่ group (ดู WorkforceOT.jsx feedManpower)
    map[code] = [forcedName || p.name || map[code]?.[0] || code, p.group || 'อื่น ๆ']
  }
  return map
}

// กลุ่มออฟฟิศ — ชีตแยกจาก workforce_people (จงใจไม่รวม เพราะไม่ต้องการให้ขึ้นปฏิทิน Manpower & OT/ นับ headcount บ้านล่าง)
// เพิ่ม/ลบคนได้จากปุ่มในหน้าเว็บ (action add-employee/remove-employee, group='ออฟฟิศ') — ลบ = ตั้ง active='0' ไม่ลบแถวทิ้งจริง กันประวัติ leave หาย
async function getOfficePeopleMap() {
  const rows = await getSheet('hr_office_people')
  if (!rows.length) { await appendRows('hr_office_people', DEFAULT_OFFICE_ROWS); return getOfficePeopleMap() }
  const map = {}
  for (const r of rows) {
    if (!r.code) continue
    if (String(r.active) === '0') continue
    map[String(r.code).toUpperCase()] = [r.name || r.code, 'ออฟฟิศ']
  }
  return map
}
// คนหนึ่งคนสำหรับระบบลา/LINE — เช็ค workforce_people ก่อน (บ้านล่าง) แล้วค่อย fallback ไปกลุ่มออฟฟิศ
async function findHrPerson(code) {
  const normalizedCode = String(code || '').toUpperCase()
  const fromSheet = (await getSheet('workforce_people')).find((p) => String(p.code || '').toUpperCase() === normalizedCode && String(p.active) !== '0')
  if (fromSheet) return { code: normalizedCode, name: fromSheet.name, group: fromSheet.group || 'อื่น ๆ' }
  const officeMap = await getOfficePeopleMap()
  const extra = officeMap[normalizedCode]
  return extra ? { code: normalizedCode, name: extra[0], group: extra[1] } : null
}

// ── โควตาวันลาพักร้อน ──
async function getQuotaMap() {
  const rows = await getSheet('hr_leave_quota')
  return Object.fromEntries(rows.filter((r) => r.code).map((r) => [String(r.code).toUpperCase(), Number(r.quota) || DEFAULT_VACATION_QUOTA]))
}
// เหลือกี่วันพักร้อนของคนนี้ปีนี้ — นับจาก hr_leave ที่ status=approved, leave_type=พักร้อน, ปีปฏิทินเดียวกัน (ตาม start_date)
async function vacationBalanceFor(code) {
  const [leaveRows, quotaMap, person] = await Promise.all([getSheet('hr_leave'), getQuotaMap(), findHrPerson(code)])
  if (person && !hasVacationBenefit(person.group)) return { eligible: false, quota: 0, used: 0, remaining: 0 }
  const year = currentYearBKK()
  const used = leaveRows
    .filter((l) => l.status === 'approved' && l.leave_type === 'พักร้อน' && l.username === `mp:${code}` && String(l.start_date || '').slice(0, 4) === year)
    .reduce((s, l) => s + (Number(l.days) || 0), 0)
  const quota = quotaMap[code] ?? DEFAULT_VACATION_QUOTA
  return { eligible: true, quota, used, remaining: Math.max(0, quota - used) }
}
// สรุปโควตาพักร้อนทุกคน — includeOffice=false ตัดกลุ่มออฟฟิศออก (ผจก.บ้านล่างไม่ต้องเห็น)
// คนฟีดและพาร์ทไทม์ไม่มีโควตาพักร้อน — ตัดออกจากการ์ดนี้และทุก flow ที่ขอพักร้อน
async function computeLeaveBalances(leaveRows, includeOffice) {
  const [personMap, quotaMap, officeMap] = await Promise.all([getPersonMap(), getQuotaMap(), includeOffice ? getOfficePeopleMap() : {}])
  const year = currentYearBKK()
  const roster = [
    ...Object.entries(personMap).map(([code, [name, group]]) => ({ code, name, group })),
    ...(includeOffice ? Object.entries(officeMap).map(([code, [name, group]]) => ({ code, name, group })) : []),
  ].filter((p) => hasVacationBenefit(p.group))
  return roster.map((p) => {
    const used = leaveRows
      .filter((l) => l.status === 'approved' && l.leave_type === 'พักร้อน' && l.username === `mp:${p.code}` && String(l.start_date || '').slice(0, 4) === year)
      .reduce((s, l) => s + (Number(l.days) || 0), 0)
    const quota = quotaMap[p.code] ?? DEFAULT_VACATION_QUOTA
    return { code: p.code, name: p.name, group: p.group, quota, used, remaining: Math.max(0, quota - used) }
  })
}

// ── เช็คคนเหลือบ้านล่างต่อวันจาก hr_leave และตารางภายในระบบ ──
const LOWER_HOUSE_MIN_HEADCOUNT = 3
async function isValidOfficeCode(code) { return Boolean((await getOfficePeopleMap())[String(code || '').toUpperCase()]) }
// วันที่ที่ "หาย" จากบ้านล่างจริง — สลับวันหยุดหายแค่วันใหม่ (end_date) วันเดิม (start_date) มาทำงานตามปกติ ไม่หาย
function leaveAbsenceDates(l) {
  if (l.leave_type === 'สลับวันหยุด') return l.end_date ? [l.end_date] : []
  const start = l.start_date; const end = l.end_date || l.start_date
  if (!start) return []
  const dates = []
  for (let d = start; d <= end && dates.length <= 366; d = addDaysStr(d, 1)) dates.push(d)
  return dates
}
// เหลือกี่คนบ้านล่างวันนั้น หลังหักคนลา (pending+approved จาก hr_leave) + extraAbsentCode (คนที่กำลังจะลาแต่ยังไม่ append)
async function lowerHouseRemaining(date, { extraAbsentCode } = {}) {
  const [personMap, leaveRows] = await Promise.all([getPersonMap(), getSheet('hr_leave')])
  const roster = Object.keys(personMap)
  const absentCodes = new Set(extraAbsentCode ? [extraAbsentCode] : [])
  for (const l of leaveRows) {
    if (!['pending', 'approved'].includes(l.status)) continue
    if (!String(l.username || '').startsWith('mp:')) continue
    const code = l.username.slice(3)
    if (!roster.includes(code)) continue
    if (leaveAbsenceDates(l).includes(date)) absentCodes.add(code)
  }
  return roster.length - absentCodes.size
}
// คืนวันไหนบ้างที่จะเหลือคนน้อยกว่าขั้นต่ำ ถ้าคนบ้านล่างคนนี้ลาช่วงนี้จริง — เช็คเฉพาะ username แบบ mp:<code> ที่อยู่ใน roster บ้านล่างเท่านั้น (office/login user ไม่กระทบ)
async function findLockedDates(username, absenceDates) {
  if (!String(username || '').startsWith('mp:')) return []
  const code = username.slice(3)
  const personMap = await getPersonMap()
  if (!(code in personMap)) return []
  const locked = []
  for (const date of absenceDates) {
    const remaining = await lowerHouseRemaining(date, { extraAbsentCode: code })
    if (remaining < LOWER_HOUSE_MIN_HEADCOUNT) locked.push(date)
  }
  return locked
}
// ถ้าล็อค ต้องมี backup_office ที่ถูกต้อง (คนออฟฟิศ) ก่อนถึงจะให้ลาผ่าน — ใช้ร่วมกันทั้งเว็บ (opHrInner) และ LINE wizard
async function resolveBackupOffice(username, absenceDates, backupOfficeCode) {
  const lockedDates = await findLockedDates(username, absenceDates)
  if (!lockedDates.length) return { ok: true, lockedDates: [], backupOffice: '' }
  const code = String(backupOfficeCode || '').trim().toUpperCase()
  if (!(await isValidOfficeCode(code))) return { ok: false, lockedDates, error: `วันที่ ${lockedDates.join(', ')} บ้านล่างเหลือคนน้อยกว่า ${LOWER_HOUSE_MIN_HEADCOUNT} คน ต้องเลือกคนออฟฟิศมาทดแทนก่อนครับ` }
  return { ok: true, lockedDates, backupOffice: code }
}

// code (บ้านล่าง, mp:<code>) -> Set(วันที่ลาอนุมัติแล้ว)
function buildLeaveAbsenceMap(leaveRows) {
  const absenceByCode = {}
  for (const l of leaveRows) {
    if (l.status !== 'approved') continue
    if (!String(l.username || '').startsWith('mp:')) continue
    const code = l.username.slice(3)
    for (const date of leaveAbsenceDates(l)) (absenceByCode[code] ||= new Set()).add(date)
  }
  return absenceByCode
}
// fallback เมื่อยังไม่มีตารางพนักงาน — สมมติทุกคนมาทำงานทุกวัน ยกเว้นวันที่มีคำขอลาอนุมัติแล้ว
function generateCalendarPresence(personMap, leaveRows) {
  const absenceByCode = buildLeaveAbsenceMap(leaveRows)
  const roster = Object.entries(personMap).map(([code, [name, group]]) => ({ code, name, group }))
  const start = new Date(`${todayStr()}T00:00:00`); start.setDate(start.getDate() - 90)
  const end = new Date(`${todayStr()}T00:00:00`); end.setDate(end.getDate() + 180)
  const result = []
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    for (const p of roster) {
      if (absenceByCode[p.code]?.has(date)) continue
      result.push({ id: `internal-${date}-${p.code}`, date, employee: p.name, code: p.code, group: p.group, fraction: 1, source: 'internal' })
    }
  }
  return result
}
// ปฏิทินบ้านล่างใช้ตารางพนักงานปี 2026 ในระบบ และกรองแถวออฟฟิศออกด้วย roster บ้านล่าง
// ถ้ามีคำขอลาอนุมัติผ่านระบบ ให้ยึด hr_leave แทนตารางตั้งต้น
async function getCalendarPresence(personMap) {
  const [snapshotRows, leaveRows] = await Promise.all([getSheet('workforce_schedule_snapshot'), getSheet('hr_leave')])
  if (!snapshotRows.length) return generateCalendarPresence(personMap, leaveRows)
  const baseRows = snapshotRows
    .filter((r) => personMap[String(r.code || '').toUpperCase()])
    .map((r) => ({ id: `stored-${r.date}-${r.code}`, date: r.date, employee: r.employee, code: r.code, group: r.group, fraction: Number(r.fraction) || 1, source: 'stored' }))
  const absenceByCode = buildLeaveAbsenceMap(leaveRows)
  return baseRows.filter((r) => !absenceByCode[r.code]?.has(r.date))
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
      const sourceManpower = await getCalendarPresence(personMap)
      return res.status(200).json({ success: true, sourceManpower, sourceYear: '2026' })
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
    const personMap = await getPersonMap() // ต้องผ่าน getPersonMap() ไม่ใช่ build จาก people ตรงๆ — เผื่อชีตยังไม่มีแถวของบางคน (เช่น MOM/PANID) ต้อง fallback ไป DEFAULT_PEOPLE_ROWS ไม่งั้นหายจากปฏิทิน
    const otLimits = Object.fromEntries(limits.filter((l) => l.employee).map((l) => [l.employee, l.limit_hours]))
    let sourceManpower = []
    let officePeople = []; let officeAbsences = []
    try {
      sourceManpower = await getCalendarPresence(personMap)
      const [leaveRows, officeMap] = await Promise.all([getSheet('hr_leave'), getOfficePeopleMap()])
      officePeople = Object.entries(officeMap).map(([code, [name]]) => ({ code, name }))
      for (const l of leaveRows) {
        if (!['pending', 'approved'].includes(l.status)) continue
        if (!String(l.username || '').startsWith('mp:')) continue
        const code = l.username.slice(3)
        if (!officeMap[code]) continue
        for (const date of leaveAbsenceDates(l)) officeAbsences.push({ code, date })
      }
    } catch (e) { console.error('office presence:', e.message) }
    res.setHeader('Cache-Control', cacheable('public, s-maxage=20, stale-while-revalidate=60'))
    const data = { success: true, rows: rows.sort((a, b) => String(b.date).localeCompare(String(a.date))), manpower, sourceManpower, events, history, approvals, approvalHistory, otLimits, people, officePeople, officeAbsences, sourceYear: '2026' }
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
    try {
      const personMap = await getPersonMap()
      const dayManpower = (await getCalendarPresence(personMap)).filter((r) => r.date === body.date)
      if (dayManpower.length) {
        const absent = employees.filter((employee) => !dayManpower.some((r) => manpowerNameMatches(employee, r.employee)))
        if (absent.length) return res.status(400).json({ error: `วันนี้ลาอยู่ (หรือไม่มีในรายชื่อ): ${absent.join(', ')}` })
      }
    } catch (e) { return res.status(503).json({ error: `ตรวจสอบ Manpower ไม่สำเร็จ กรุณาลองใหม่: ${e.message}` }) }
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
    const leadDays = Math.max(0, Math.round(Number(body.lead_days) || 0))
    const lagDays = Math.max(0, Math.round(Number(body.lag_days) || 0))
    await appendRows('workforce_events', [[`event-${Date.now()}`, body.title, body.date, body.team || 'ทุกทีม', body.note || '', new Date().toISOString(), endDate, leadDays, lagDays]])
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
    // ผจก. (ไม่ใช่ admin) เห็นแค่โควตาบ้านล่าง ไม่เห็นออฟฟิศ — เช็คทุกครั้งแม้ตอน cache hit เพราะ hrCache ใช้ร่วมกันข้าม request/role
    const isAdminViewer = !authEnabled() || req.user?.role === 'admin'
    const withRoleFilter = (data) => ({ ...data, leaveBalances: isAdminViewer ? data.leaveBalancesFull : data.leaveBalancesFull.filter((b) => b.group !== 'ออฟฟิศ') })
    if (hrCache.data && Date.now() - hrCache.at < 20000) return res.status(200).json(withRoleFilter(hrCache.data))
    const [leaveRange, scheduleRange, lineLinkRange, peopleRange, snapshotRange] = await batchGetValues(['hr_leave!A:Z', 'hr_schedule!A:Z', 'hr_line_links!A:Z', 'workforce_people!A:Z', 'workforce_schedule_snapshot!A:Z'])
    // เดือนที่แต่ละคนมีงานจริงจากตารางปี 2026 ที่เก็บในระบบ ใช้กรอง dropdown โดยไม่เชื่อมไฟล์ภายนอก
    let activeMonths = {}
    try {
      const manpowerRows = rowsToObjects(snapshotRange.values || [])
      for (const r of manpowerRows) (activeMonths[r.code] ||= new Set()).add(String(r.date).slice(0, 7))
      activeMonths = Object.fromEntries(Object.entries(activeMonths).map(([code, set]) => [code, [...set]]))
    } catch (e) { console.error('activeMonths:', e.message) }
    const peopleFromSheet = rowsToObjects(peopleRange.values || []).filter((p) => String(p.active) !== '0')
    const officeMapForList = await getOfficePeopleMap()
    const extraPeople = Object.entries(officeMapForList).map(([code, [name, group]]) => ({ code, name, group }))
    const leaveRows = rowsToObjects(leaveRange.values || [])
    const leaveBalancesFull = await computeLeaveBalances(leaveRows, true)
    const data = { success: true, leave: leaveRows, schedule: rowsToObjects(scheduleRange.values || []), lineLinks: rowsToObjects(lineLinkRange.values || []), people: [...peopleFromSheet, ...extraPeople], activeMonths, leaveBalancesFull }
    res.setHeader('Cache-Control', cacheable('public, s-maxage=20, stale-while-revalidate=60'))
    hrCache = { at: Date.now(), data }
    return res.status(200).json(withRoleFilter(data))
  }
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' })
  const body = req.body || {}
  const action = String(body.action || '').trim().toLowerCase()

  if (action === 'check-leave-lock') {
    const code = String(body.employee_code || '').trim()
    if (!code) return res.status(200).json({ success: true, locked: false, lockedDates: [] })
    const isSwap = body.leave_type === 'สลับวันหยุด'
    const halfDay = Boolean(body.half_day) && !isSwap
    const endDate = halfDay ? body.start_date : body.end_date
    const absenceDates = leaveAbsenceDates({ leave_type: body.leave_type, start_date: body.start_date, end_date: endDate })
    const lockedDates = await findLockedDates(`mp:${code}`, absenceDates)
    return res.status(200).json({ success: true, locked: lockedDates.length > 0, lockedDates })
  }

  if (action === 'add-employee') {
    if (!requireAdmin(req, res)) return
    const code = String(body.code || '').trim().toUpperCase()
    const name = String(body.name || '').trim()
    const group = String(body.group || '').trim() || 'อื่น ๆ'
    if (!code || !name) return res.status(400).json({ success: false, error: 'กรุณาระบุรหัสและชื่อ' })
    if (group === 'ออฟฟิศ') {
      const current = await getSheet('hr_office_people')
      const existing = current.find((r) => String(r.code).toUpperCase() === code)
      if (existing && String(existing.active) !== '0') return res.status(400).json({ success: false, error: 'มีรหัสนี้อยู่แล้ว' })
      if (existing) {
        const next = current.map((r) => String(r.code).toUpperCase() === code ? { ...r, name, active: '1' } : r)
        await overwriteSheet('hr_office_people', OFFICE_HEADERS, next.map((r) => OFFICE_HEADERS.map((h) => r[h] ?? '')))
      } else {
        await appendRows('hr_office_people', [[code, name, '1']])
      }
    } else {
      const current = await getSheet('workforce_people')
      const existing = current.find((r) => String(r.code).toUpperCase() === code)
      if (existing && String(existing.active) !== '0') return res.status(400).json({ success: false, error: 'มีรหัสนี้อยู่แล้ว' })
      if (existing) {
        const next = current.map((r) => String(r.code).toUpperCase() === code ? { ...r, name, group, active: '1' } : r)
        await overwriteSheet('workforce_people', PEOPLE_HEADERS, next.map((r) => PEOPLE_HEADERS.map((h) => r[h] ?? '')))
      } else {
        await appendRows('workforce_people', [[code, name, group, '1']])
      }
    }
    clearHrCache(); clearWorkforceCache()
    return res.status(200).json({ success: true })
  }
  if (action === 'edit-employee-group') {
    if (!requireAdmin(req, res)) return
    const code = String(body.code || '').trim().toUpperCase()
    const group = String(body.group || '').trim()
    if (!code || !group) return res.status(400).json({ success: false, error: 'กรุณาระบุรหัสและกลุ่ม' })
    const current = await getSheet('workforce_people')
    if (!current.some((r) => String(r.code).toUpperCase() === code)) return res.status(404).json({ success: false, error: 'ไม่พบพนักงานนี้ (แก้กลุ่มได้เฉพาะบ้านล่าง)' })
    const next = current.map((r) => String(r.code).toUpperCase() === code ? { ...r, group } : r)
    await overwriteSheet('workforce_people', PEOPLE_HEADERS, next.map((r) => PEOPLE_HEADERS.map((h) => r[h] ?? '')))
    clearHrCache(); clearWorkforceCache()
    return res.status(200).json({ success: true })
  }
  if (action === 'remove-employee') {
    if (!requireAdmin(req, res)) return
    const code = String(body.code || '').trim().toUpperCase()
    const group = String(body.group || '').trim()
    if (!code) return res.status(400).json({ success: false, error: 'กรุณาระบุรหัส' })
    if (group === 'ออฟฟิศ') {
      const current = await getSheet('hr_office_people')
      if (!current.some((r) => String(r.code).toUpperCase() === code)) return res.status(404).json({ success: false, error: 'ไม่พบพนักงานนี้' })
      const next = current.map((r) => String(r.code).toUpperCase() === code ? { ...r, active: '0' } : r)
      await overwriteSheet('hr_office_people', OFFICE_HEADERS, next.map((r) => OFFICE_HEADERS.map((h) => r[h] ?? '')))
    } else {
      const current = await getSheet('workforce_people')
      if (!current.some((r) => String(r.code).toUpperCase() === code)) return res.status(404).json({ success: false, error: 'ไม่พบพนักงานนี้' })
      const next = current.map((r) => String(r.code).toUpperCase() === code ? { ...r, active: '0' } : r)
      await overwriteSheet('workforce_people', PEOPLE_HEADERS, next.map((r) => PEOPLE_HEADERS.map((h) => r[h] ?? '')))
    }
    clearHrCache(); clearWorkforceCache()
    return res.status(200).json({ success: true })
  }

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
      if (body.leave_type === 'พักร้อน' && !hasVacationBenefit(person.group)) return res.status(400).json({ success: false, error: `${person.group}ไม่มีสิทธิ์วันลาพักร้อน` })
      username = `mp:${code}`
      employeeName = person.name
    } else {
      username = actorUsername() || 'boss'
      employeeName = actorName()
    }

    const absenceDates = leaveAbsenceDates({ leave_type: body.leave_type, start_date: body.start_date, end_date: endDate })
    const backupCheck = await resolveBackupOffice(username, absenceDates, body.backup_office)
    if (!backupCheck.ok) return res.status(400).json({ success: false, error: backupCheck.error, lockedDates: backupCheck.lockedDates, needBackupOffice: true })

    const now = new Date().toISOString()
    const record = {
      id: `leave-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      username, employee_name: employeeName, leave_type: body.leave_type,
      start_date: body.start_date, end_date: endDate,
      days: isSwap ? 1 : halfDay ? 0.5 : daysBetween(body.start_date, endDate),
      reason: body.reason || '', status: 'pending',
      requested_by: actorName(), requested_at: now,
      decided_by: '', decided_at: '', decision_note: '',
      backup_office: backupCheck.backupOffice || '',
    }
    await appendRows('hr_leave', [LEAVE_HEADERS.map((h) => record[h] ?? '')])
    clearHrCache()
    await notifyNewLeaveRequestSafely(record)
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
      // ค่าล่าสุดต่อ SKU ก่อนหรือเท่ากับวันที่ขอ — ใช้ carry-forward FG ที่ยังไม่กรอกของวันนี้ แทนที่จะให้เห็น 0 เปล่าๆ
      const latestBySku = {}
      if (date) {
        for (const row of allDaily) {
          if (!row.master_sku || row.date > date) continue
          const prev = latestBySku[row.master_sku]
          if (!prev || row.date > prev.date) latestBySku[row.master_sku] = row
        }
      }
      res.setHeader('Cache-Control', 'no-store')
      return res.status(200).json({ success: true, config, daily, latestBySku })
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

    // อัปเดตเฉพาะแถว (date|sku) ที่ส่งมาจริง ห้ามลบแถววันเดียวกันของ SKU อื่นที่ไม่ได้ส่งมา (เช่น SKU ที่ถูกปิดชั่วคราว) — เดิมกรองด้วย row.date !== saveDate ทำให้ FG ของ SKU ที่ถูกปิดหายไปทั้งวัน พอเปิดกลับมาเลยเห็น FG เป็น 0
    const currentDaily = await getSheet(PLANNER_DAILY_SHEET)
    const incomingKeys = new Set(daily.map((row) => row.id))
    const keptDaily = currentDaily.filter((row) => !incomingKeys.has(row.id))
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
const typeQuickReplyMessage = (staffLink) => {
  const leaveTypes = staffLink && !hasVacationBenefit(staffLink.group) ? LEAVE_TYPES_LINE.filter((type) => type !== 'พักร้อน') : LEAVE_TYPES_LINE
  return { type: 'text', text: 'ลาประเภทไหนครับ?', quickReply: { items: leaveTypes.map((type) => ({ type: 'action', action: { type: 'postback', label: type, data: `hr-wiz-type:${type}`, displayText: type } })) } }
}
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
  const dateLabel = isSwap
    ? `${thaiDateLabel(session.date)} → ${thaiDateLabel(session.date2)}`
    : isRange ? `${thaiDateLabel(session.date)} – ${thaiDateLabel(session.date2)}` : thaiDateLabel(session.date)
  const days = isSwap ? 1 : daysBetween(session.date, session.date2 || session.date)
  return { type: 'flex', altText: `ยืนยัน${session.leave_type} ${dateLabel}`, contents: {
    type: 'bubble', size: 'kilo',
    header: { type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'md', backgroundColor: '#C85A10', contents: [
      { type: 'separator', color: '#FFD36A' },
      { type: 'box', layout: 'horizontal', alignItems: 'center', spacing: 'md', contents: [
        { type: 'box', layout: 'vertical', width: '42px', height: '42px', cornerRadius: '12px', backgroundColor: '#FFFFFF22', justifyContent: 'center', alignItems: 'center', contents: [flexText('📝', { size: 'xl', align: 'center', color: '#FFFFFF' })] },
        { type: 'box', layout: 'vertical', flex: 1, contents: [
          flexText('ตรวจสอบก่อนส่ง', { color: '#FFFFFF', size: 'lg', weight: 'bold' }),
          flexText('เช็กข้อมูลอีกครั้งนะคะ', { color: '#F3E5D7', size: 'xs', margin: 'sm' }),
        ] },
      ] },
    ] },
    body: { type: 'box', layout: 'vertical', paddingAll: '14px', spacing: 'md', contents: [
      { type: 'box', layout: 'horizontal', spacing: 'sm', contents: [
        summaryTile('ประเภท', `${leaveTypeIcon(session.leave_type)} ${session.leave_type}`, '#FFF3C4', '#9A4300'),
        summaryTile('จำนวน', `${days} วัน`, '#FFE8AD', '#A84400'),
        summaryTile('วันเริ่ม', lineCompactDate(session.date), '#FFF8E8', '#7C4A12'),
      ] },
      { type: 'separator', color: '#E3EAF2' },
      factRow(isSwap ? 'วันหยุดเดิม → ใหม่' : 'วันที่ลา', dateLabel),
    ] },
    footer: { type: 'box', layout: 'horizontal', spacing: 'sm', paddingAll: '12px', contents: [
      { type: 'button', style: 'secondary', height: 'sm', scaling: true, action: { type: 'postback', label: 'กลับไปแก้', data: 'hr-wiz-confirm:no', displayText: 'ยกเลิก' } },
      { type: 'button', style: 'primary', color: '#18A47B', height: 'sm', scaling: true, action: { type: 'postback', label: 'ยืนยันส่งคำขอ', data: 'hr-wiz-confirm:yes', displayText: 'ยืนยัน' } },
    ] },
  } }
}
// วันที่เลือกไว้ทำให้บ้านล่างเหลือคนน้อยกว่าขั้นต่ำ — บังคับเลือกคนออฟฟิศมาทดแทนก่อนยืนยันได้
const officeBackupMessage = (lockedDates, officeMap) => ({ type: 'template', altText: 'เลือกคนออฟฟิศมาทดแทน', template: { type: 'buttons',
  text: `วันที่ ${lockedDates.map(thaiDateLabel).join(', ')} บ้านล่างเหลือคนน้อยกว่า ${LOWER_HOUSE_MIN_HEADCOUNT} คนครับ ต้องดึงคนออฟฟิศมาทดแทนก่อน เลือกได้เลยครับ`,
  actions: Object.entries(officeMap).map(([code, [name]]) => ({ type: 'postback', label: name, data: `hr-wiz-office:${code}`, displayText: name })),
} })

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
  return { username: link.username, code, name: person.name, group: person.group }
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
      return replyMessage(replyToken, [typeQuickReplyMessage(staffLink)])
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
      if (leaveType === 'พักร้อน' && staffLink && !hasVacationBenefit(staffLink.group)) {
        await upsertSession(lineUserId, { step: 'await_type', leave_type: '', date: '', date2: '' })
        return replyMessage(replyToken, [{ type: 'text', text: `${staffLink.group}ไม่มีสิทธิ์วันลาพักร้อนครับ กรุณาเลือกประเภทการลาอื่น` }, typeQuickReplyMessage(staffLink)])
      }
      if (leaveType === 'สลับวันหยุด') {
        await upsertSession(lineUserId, { leave_type: leaveType, step: 'await_swap_from' })
        return replyMessage(replyToken, [swapFromMessage()])
      }
      await upsertSession(lineUserId, { leave_type: leaveType, step: 'await_date' })
      if (leaveType === 'พักร้อน' && staffLink) {
        const balance = await vacationBalanceFor(staffLink.code)
        return replyMessage(replyToken, [{ type: 'text', text: `ตอนนี้เหลือวันลาพักร้อน ${balance.remaining} วันครับ (ใช้ไปแล้ว ${balance.used}/${balance.quota} วัน)` }, dateChoiceMessage()])
      }
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

    // เลือกคนออฟฟิศมาทดแทนวันที่ล็อค (ถูกส่งมาก็ต่อเมื่อ hr-wiz-confirm:yes เจอวันล็อคด้านล่าง)
    if (data.startsWith('hr-wiz-office:')) {
      if (session?.step !== 'await_office_backup') return invalid()
      const code = data.slice('hr-wiz-office:'.length)
      const next = await upsertSession(lineUserId, { backup_office: code, step: 'await_confirm' })
      return replyMessage(replyToken, [confirmMessage(next)])
    }

    if (data === 'hr-wiz-confirm:yes') {
      if (session?.step !== 'await_confirm' || !staffLink) return invalid()
      if (session.leave_type === 'พักร้อน' && !hasVacationBenefit(staffLink.group)) {
        await upsertSession(lineUserId, { step: 'await_type', leave_type: '', date: '', date2: '' })
        return replyMessage(replyToken, [{ type: 'text', text: `${staffLink.group}ไม่มีสิทธิ์วันลาพักร้อนครับ กรุณาเลือกประเภทการลาอื่น` }, typeQuickReplyMessage(staffLink)])
      }
      const isSwap = session.leave_type === 'สลับวันหยุด'
      const endDate = session.date2 || session.date
      const absenceDates = leaveAbsenceDates({ leave_type: session.leave_type, start_date: session.date, end_date: endDate })
      const backupCheck = await resolveBackupOffice(staffLink.username, absenceDates, session.backup_office)
      if (!backupCheck.ok) {
        await upsertSession(lineUserId, { step: 'await_office_backup' })
        return replyMessage(replyToken, [officeBackupMessage(backupCheck.lockedDates, await getOfficePeopleMap())])
      }
      const now = new Date().toISOString()
      const record = {
        id: `leave-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        username: staffLink.username, employee_name: staffLink.name, leave_type: session.leave_type,
        start_date: session.date, end_date: endDate,
        days: isSwap ? 1 : daysBetween(session.date, endDate),
        reason: '', status: 'pending',
        requested_by: staffLink.name, requested_at: now,
        decided_by: '', decided_at: '', decision_note: '',
        backup_office: backupCheck.backupOffice || '',
      }
      await appendRows('hr_leave', [LEAVE_HEADERS.map((h) => record[h] ?? '')])
      clearHrCache()
      await clearSession(lineUserId)
      const submittedMessage = leaveFlexMessage(record, 'submitted', await getOfficePeopleMap())
      await Promise.all([notifyNewLeaveRequestSafely(record), replyMessage(replyToken, [submittedMessage])])
      return
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
      if (event.replyToken) {
        const message = error
          ? { type: 'text', text: `ทำรายการไม่สำเร็จ: ${error}` }
          : leaveFlexMessage(record, decision, await getOfficePeopleMap())
        await replyMessage(event.replyToken, [message])
      }
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
