export const WORK_PERIODS = ['am', 'pm']
export const MIN_LOWER_HOUSE_HEADCOUNT = 3

const activeLeave = (leave) => ['pending', 'approved'].includes(String(leave.status || ''))
const codeFromUsername = (username) => String(username || '').startsWith('mp:') ? String(username).slice(3).toUpperCase() : ''
const slotKey = (date, period) => `${date}|${period}`

export function normalizeLeavePeriod(value, days) {
  const period = String(value || '').toLowerCase()
  if (period === 'am' || period === 'pm') return period
  // รายการเก่าที่มีเพียง days=0.5 ไม่รู้ว่าเช้าหรือบ่าย จึงกันกำลังคนไว้ทั้งวันตามพฤติกรรมเดิม
  if (Number(days) === 0.5) return 'full'
  return 'full'
}

export function leavePeriodLabel(value) {
  return value === 'am' ? 'ครึ่งวันเช้า' : value === 'pm' ? 'ครึ่งวันบ่าย' : 'เต็มวัน'
}

export function leaveAbsenceDates(leave) {
  if (leave.leave_type === 'สลับวันหยุด') return leave.end_date ? [leave.end_date] : []
  const start = leave.start_date
  const end = leave.end_date || start
  if (!start) return []
  const dates = []
  for (let date = start; date <= end && dates.length <= 366; date = addDay(date)) dates.push(date)
  return dates
}

export function leaveAbsenceSlots(leave) {
  const period = leave.leave_type === 'สลับวันหยุด' ? 'full' : normalizeLeavePeriod(leave.leave_period, leave.days)
  const periods = period === 'full' ? WORK_PERIODS : [period]
  return leaveAbsenceDates(leave).flatMap((date) => periods.map((workPeriod) => ({ date, period: workPeriod })))
}

