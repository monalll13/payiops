// POST /api/overwrite  body: { "sheetName": "product_master", "headers": [...], "rows": [[...]] }
import { requireAuth } from './_lib/auth.js'
import { overwriteSheet } from './_lib/sheets.js'

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
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
