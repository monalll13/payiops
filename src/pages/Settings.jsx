import { useEffect, useState } from 'react'
import { Loader2, KeyRound, UserPlus, Trash2, Users, ShieldCheck, MessageCircle } from 'lucide-react'

const getMe = () => {
  try { return JSON.parse(localStorage.getItem('payi-user') || 'null') } catch { return null }
}

export default function Settings() {
  const me = getMe()
  const isAdmin = me?.role === 'admin'

  return (
    <div style={{ width: '100%', display: 'grid', gap: 20, maxWidth: 720 }}>
      <ChangePasswordCard me={me} />
      <LineLinkCard me={me} />
      {isAdmin && <UserManagementCard me={me} />}
    </div>
  )
}

function LineLinkCard({ me }) {
  const [lineUserId, setLineUserId] = useState('')
  const [saved, setSaved] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    fetch('/api/sheet-tools?op=hr').then((r) => r.json()).then((d) => {
      const mine = (d.lineLinks || []).find((l) => l.username === me?.u)
      if (mine) { setLineUserId(mine.line_user_id); setSaved(mine.line_user_id) }
    }).catch(() => {}).finally(() => setLoading(false))
  }, [me?.u])

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setMsg(null)
    try {
      const res = await fetch('/api/sheet-tools?op=hr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set-line-id', line_user_id: lineUserId }),
      })
      const d = await res.json()
      if (!d.success) throw new Error(d.error || 'บันทึกไม่สำเร็จ')
      setSaved(lineUserId)
      setMsg({ ok: true, text: lineUserId ? 'เชื่อม LINE สำเร็จ' : 'ยกเลิกการเชื่อม LINE แล้ว' })
    } catch (err) {
      setMsg({ ok: false, text: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card icon={MessageCircle} title="แจ้งเตือนผ่าน LINE" sub="เชื่อม LINE userId เพื่อรับแจ้งเตือนคำขอลาใหม่ (สำหรับ admin) พร้อมกดอนุมัติ/ปฏิเสธจากแชทได้เลย">
      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--payi-text-muted)' }}>กำลังโหลด...</div>
      ) : (
        <form onSubmit={submit} style={{ display: 'grid', gap: 10, maxWidth: 420 }}>
          <input value={lineUserId} onChange={(e) => setLineUserId(e.target.value)} placeholder="LINE userId (เช่น U1234567890abcdef...)" style={inputStyle} autoCapitalize="none" />
          <div style={{ fontSize: 11.5, color: 'var(--payi-text-faint)', lineHeight: 1.5 }}>
            หา userId ได้จากหน้า LINE Developers Console ของ OA (Basic settings) หรือดูจาก log ตอนทักแชทเข้า OA ครั้งแรก
          </div>
          {msg && (
            <div style={{ fontSize: 12.5, padding: '8px 10px', borderRadius: 8, color: msg.ok ? 'var(--payi-success)' : 'var(--payi-danger)', background: msg.ok ? 'var(--payi-success-bg)' : 'var(--payi-danger-bg)' }}>
              {msg.text}
            </div>
          )}
          <button type="submit" disabled={busy || lineUserId === saved} style={{ ...primaryBtn, opacity: busy || lineUserId === saved ? 0.6 : 1, justifySelf: 'start' }}>
            {busy ? <Loader2 size={14} className="payi-spin" /> : <MessageCircle size={14} />} บันทึก
          </button>
        </form>
      )}
    </Card>
  )
}

