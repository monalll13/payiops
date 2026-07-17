// โหมดพนักงาน/หัวหน้า (มือถือ) — หน้าจัดการวันลา · ธีม TREASURE ขาว-ฟ้า (เหมือน ManagerClaimsPrototype.jsx)
// เปิดดูที่ /?hr · แยกจากแอปหลัก ไม่กระทบ control-room เดสก์ท็อป · ใช้ API เดียวกับหน้า HR เดสก์ท็อป (/api/sheet-tools?op=hr)
import { useEffect, useRef, useState } from 'react'
import { Bell, ChevronLeft, Check, CalendarClock, User, ListChecks, MoreHorizontal } from 'lucide-react'

const API = '/api/sheet-tools?op=hr'
const LEAVE_TYPES = ['พักร้อน', 'ลากิจ', 'ลาป่วย', 'ขาดงาน']
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
const THAI_MONTH_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
const monthFullLabel = (ym) => { const [y, m] = String(ym).split('-'); return `${THAI_MONTH_FULL[parseInt(m, 10) - 1] || m} ${y}` }

const C = {
  blue: '#2F6FE0', blueDeep: '#1E4FB0', blueSoft: '#EAF2FF', blueLine: '#D6E4FB',
  page: '#F4F8FF', card: '#FFFFFF', text: '#16233F', muted: '#6B7A99', faint: '#98A6C0',
  red: '#E24B4A', redSoft: '#FDECEC', amber: '#E8930C', amberSoft: '#FDF3E2', green: '#1AA179', greenSoft: '#E4F6F0',
}
const STATUS = {
  pending: { dot: C.amber, text: C.amber, label: 'รอพิจารณา' },
  approved: { dot: C.green, text: C.green, label: 'อนุมัติแล้ว' },
  rejected: { dot: C.red, text: C.red, label: 'ไม่อนุมัติ' },
}
const AVATAR_COLORS = ['#2F6FE0', '#1AA179', '#E8930C', '#E24B4A', '#8B5CF6', '#0EA5E9']
const initials = (name = '') => name.trim().slice(0, 1).toUpperCase() || '?'
const avatarColor = (name = '') => AVATAR_COLORS[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_COLORS.length]

function DiamondLogo({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 3 L41 18 L24 45 L7 18 Z" fill={C.blueSoft} stroke={C.blue} strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M7 18 H41 M16 9 L20 18 M32 9 L28 18" stroke={C.blue} strokeWidth="1.4" opacity="0.55" fill="none" />
      <path d="M24 13 L26.4 22 L35 24 L26.4 26 L24 35 L21.6 26 L13 24 L21.6 22 Z" fill={C.blue} />
    </svg>
  )
}

function Avatar({ name, size = 42 }) {
  return <div style={{ width: size, height: size, borderRadius: '50%', background: avatarColor(name), color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: size * 0.4, flexShrink: 0 }}>{initials(name)}</div>
}

const inputStyle = { width: '100%', boxSizing: 'border-box', border: `1px solid ${C.blueLine}`, borderRadius: 10, padding: '10px 12px', background: '#fff', color: C.text, fontSize: 13, outline: 'none' }
const pillBtn = (active) => ({ border: `1px solid ${active ? C.blue : C.blueLine}`, background: active ? C.blueSoft : '#fff', color: active ? C.blueDeep : C.muted, borderRadius: 999, padding: '9px 14px', fontWeight: 800, fontSize: 13, cursor: 'pointer' })

async function readApiResponse(response) {
  try { return await response.json() } catch { return { success: false, error: `HTTP ${response.status}` } }
}

