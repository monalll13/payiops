import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './theme.css'
import App from './App.jsx'
import ManagerClaimsPrototype from './pages/ManagerClaimsPrototype.jsx'
import Login from './pages/Login.jsx'

// ── API auth: แนบ token กับทุก fetch ที่ยิง /api (จุดเดียว ครอบทุกหน้า) ──
// token มาจากการ login (/api/auth) เก็บใน localStorage — ถ้า server ตอบ 401 (token หมดอายุ/ผิด)
// จะล้าง token แล้ว reload เพื่อกลับไปหน้า login (บนเครื่อง dev ไม่ตั้ง AUTH_SECRET = ไม่บังคับ)
const TOKEN_KEY = 'payi-api-token'
const USER_KEY = 'payi-user'
const origFetch = window.fetch.bind(window)
window.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input?.url || ''
  const isApi = url.startsWith('/api/') || url.startsWith('/api?')
  if (!isApi) return origFetch(input, init)

  const headers = new Headers(init.headers || {})
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) headers.set('x-api-token', token)
  const res = await origFetch(input, { ...init, headers })

  // token ใช้ไม่ได้แล้ว (ยกเว้นตอนกำลัง login เอง) → เด้งกลับหน้า login
  if (res.status === 401 && !url.startsWith('/api/auth')) {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    window.location.reload()
  }
  return res
}

// PROTOTYPE switch: เปิด /?manager เพื่อดูโหมดผู้จัดการ (มือถือ) โดยไม่กระทบแอปหลัก
const showManagerPrototype = new URLSearchParams(window.location.search).has('manager')

// ── ประตู login: เช็คสถานะระบบก่อน — ปิด auth อยู่ (local dev) ก็เข้าแอปตรงๆ ──
function Root() {
  const [status, setStatus] = useState(null) // { enabled, hasUsers }
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null') } catch { return null }
  })

  useEffect(() => {
    fetch('/api/auth?action=status')
      .then((r) => r.json())
      .then((d) => setStatus(d.success ? d : { enabled: false, hasUsers: true }))
      .catch(() => setStatus({ enabled: false, hasUsers: true })) // API ล่ม → ไม่บล็อกหน้า (จอในแอปโชว์ error เอง)
  }, [])

  if (!status) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: 'var(--payi-text-muted)', fontSize: 14 }}>กำลังโหลด...</div>
  }

  const needLogin = status.enabled && !(localStorage.getItem(TOKEN_KEY) && user)
  if (needLogin) return <Login firstTime={!status.hasUsers} onLogin={setUser} />

  return showManagerPrototype ? <ManagerClaimsPrototype /> : <App />
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