function ChangePasswordCard({ me }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null) // { ok, text }

  const submit = async (e) => {
    e.preventDefault()
    setMsg(null)
    if (next !== confirm) return setMsg({ ok: false, text: 'รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน' })
    setBusy(true)
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'change-password', current_password: current, new_password: next }),
      })
      const d = await res.json()
      if (!d.success) throw new Error(d.error || 'เปลี่ยนรหัสผ่านไม่สำเร็จ')
      setMsg({ ok: true, text: 'เปลี่ยนรหัสผ่านสำเร็จ' })
      setCurrent(''); setNext(''); setConfirm('')
    } catch (err) {
      setMsg({ ok: false, text: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card icon={KeyRound} title="บัญชีของฉัน" sub={me ? `${me.name || me.u} · ${me.role === 'admin' ? 'admin' : 'staff'}` : ''}>
      <form onSubmit={submit} style={{ display: 'grid', gap: 10, maxWidth: 360 }}>
        <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="รหัสผ่านปัจจุบัน" style={inputStyle} />
        <input type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="รหัสผ่านใหม่ (อย่างน้อย 6 ตัว)" style={inputStyle} />
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="ยืนยันรหัสผ่านใหม่" style={inputStyle} />
        {msg && (
          <div style={{ fontSize: 12.5, padding: '8px 10px', borderRadius: 8, color: msg.ok ? 'var(--payi-success)' : 'var(--payi-danger)', background: msg.ok ? 'var(--payi-success-bg)' : 'var(--payi-danger-bg)' }}>
            {msg.text}
          </div>
        )}
        <button type="submit" disabled={busy || !current || !next} style={{ ...primaryBtn, opacity: busy || !current || !next ? 0.6 : 1, justifySelf: 'start' }}>
          {busy ? <Loader2 size={14} className="payi-spin" /> : <KeyRound size={14} />} เปลี่ยนรหัสผ่าน
        </button>
      </form>
    </Card>
  )
}

function UserManagementCard({ me }) {
  const [users, setUsers] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState({ username: '', display_name: '', password: '', role: 'staff' })
  const [busy, setBusy] = useState(false)

  const load = () => {
    setLoading(true); setError('')
    fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'list-users' }) })
      .then((r) => r.json())
      .then((d) => { if (!d.success) throw new Error(d.error); setUsers(d.users) })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const addUser = async (e) => {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create-user', ...draft }),
      })
      const d = await res.json()
      if (!d.success) throw new Error(d.error || 'เพิ่มผู้ใช้ไม่สำเร็จ')
      setDraft({ username: '', display_name: '', password: '', role: 'staff' })
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const removeUser = async (username) => {
    if (!window.confirm(`ลบผู้ใช้ "${username}"?`)) return
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete-user', username }),
      })
      const d = await res.json()
      if (!d.success) throw new Error(d.error || 'ลบไม่สำเร็จ')
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card icon={Users} title="จัดการผู้ใช้" sub="เฉพาะ admin — เพิ่ม/ลบบัญชีคนในทีม">
      {error && <div style={{ fontSize: 12.5, padding: '8px 10px', borderRadius: 8, color: 'var(--payi-danger)', background: 'var(--payi-danger-bg)', marginBottom: 12 }}>{error}</div>}

      <form onSubmit={addUser} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 18 }}>
        <input value={draft.username} onChange={(e) => setDraft({ ...draft, username: e.target.value })} placeholder="ชื่อผู้ใช้" style={inputStyle} autoCapitalize="none" />
        <input value={draft.display_name} onChange={(e) => setDraft({ ...draft, display_name: e.target.value })} placeholder="ชื่อที่แสดง" style={inputStyle} />
        <input type="password" value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} placeholder="รหัสผ่าน (อย่างน้อย 6 ตัว)" style={inputStyle} />
        <select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} className="payi-select" style={inputStyle}>
          <option value="staff">staff</option>
          <option value="admin">admin</option>
        </select>
        <button type="submit" disabled={busy || !draft.username || draft.password.length < 6} style={{ ...primaryBtn, gridColumn: '1 / -1', justifySelf: 'start', opacity: busy || !draft.username || draft.password.length < 6 ? 0.6 : 1 }}>
          {busy ? <Loader2 size={14} className="payi-spin" /> : <UserPlus size={14} />} เพิ่มผู้ใช้
        </button>
      </form>

      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--payi-text-muted)' }}>กำลังโหลด...</div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {(users || []).map((u) => (
            <div key={u.username} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--payi-surface-muted)', border: '1px solid var(--payi-border)', borderRadius: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--payi-text-strong)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {u.display_name}
                  {u.role === 'admin' && <ShieldCheck size={13} color="var(--payi-mint-strong)" />}
                </div>
                <div style={{ fontSize: 11, color: 'var(--payi-text-muted)', fontFamily: 'monospace' }}>{u.username} · {u.role}</div>
              </div>
              <button
                onClick={() => removeUser(u.username)}
                disabled={busy || u.username === me?.u}
                title={u.username === me?.u ? 'ลบบัญชีตัวเองไม่ได้' : 'ลบผู้ใช้'}
                style={{ ...iconBtn, opacity: u.username === me?.u ? 0.35 : 1, cursor: u.username === me?.u ? 'not-allowed' : 'pointer' }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {!users?.length && <div style={{ fontSize: 13, color: 'var(--payi-text-faint)' }}>ไม่มีผู้ใช้อื่น</div>}
        </div>
      )}
    </Card>
  )
}

function Card({ icon: Icon, title, sub, children }) {
  return (
    <div className="payi-glass-card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Icon size={16} color="var(--payi-mint)" />
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--payi-text-strong)' }}>{title}</div>
      </div>
      {sub && <div style={{ fontSize: 12, color: 'var(--payi-text-muted)', marginBottom: 16 }}>{sub}</div>}
      {children}
    </div>
  )
}

const inputStyle = {
  width: '100%', boxSizing: 'border-box', border: '1px solid var(--payi-border)', background: 'var(--payi-surface)',
  borderRadius: 8, padding: '9px 11px', fontSize: 13, color: 'var(--payi-text-strong)', outline: 'none',
}
const primaryBtn = {
  border: 0, borderRadius: 8, padding: '9px 16px', background: 'var(--payi-mint)', color: '#fff',
  fontSize: 13, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
}
const iconBtn = {
  border: '1px solid var(--payi-border)', background: 'var(--payi-surface)', color: 'var(--payi-danger)',
  borderRadius: 7, padding: 7, display: 'grid', placeItems: 'center', flexShrink: 0,
}