function addDay(dateString) {
  const date = new Date(`${dateString}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

function addToSetMap(map, key, value) {
  if (!map.has(key)) map.set(key, new Set())
  map.get(key).add(value)
}

export function buildCoveragePlan({
  employeeCode,
  proposedLeave,
  lowerCodes = [],
  officeCodes = [],
  scheduleRows = [],
  leaveRows = [],
  backupRows = [],
  minimum = MIN_LOWER_HOUSE_HEADCOUNT,
}) {
  const lower = new Set(lowerCodes.map((code) => String(code).toUpperCase()))
  const office = new Set(officeCodes.map((code) => String(code).toUpperCase()))
  const requester = String(employeeCode || '').toUpperCase()
  if (!lower.has(requester)) return { needs: [], blocked: false }

  const scheduledByDate = new Map()
  const scheduleSet = new Set()
  for (const row of scheduleRows) {
    const date = String(row.date || '')
    const code = String(row.code || '').toUpperCase()
    if (!date || !code) continue
    scheduleSet.add(`${date}|${code}`)
    addToSetMap(scheduledByDate, date, code)
  }

  const activeLeaves = leaveRows.filter(activeLeave)
  const lowerAbsent = new Map()
  const officeAbsent = new Map()
  for (const leave of activeLeaves) {
    const code = codeFromUsername(leave.username)
    if (!code) continue
    for (const slot of leaveAbsenceSlots(leave)) {
      if (lower.has(code)) addToSetMap(lowerAbsent, slotKey(slot.date, slot.period), code)
      if (office.has(code)) addToSetMap(officeAbsent, slotKey(slot.date, slot.period), code)
    }
  }

  const activeLeaveIds = new Set(activeLeaves.map((leave) => String(leave.id)))
  const explicitLeaveIds = new Set(backupRows.map((row) => String(row.leave_id || '')).filter(Boolean))
  const allBackupRows = [...backupRows]
  // รองรับคำขอเก่าที่เก็บคนทดแทนไว้ใน backup_office เพียงช่องเดียว
  for (const leave of activeLeaves) {
    if (!leave.backup_office || explicitLeaveIds.has(String(leave.id))) continue
    for (const slot of leaveAbsenceSlots(leave)) allBackupRows.push({ leave_id: leave.id, date: slot.date, period: slot.period, office_code: leave.backup_office })
  }

  const assigned = new Map()
  for (const row of allBackupRows) {
    if (!activeLeaveIds.has(String(row.leave_id || ''))) continue
    const date = String(row.date || '')
    const period = WORK_PERIODS.includes(row.period) ? row.period : 'am'
    const code = String(row.office_code || '').toUpperCase()
    const key = slotKey(date, period)
    if (!office.has(code) || !scheduleSet.has(`${date}|${code}`) || officeAbsent.get(key)?.has(code)) continue
    addToSetMap(assigned, key, code)
  }

  const needs = []
  for (const slot of leaveAbsenceSlots(proposedLeave)) {
    // ถ้าพนักงานไม่มีตารางในช่วงวันที่นั้น การลาไม่ทำให้กำลังคนลดลง
    if (!scheduleSet.has(`${slot.date}|${requester}`)) continue
    const key = slotKey(slot.date, slot.period)
    const scheduledLower = [...(scheduledByDate.get(slot.date) || [])].filter((code) => lower.has(code))
    const absent = new Set(lowerAbsent.get(key) || [])
    absent.add(requester)
    const presentLower = scheduledLower.filter((code) => !absent.has(code)).length
    const assignedOffice = new Set(assigned.get(key) || [])
    const effectiveHeadcount = presentLower + assignedOffice.size
    const required = Math.max(0, minimum - effectiveHeadcount)
    if (!required) continue

    const candidates = [...(scheduledByDate.get(slot.date) || [])]
      .filter((code) => office.has(code))
      .filter((code) => !officeAbsent.get(key)?.has(code))
      .filter((code) => !assignedOffice.has(code))
      .sort()
    needs.push({ date: slot.date, period: slot.period, required, candidates, presentLower, effectiveHeadcount })
  }
  return { needs, blocked: needs.some((need) => need.candidates.length < need.required) }
}

export function validateBackupSelections(needs = [], selections = []) {
  const normalized = []
  for (const need of needs) {
    const chosen = selections
      .filter((item) => item.date === need.date && item.period === need.period)
      .map((item) => String(item.office_code || '').toUpperCase())
      .filter(Boolean)
    const unique = [...new Set(chosen)]
    if (unique.length < need.required) return { ok: false, reason: 'missing', need }
    if (unique.slice(0, need.required).some((code) => !need.candidates.includes(code))) return { ok: false, reason: 'unavailable', need }
    for (const officeCode of unique.slice(0, need.required)) normalized.push({ date: need.date, period: need.period, office_code: officeCode })
  }
  return { ok: true, assignments: normalized }
}

export function officeLeaveConflicts({ officeCode, proposedLeave, leaveRows = [], backupRows = [] }) {
  const activeLeaves = leaveRows.filter(activeLeave)
  const activeIds = new Set(activeLeaves.map((leave) => String(leave.id)))
  const explicitLeaveIds = new Set(backupRows.map((row) => String(row.leave_id || '')).filter(Boolean))
  const allBackupRows = [...backupRows]
  for (const leave of activeLeaves) {
    if (!leave.backup_office || explicitLeaveIds.has(String(leave.id))) continue
    for (const slot of leaveAbsenceSlots(leave)) {
      allBackupRows.push({ leave_id: leave.id, ...slot, office_code: leave.backup_office })
    }
  }
  const wanted = new Set(leaveAbsenceSlots(proposedLeave).map((slot) => slotKey(slot.date, slot.period)))
  return allBackupRows.filter((row) =>
    activeIds.has(String(row.leave_id || ''))
    && String(row.office_code || '').toUpperCase() === String(officeCode || '').toUpperCase()
    && wanted.has(slotKey(row.date, row.period)),
  )
}
