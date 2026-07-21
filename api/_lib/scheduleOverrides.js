export function applyScheduleOverrides({ baseRows = [], overrideRows = [], personMap = {}, overrideScopeCodes = Object.keys(personMap) }) {
  const latestByDate = new Map()
  for (const row of overrideRows) {
    const date = String(row.date || '')
    if (!date) continue
    const previous = latestByDate.get(date)
    if (!previous || String(row.updated_at || '') >= String(previous.updated_at || '')) latestByDate.set(date, row)
  }
  if (!latestByDate.size) return [...baseRows]

  const scope = new Set(overrideScopeCodes.map((code) => String(code).toUpperCase()))
  const result = baseRows.filter((row) => !latestByDate.has(String(row.date || '')) || !scope.has(String(row.code || '').toUpperCase()))
  for (const [date, override] of latestByDate) {
    let entries = []
    try { entries = JSON.parse(override.entries_json || '[]') } catch { entries = [] }
    const seen = new Set()
    for (const entry of Array.isArray(entries) ? entries : []) {
      const code = String(entry?.code || '').toUpperCase()
      const person = personMap[code]
      if (!person || seen.has(code)) continue
      seen.add(code)
      result.push({ id: `override-${date}-${code}`, date, employee: person[0], code, group: person[1], fraction: 1, source: 'override' })
    }
  }
  return result
}
