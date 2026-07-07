import { useState } from 'react'
import { Loader2, LogIn, UserPlus } from 'lucide-react'
import payiLogo from '../assets/payi-logo.png'

// จอ login รายบัญชี — ถ้าเป็นการเปิดระบบครั้งแรก (ยังไม่มีผู้ใช้) จะกลายเป็นฟอร์ม "สร้าง admin คนแรก"
export default function Login({ firstTime, onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(firstTime
          ? { action: 'setup', username, password, display_name: displayName }
          : { action: 'login', username, password }),
      })
      const d = await res.json()
      if (!d.success) throw new Error(d.error || 'เข้าสู่ระบบไม่สำเร็จ')
      localStorage.setItem('payi-api-token', d.token)
      localStorage.setItem('payi-user', JSON.stringify(d.user))
      onLogin(d.user)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20, fontFamily: 'Inter, -apple-system, sans-serif' }}>
      <form onSubmit={submit} style={{ width: 360, maxWidth: '94vw', background: 'var(--payi-surface)', border: '1px solid var(--payi-border)', borderRadius: 16, boxShadow: 'var(--payi-shadow)', padding: 28, display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <img src={payiLogo} alt="PAYI" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }} />
          <div>
            <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--payi-text-strong)' }}>PAYI Ops</div>
            <div style={{ fontSize: 11, color: 'var(--payi-text-muted)', fontWeight: 700, letterSpacing: '0.06em' }}>RETAIL CONTROL ROOM</div>
          </div>
        </div>

        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--payi-text-strong)' }}>
          {firstTime ? 'ตั้งค่าครั้งแรก — สร้างบัญชี admin' : 'เข้าสู่ระบบ'}
        </div>
        {firstTime && (
          <div style={{ fontSize: 12, color: 'var(--payi-text-muted)', marginTop: -8 }}>
            ยังไม่มีผู้ใช้ในระบบ บัญชีแรกจะเป็น admin (เพิ่มคนอื่นได้ทีหลัง)
          </div>
        )}

        {firstTime && (
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="ชื่อที่แสดง (เช่น Nook)" style={inputStyle} />
        )}
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="ชื่อผู้ใช้" autoFocus autoCapitalize="none" style={inputStyle} />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={firstTime ? 'รหัสผ่าน (อย่างน้อย 6 ตัว)' : 'รหัสผ่าน'} style={inputStyle} />

        {error && <div style={{ fontSize: 12.5, color: 'var(--payi-danger)', background: 'var(--payi-danger-bg)', border: '1px solid var(--payi-danger)', borderRadius: 8, padding: '8px 10px' }}>{error}</div>}

        <button type="submit" disabled={busy || !username || !password} style={{ border: 0, borderRadius: 10, minHeight: 42, background: 'var(--payi-mint)', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: busy || !username || !password ? 0.6 : 1 }}>
          {busy ? <Loader2 size={16} className="payi-spin" /> : firstTime ? <UserPlus size={16} /> : <LogIn size={16} />}
          {firstTime ? 'สร้างบัญชีและเข้าสู่ระบบ' : 'เข้าสู่ระบบ'}
        </button>
      </form>
    </div>
  )
}

const inputStyle = {
  width: '100%', boxSizing: 'border-box', border: '1px solid var(--payi-border)', background: 'var(--payi-surface-muted)',
  borderRadius: 10, padding: '11px 12px', fontSize: 14, color: 'var(--payi-text-strong)', outline: 'none',
}