export default function HRMobile() {
  const loadStarted = useRef(false)
  const [authEnabled, setAuthEnabled] = useState(true)
  useEffect(() => { fetch('/api/auth?action=status').then((r) => r.json()).then((d) => setAuthEnabled(!!d.enabled)).catch(() => {}) }, [])
  const currentUser = (() => { try { return JSON.parse(localStorage.getItem('payi-user') || 'null') } catch { return null } })()
  const isBoss = !authEnabled || currentUser?.role === 'admin'
  const myName = currentUser?.name || 'Boss'

  const [leave, setLeave] = useState([])
  const [users, setUsers] = useState([])
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [view, setView] = useState('list') // list | detail | form
  const [selectedId, setSelectedId] = useState(null)
  const [filterEmployee, setFilterEmployee] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const [form, setForm] = useState({ employee_code: '', leave_type: LEAVE_TYPES[0], start_date: today(), end_date: today(), half_day: false, reason: '' })

  const load = async () => {
    setLoading(true); setError('')
    try {
      const r = await fetch(API); const d = await readApiResponse(r)
      if (!r.ok || !d.success) throw new Error(d.error || 'โหลดข้อมูลไม่สำเร็จ')
      setLeave(d.leave || []); setPeople(d.people || [])
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }
  useEffect(() => { if (loadStarted.current) return; loadStarted.current = true; load() }, [])
  useEffect(() => {
    if (!isBoss || !authEnabled) return
    fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'list-users' }) })
      .then((r) => r.json()).then((d) => { if (d.success) setUsers(d.users || []) }).catch(() => {})
  }, [isBoss, authEnabled])

  const visible = (isBoss ? leave : leave.filter((l) => l.username === currentUser?.u))
    .filter((l) => !filterEmployee || l.username === filterEmployee)
    .filter((l) => !filterStatus || l.status === filterStatus)
  const years = [...new Set(leave.map((l) => String(l.start_date).slice(0, 4)))].filter(Boolean).sort().reverse()
  const grouped = visible
    .slice()
    .sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)))
    .reduce((acc, l) => { const key = String(l.start_date).slice(0, 7); (acc[key] ||= []).push(l); return acc }, {})
  const monthKeys = Object.keys(grouped).sort().reverse()

  const selected = leave.find((l) => l.id === selectedId)

  const openDetail = (id) => { setSelectedId(id); setView('detail') }

  const submitLeave = async (e) => {
    e.preventDefault(); setSaving(true); setError('')
    try {
      const action = form.employee_code ? 'request-leave-for' : 'request-leave'
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...form }) })
      const d = await readApiResponse(r); if (!r.ok || !d.success) throw new Error(d.error || 'ส่งคำขอไม่สำเร็จ')
      setForm({ employee_code: '', leave_type: LEAVE_TYPES[0], start_date: today(), end_date: today(), half_day: false, reason: '' })
      await load(); setView('list')
    } catch (e2) { setError(e2.message) } finally { setSaving(false) }
  }

  const decideLeave = async (id, decision) => {
    setSaving(true); setError('')
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'decide-leave', id, decision }) })
      const d = await readApiResponse(r); if (!r.ok || !d.success) throw new Error(d.error || 'บันทึกไม่สำเร็จ')
      await load(); setView('list')
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  const cancelLeave = async (id) => {
    setSaving(true); setError('')
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel-leave', id }) })
      const d = await readApiResponse(r); if (!r.ok || !d.success) throw new Error(d.error || 'ยกเลิกไม่สำเร็จ')
      await load(); setView('list')
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  return (
    <div style={{ minHeight: '100vh', background: C.page, display: 'flex', justifyContent: 'center', fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Noto Sans Thai", sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 430, background: C.page, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

        <div style={{ background: C.card, padding: '14px 16px', borderBottom: `1px solid ${C.blueLine}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <DiamondLogo />
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.text, letterSpacing: '0.02em' }}>Payi Ops</div>
              <div style={{ fontSize: 11, color: C.blue, fontWeight: 600 }}>จัดการวันลา · {isBoss ? 'สำหรับหัวหน้า' : 'พนักงาน'}</div>
            </div>
          </div>
          <Bell size={20} color={C.muted} />
        </div>

        <div style={{ padding: '14px 14px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {error && <div style={{ background: C.redSoft, border: `1px solid ${C.red}44`, borderRadius: 12, padding: 12, fontSize: 12, color: C.red }}>{error}</div>}

          {view === 'list' && <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Avatar name={myName} size={48} />
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: C.text }}>{isBoss ? 'Hello Boss' : `สวัสดี, ${myName}`}</div>
                <div style={{ fontSize: 11, color: C.muted }}>จัดการวันลา</div>
              </div>
            </div>

            <button onClick={() => setView('form')} style={{ border: 0, borderRadius: 12, padding: '13px 0', background: C.blue, color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>+ แจ้งลางาน</button>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {isBoss && <select value={filterEmployee} onChange={(e) => setFilterEmployee(e.target.value)} style={{ ...inputStyle, width: 'auto', flex: 1 }}>
                <option value="">ทุกคน</option>
                {users.map((u) => <option key={u.username} value={u.username}>{u.display_name}</option>)}
              </select>}
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ ...inputStyle, width: 'auto', flex: 1 }}>
                <option value="">ทุกสถานะ</option>
                <option value="pending">รอพิจารณา</option>
                <option value="approved">อนุมัติแล้ว</option>
                <option value="rejected">ไม่อนุมัติ</option>
              </select>
            </div>

            {loading && <div style={{ textAlign: 'center', color: C.muted, fontSize: 13, padding: 24 }}>กำลังโหลด...</div>}
            {!loading && !monthKeys.length && <div style={{ background: C.card, border: `1px solid ${C.blueLine}`, borderRadius: 16, padding: 24, textAlign: 'center', color: C.muted, fontSize: 13 }}>ยังไม่มีรายการลา</div>}

            {monthKeys.map((mk) => <div key={mk}>
              <div style={{ fontSize: 12, fontWeight: 800, color: C.muted, margin: '4px 0 8px' }}>{monthFullLabel(mk)}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {grouped[mk].map((l) => { const st = STATUS[l.status] || STATUS.pending; return (
                  <button key={l.id} onClick={() => openDetail(l.id)} style={{ textAlign: 'left', border: `1px solid ${C.blueLine}`, background: C.card, borderRadius: 14, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                    <Avatar name={l.employee_name} size={36} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.employee_name}</div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{new Date(`${l.start_date}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })} · {l.leave_type}{Number(l.days) === 0.5 ? ' · ครึ่งวัน' : ''}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: st.dot }} />
                      <span style={{ fontSize: 11, color: st.text, fontWeight: 700 }}>{st.label}</span>
                    </div>
                  </button>
                )})}
              </div>
            </div>)}
          </>}

          {view === 'detail' && selected && (() => { const st = STATUS[selected.status] || STATUS.pending; const canDecide = isBoss && selected.status === 'pending'; const canCancel = selected.status === 'pending' && (selected.username === currentUser?.u || isBoss); return <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={() => setView('list')} style={{ border: 0, background: 'transparent', color: C.text, cursor: 'pointer', display: 'flex' }}><ChevronLeft size={22} /></button>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.text, flex: 1 }}>{selected.leave_type}</div>
              {selected.status === 'approved' && <div style={{ width: 34, height: 34, borderRadius: '50%', background: C.green, color: '#fff', display: 'grid', placeItems: 'center' }}><Check size={19} /></div>}
            </div>

            <div style={{ background: C.card, border: `1px solid ${C.blueLine}`, borderRadius: 16, padding: 18, display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Avatar name={selected.employee_name} size={46} />
                <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{selected.employee_name}</div>
              </div>
              <Row label="วันที่ลา" value={Number(selected.days) === 0.5 ? new Date(`${selected.start_date}T00:00:00`).toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }) : `${selected.start_date} – ${selected.end_date}`} />
              <Row label="จำนวน" value={`${selected.days} วัน${Number(selected.days) === 0.5 ? ' (ครึ่งวัน)' : ''}`} />
              <Row label="ประเภท" value={selected.leave_type} />
              {selected.reason && <Row label="เหตุผล" value={selected.reason} />}
              <Row label="สถานะ" value={<span style={{ color: st.text, fontWeight: 800 }}>{st.label}</span>} />
              <div style={{ fontSize: 11, color: C.faint, borderTop: `1px solid ${C.blueLine}`, paddingTop: 10 }}>ส่งคำขอ {new Date(selected.requested_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}
                {selected.decided_at && <div style={{ marginTop: 3 }}>{st.label} {new Date(selected.decided_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })} โดย {selected.decided_by}</div>}
              </div>
            </div>

            {canDecide && <div style={{ display: 'flex', gap: 10 }}>
              <button disabled={saving} onClick={() => decideLeave(selected.id, 'rejected')} style={{ flex: 1, border: `1px solid ${C.red}`, background: '#fff', color: C.red, borderRadius: 12, padding: '12px 0', fontWeight: 800, cursor: 'pointer' }}>ปฏิเสธ</button>
              <button disabled={saving} onClick={() => decideLeave(selected.id, 'approved')} style={{ flex: 1, border: 0, background: C.green, color: '#fff', borderRadius: 12, padding: '12px 0', fontWeight: 800, cursor: 'pointer' }}>ยืนยันอนุมัติ</button>
            </div>}
            {!canDecide && canCancel && <button disabled={saving} onClick={() => cancelLeave(selected.id)} style={{ border: `1px solid ${C.blueLine}`, background: '#fff', color: C.muted, borderRadius: 12, padding: '11px 0', fontWeight: 700, cursor: 'pointer' }}>ยกเลิกคำขอ</button>}
          </> })()}

          {view === 'form' && <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={() => setView('list')} style={{ border: 0, background: 'transparent', color: C.text, cursor: 'pointer', display: 'flex' }}><ChevronLeft size={22} /></button>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>แจ้งลางาน</div>
            </div>

            <form onSubmit={submitLeave} style={{ background: C.card, border: `1px solid ${C.blueLine}`, borderRadius: 16, padding: 18, display: 'grid', gap: 14 }}>
              {isBoss && people.length > 0 ? (
                <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 700, color: C.muted }}>ยื่นแทนพนักงาน (จากตาราง manpower)
                  <select value={form.employee_code} onChange={(e) => setForm({ ...form, employee_code: e.target.value })} style={inputStyle}>
                    <option value="">— ตัวเอง ({myName}) —</option>
                    {people.map((p) => <option key={p.code} value={p.code}>{p.name}{p.group ? ` (${p.group})` : ''}</option>)}
                  </select>
                </label>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Avatar name={myName} size={42} />
                  <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>พนักงาน : {myName}</div>
                </div>
              )}

              <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 700, color: C.muted }}>วันที่ลา
                <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value, end_date: form.half_day ? e.target.value : form.end_date })} style={inputStyle} required />
              </label>
              {!form.half_day && <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 700, color: C.muted }}>ถึงวันที่
                <input type="date" value={form.end_date} min={form.start_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} style={inputStyle} required />
              </label>}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: C.text, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.half_day} onChange={(e) => setForm({ ...form, half_day: e.target.checked, end_date: e.target.checked ? form.start_date : form.end_date })} />
                ลาครึ่งวัน
              </label>

              <div style={{ fontSize: 12, color: C.muted }}>จำนวน : <b style={{ color: C.blue }}>{form.half_day ? 0.5 : Math.max(1, Math.round((new Date(`${form.end_date}T00:00:00`) - new Date(`${form.start_date}T00:00:00`)) / 86400000) + 1)} วัน</b></div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 8 }}>ประเภทการลา</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {LEAVE_TYPES.map((t) => <button type="button" key={t} onClick={() => setForm({ ...form, leave_type: t })} style={pillBtn(form.leave_type === t)}>{t}</button>)}
                </div>
              </div>

              <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 700, color: C.muted }}>หมายเหตุ
                <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="ไม่จำเป็นต้องกรอก" style={inputStyle} />
              </label>

              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button type="button" onClick={() => setView('list')} style={{ flex: 1, border: `1px solid ${C.blueLine}`, background: '#fff', color: C.muted, borderRadius: 12, padding: '12px 0', fontWeight: 800, cursor: 'pointer' }}>ย้อนกลับ</button>
                <button disabled={saving} style={{ flex: 1, border: 0, background: C.blue, color: '#fff', borderRadius: 12, padding: '12px 0', fontWeight: 800, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>{saving ? 'กำลังส่ง…' : 'ส่งคำขอลางาน'}</button>
              </div>
            </form>
          </>}
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ position: 'sticky', bottom: 0, background: C.card, borderTop: `1px solid ${C.blueLine}`, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', padding: '8px 0 10px' }}>
          {[
            { icon: CalendarClock, label: 'วันลา', active: true },
            { icon: User, label: 'พนักงาน' },
            { icon: ListChecks, label: 'ตารางเวร' },
            { icon: MoreHorizontal, label: 'เพิ่มเติม' },
          ].map((t) => (
            <div key={t.label} style={{ textAlign: 'center', color: t.active ? C.blue : C.faint }}>
              <t.icon size={21} />
              <div style={{ fontSize: 11, marginTop: 2, fontWeight: t.active ? 700 : 500 }}>{t.label}</div>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}

function Row({ label, value }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
    <span style={{ color: C.muted }}>{label}</span>
    <span style={{ color: C.text, fontWeight: 700, textAlign: 'right' }}>{value}</span>
  </div>
}
