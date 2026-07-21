import test from 'node:test'
import assert from 'node:assert/strict'
import { applyScheduleOverrides } from '../api/_lib/scheduleOverrides.js'

const people = {
  TANG: ['แตง', 'คนแพ็ก'],
  PANG: ['แป้ง', 'คนแพ็ก'],
  TOON: ['ตูน', 'ออฟฟิศ'],
}

test('latest daily override replaces only the lower-house roster for that date', () => {
  const baseRows = [
    { date: '2026-10-13', code: 'TANG', employee: 'แตง' },
    { date: '2026-10-13', code: 'PANG', employee: 'แป้ง' },
    { date: '2026-10-13', code: 'TOON', employee: 'ตูน' },
  ]
  const overrideRows = [
    { date: '2026-10-13', entries_json: JSON.stringify([{ code: 'TANG' }]), updated_at: '2026-07-20T10:00:00Z' },
    { date: '2026-10-13', entries_json: JSON.stringify([{ code: 'PANG' }]), updated_at: '2026-07-20T11:00:00Z' },
  ]
  const result = applyScheduleOverrides({ baseRows, overrideRows, personMap: people, overrideScopeCodes: ['TANG', 'PANG'] })
  assert.deepEqual(result.map((row) => row.code).sort(), ['PANG', 'TOON'])
  assert.equal(result.find((row) => row.code === 'PANG').source, 'override')
})

test('an empty override records a day with no lower-house manpower', () => {
  const result = applyScheduleOverrides({
    baseRows: [{ date: '2026-12-31', code: 'TANG', employee: 'แตง' }],
    overrideRows: [{ date: '2026-12-31', entries_json: '[]', updated_at: '2026-07-20T11:00:00Z' }],
    personMap: people,
    overrideScopeCodes: ['TANG', 'PANG'],
  })
  assert.deepEqual(result, [])
})
