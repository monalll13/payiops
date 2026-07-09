// ระบบ login รายบัญชี (ผู้ใช้เก็บในแท็บ `users` ของชีต)
// GET  /api/auth?action=status → { enabled, hasUsers } — frontend ใช้ตัดสินใจว่าต้องโชว์จอ login ไหม
// POST /api/auth  body { action: 'login' | 'setup' | 'create-user', ... }
//   - login:  { username, password } → { token, user }
//   - setup:  ใช้ได้ครั้งเดียวตอนยังไม่มีผู้ใช้ → สร้าง admin คนแรกแล้ว login ให้เลย
//   - create-user: (ต้องเป็น admin) { username, password, display_name, role }
// หมายเหตุ: ไฟล์นี้จงใจไม่มี requireAuth ครอบทั้ง handler — login ต้องเข้าถึงได้ก่อนมี token
import { ensureSheet, getSheet, appendRows } from './_lib/sheets.js'
import { authEnabled, hashPassword, verifyPassword, signToken, verifyToken } from './_lib/auth.js'

const SHEET = 'users'
const HEADERS = ['username', 'password_hash', 'salt', 'display_name', 'role', 'created_at']

const norm = (s) => String(s || '').trim().toLowerCase()

async function getUsers() {
  await ensureSheet(SHEET, HEADERS)
  return (await getSheet(SHEET)).filter((u) => u.username)
}

function bodyFromReq(req) {
  return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
}

export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'no-store')

    if (req.method === 'GET') {
      // status — ปิด auth อยู่ก็บอกตรงๆ ให้ frontend ข้ามจอ login
      if (!authEnabled()) return res.status(200).json({ success: true, enabled: false, hasUsers: true })
      // อ่านชีตพัง (เช่น Google key ตั้งผิด) ต้องไม่ทำให้ status ล่ม — ถือว่ามี user ไปก่อน
      // ไม่งั้น frontend เข้าใจผิดว่าไม่ต้อง login → ยิง API → 401 → reload วน
      let hasUsers = true
      try { hasUsers = (await getUsers()).length > 0 } catch { /* ให้จอ login โชว์ error จริงแทน */ }
      return res.status(200).json({ success: true, enabled: true, hasUsers })
    }

    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' })
    if (!authEnabled()) return res.status(400).json({ success: false, error: 'ระบบ login ยังไม่เปิด (ไม่ได้ตั้ง AUTH_SECRET)' })

    const body = bodyFromReq(req)
    const action = String(body.action || 'login')

    if (action === 'login') {
      const username = norm(body.username)
      const password = String(body.password || '')
      if (!username || !password) return res.status(400).json({ success: false, error: 'กรอกชื่อผู้ใช้และรหัสผ่าน' })
      const users = await getUsers()
      const u = users.find((x) => norm(x.username) === username)
      // ไม่บอกว่าผิดที่ user หรือรหัส — กันเดาบัญชี
      if (!u || !verifyPassword(password, u.salt, u.password_hash)) {
        return res.status(401).json({ success: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' })
      }
      const user = { u: norm(u.username), name: u.display_name || u.username, role: u.role || 'staff' }
      return res.status(200).json({ success: true, token: signToken(user), user })
    }

    if (action === 'setup') {
      // สร้างผู้ใช้คนแรก (admin) — ใช้ได้เฉพาะตอนแท็บ users ยังว่าง
      const users = await getUsers()
      if (users.length > 0) return res.status(403).json({ success: false, error: 'ตั้งค่าไปแล้ว — ให้ admin เพิ่มผู้ใช้แทน' })
      const username = norm(body.username)
      const password = String(body.password || '')
      if (!username || password.length < 6) return res.status(400).json({ success: false, error: 'ต้องมีชื่อผู้ใช้ และรหัสผ่านอย่างน้อย 6 ตัว' })
      const { salt, hash } = hashPassword(password)
      await appendRows(SHEET, [[username, hash, salt, String(body.display_name || username).trim(), 'admin', new Date().toISOString()]])
      const user = { u: username, name: String(body.display_name || username).trim(), role: 'admin' }
      return res.status(200).json({ success: true, token: signToken(user), user })
    }

    if (action === 'create-user') {
      const caller = verifyToken(req.headers['x-api-token'])
      if (!caller || caller.role !== 'admin') return res.status(403).json({ success: false, error: 'ต้องเป็น admin เท่านั้น' })
      const username = norm(body.username)
      const password = String(body.password || '')
      if (!username || password.length < 6) return res.status(400).json({ success: false, error: 'ต้องมีชื่อผู้ใช้ และรหัสผ่านอย่างน้อย 6 ตัว' })
      const users = await getUsers()
      if (users.some((x) => norm(x.username) === username)) return res.status(409).json({ success: false, error: 'มีชื่อผู้ใช้นี้แล้ว' })
      const role = body.role === 'admin' ? 'admin' : 'staff'
      const { salt, hash } = hashPassword(password)
      await appendRows(SHEET, [[username, hash, salt, String(body.display_name || username).trim(), role, new Date().toISOString()]])
      return res.status(200).json({ success: true, user: { u: username, role } })
    }

    return res.status(400).json({ success: false, error: 'unknown action' })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
}
