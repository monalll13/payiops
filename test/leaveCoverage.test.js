import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCoveragePlan, leaveAbsenceSlots, officeLeaveConflicts, validateBackupSelections } from '../api/_lib/leaveCoverage.js'

const schedule = (date, ...codes) => codes.map((code) => ({ date, code }))
const base = {
  employeeCode: 'A',
  proposedLeave: { leave_type: 'ลากิจ', start_date: '2026-08-10', end_date: '2026-08-10', leave_period: 'full' },
  lowerCodes: ['A', 'B', 'C', 'D'],
  officeCodes: ['O1', 'O2'],
  scheduleRows: schedule('2026-08-10', 'A', 'B', 'C', 'D', 'O1', 'O2'),
  leaveRows: [{ id: 'old', username: 'mp:B', status: 'pending', leave_type: 'ลาป่วย', start_date: '2026-08-10', end_date: '2026-08-10', leave_period: 'full' }],
  backupRows: [],
}

test('requires one available office replacement for each half when headcount falls below three', () => {
  const result = buildCoveragePlan(base)
  assert.deepEqual(result.needs.map(({ period, required, candidates }) => ({ period, required, candidates })), [
    { period: 'am', required: 1, candidates: ['O1', 'O2'] },
    { period: 'pm', required: 1, candidates: ['O1', 'O2'] },
  ])
  assert.equal(result.blocked, false)
})

test('excludes office staff who are on leave or already assigned in the same period', () => {
  const result = buildCoveragePlan({
    ...base,
    leaveRows: [
      ...base.leaveRows,
      { id: 'office-leave', username: 'mp:O1', status: 'approved', leave_type: 'ลากิจ', start_date: '2026-08-10', end_date: '2026-08-10', leave_period: 'am' },
      { id: 'covered', username: 'mp:C', status: 'pending', leave_type: 'ลากิจ', start_date: '2026-08-10', end_date: '2026-08-10', leave_period: 'pm' },
    ],
    backupRows: [{ leave_id: 'covered', date: '2026-08-10', period: 'pm', office_code: 'O2' }],
  })
  assert.deepEqual(result.needs.find((need) => need.period === 'am').candidates, ['O2'])
  assert.deepEqual(result.needs.find((need) => need.period === 'pm').candidates, ['O1'])
})

test('half-day leave affects only the selected period', () => {
  assert.deepEqual(leaveAbsenceSlots({ leave_type: 'ลากิจ', start_date: '2026-08-10', end_date: '2026-08-10', leave_period: 'pm' }), [
    { date: '2026-08-10', period: 'pm' },
  ])
})

test('blocks when not enough eligible office staff remain', () => {
  const result = buildCoveragePlan({ ...base, officeCodes: ['O1'], scheduleRows: schedule('2026-08-10', 'A', 'B', 'C', 'D') })
  assert.equal(result.blocked, true)
  assert.equal(result.needs[0].candidates.length, 0)
})

test('validates unique selections for every required slot', () => {
  const needs = buildCoveragePlan(base).needs
  const result = validateBackupSelections(needs, [
    { date: '2026-08-10', period: 'am', office_code: 'O1' },
    { date: '2026-08-10', period: 'pm', office_code: 'O1' },
  ])
  assert.equal(result.ok, true)
  assert.equal(result.assignments.length, 2)
})

test('office leave conflicts with an active replacement assignment in the same period', () => {
  const conflicts = officeLeaveConflicts({
    officeCode: 'O1',
    proposedLeave: { leave_type: 'ลากิจ', start_date: '2026-08-10', end_date: '2026-08-10', leave_period: 'am' },
    leaveRows: [{ id: 'covered', status: 'pending' }],
    backupRows: [{ leave_id: 'covered', date: '2026-08-10', period: 'am', office_code: 'O1' }],
  })
  assert.equal(conflicts.length, 1)
})

test('office leave also conflicts with a legacy backup_office assignment', () => {
  const conflicts = officeLeaveConflicts({
    officeCode: 'O1',
    proposedLeave: { leave_type: 'ลากิจ', start_date: '2026-08-10', end_date: '2026-08-10', leave_period: 'pm' },
    leaveRows: [{
      id: 'legacy', status: 'approved', backup_office: 'O1', leave_type: 'ลากิจ',
      start_date: '2026-08-10', end_date: '2026-08-10', leave_period: 'full',
    }],
  })
  assert.equal(conflicts.length, 1)
})
