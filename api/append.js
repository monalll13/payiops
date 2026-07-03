// POST /api/append  body: { "sheetName": "raw_orders", "rows": [[...], [...]] }
import { appendRows } from './_lib/sheets.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const { sheetName, rows } = req.body || {}
  if (!sheetName || !Array.isArray(rows)) {
    return res.status(400).json({ error: 'ต้องส่ง sheetName และ rows (array)' })
  }
  try {
    await appendRows(sheetName, rows)
    res.status(200).json({ ok: true, appended: rows.length })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
