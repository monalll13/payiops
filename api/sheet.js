// GET /api/sheet?name=raw_orders → อ่านข้อมูลจาก sheet นั้นทั้งหมด
import { requireAuth } from './_lib/auth.js'
import { getSheet } from './_lib/sheets.js'

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const { name } = req.query
  if (!name) {
    return res.status(400).json({ error: 'ต้องระบุ ?name=<ชื่อ sheet>' })
  }
  try {
    const data = await getSheet(name)
    res.status(200).json(data)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
