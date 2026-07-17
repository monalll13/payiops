import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, RefreshCw, XCircle } from 'lucide-react'

const API = '/api/sheet-tools?op=hr'
const LEAVE_TYPES = ['พักร้อน', 'ลากิจ', 'ลาป่วย', 'ขาดงาน', 'สลับวันหยุด']
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })

const card = { background: 'var(--payi-surface)', border: '1px solid var(--payi-border)', borderRadius: 16, boxShadow: 'var(--payi-shadow)' }
const td = { padding: '11px 12px', color: 'var(--payi-text)', verticalAlign: 'middle' }

function StatusBadge({ status }) {
  const map = {
    pending: { bg: 'var(--payi-warning-bg)', fg: 'var(--payi-warning)', label: 'รอพิจารณา' },
    approved: { bg: 'var(--payi-success-bg)', fg: 'var(--payi-success)', label: 'อนุมัติแล้ว' },
    rejected: { bg: 'var(--payi-danger-bg)', fg: 'var(--payi-danger)', label: 'ไม่อนุมัติ' },
  }
  const s = map[status] || map.pending
  return <span style={{ background: s.bg, color: s.fg, borderRadius: 999, padding: '3px 10px', fontSize: 11, fontWeight: 800 }}>{s.label}</span>
}

function miniTab(active) {
  return { border: `1px solid ${active ? 'var(--payi-mint)' : 'var(--payi-border)'}`, background: active ? 'var(--payi-mint-soft)' : 'var(--payi-surface)', color: active ? 'var(--payi-mint-strong)' : 'var(--payi-text-muted)', borderRadius: 9, padding: '7px 13px', fontWeight: 800, cursor: 'pointer', fontSize: 12 }
}

async function readApiResponse(response) {
  try { return await response.json() } catch { return { success: false, error: `HTTP ${response.status}` } }
}

export default function HR() {
  const loadStarted = useRef(false)
  const [authEnabled, setAuthEnabled] = useState(true)
  useEffect(() => { fetch('/api/auth?action=status').then((r) => r.json()).then((d) => setAuthEnabled(!!d.enabled)).catch(() => {}) }, [])
  const currentUser = (() => { try { return JSON.parse(localStorage.getItem('payi-user') || 'null') } catch { return null } })()
  const isBoss = !authEnabled || currentUser?.role === 'admin'

  const [tab, setTab] = useState('leave')
  const [leave, setLeave] = useState([])
  const [schedule, setSchedule] = useState([])
  const [users, setUsers] = useState([])
  const [people, setPeople] = useState([])
  const [activeMonths, setActiveMonths] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [leaveForm, setLeaveForm] = useState({ employee_code: '', leave_type: LEAVE_TYPES[0], start_date: today(), end_date: today(), half_day: false, reason: '' })
  const [schedForm, setSchedForm] = useState({ date: today(), username: '', shift_start: '09:00', shift_end: '17:00', role_note: '' })

  const load = async () => {
    setLoading(true); setError('')
    try {
      const r = await fetch(API); const d = await readApiResponse(r)
      if (!r.ok || !d.success) throw new Error(d.error || 'โหลดข้อมูลไม่สำเร็จ')
      setLeave(d.leave || []); setSchedule(d.schedule || []); setPeople(d.people || []); setActiveMonths(d.activeMonths || {})
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }

  // กรองคนในตาราง manpower ให้เหลือแค่คนที่มีงานจริงเดือนที่เลือก (ตัดคนออกแล้ว/พาร์ทไทม์ที่ไม่ได้ทำเดือนนั้น)
  // ถ้าไม่มีข้อมูลเดือนเลย (ไฟล์ manpower โหลดไม่ได้/ยังไม่มี) โชว์ทุกคนไว้ก่อน กันไม่ให้ dropdown ว่างเปล่า
  const peopleForMonth = (month) => {
    const hasData = Object.keys(activeMonths).length > 0
    if (!hasData) return people
    return people.filter((p) => (activeMonths[p.code] || []).includes(month))
  }
  useEffect(() => { if (loadStarted.current) return; loadStarted.current = true; load() }, [])
  useEffect(() => {
    if (!isBoss || !authEnabled) return
    fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'list-users' }) })
      .then((r) => r.json()).then((d) => { if (d.success) setUsers(d.users || []) }).catch(() => {})
  }, [isBoss, authEnabled])

  const submitLeave = async (e) => {
    e.preventDefault(); setSaving(true); setError('')
    try {
      const action = leaveForm.employee_code ? 'request-leave-for' : 'request-leave'
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...leaveForm }) })
      const d = await readApiResponse(r); if (!r.ok || !d.success) throw new Error(d.error || 'ส่งคำขอไม่สำเร็จ')
      setLeaveForm({ employee_code: '', leave_type: LEAVE_TYPES[0], start_date: today(), end_date: today(), half_day: false, reason: '' })
      await load()
    } catch (e2) { setError(e2.message) } finally { setSaving(false) }
  }

  const decideLeave = async (id, decision) => {
    setSaving(true); setError('')
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'decide-leave', id, decision }) })
      const d = await readApiResponse(r); if (!r.ok || !d.success) throw new Error(d.error || 'บันทึกไม่สำเร็จ')
      await load()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  const cancelLeave = async (id) => {
    if (!window.confirm('ยกเลิกคำขอลานี้ใช่ไหม?')) return
    setSaving(true); setError('')
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel-leave', id }) })
      const d = await readApiResponse(r); if (!r.ok || !d.success) throw new Error(d.error || 'ยกเลิกไม่สำเร็จ')
      await load()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  const submitSchedule = async (e) => {
    e.preventDefault(); setSaving(true); setError('')
    try {
      const picked = users.find((u) => u.username === schedForm.username)
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create-schedule', ...schedForm, employee_name: picked?.display_name || schedForm.username }) })
      const d = await readApiResponse(r); if (!r.ok || !d.success) throw new Error(d.error || 'บันทึกไม่สำเร็จ')
      setSchedForm({ ...schedForm, role_note: '' })
      await load()
    } catch (e2) { setError(e2.message) } finally { setSaving(false) }
  }

  const deleteSchedule = async (id) => {
    if (!window.confirm('ลบตารางเวรนี้ใช่ไหม?')) return
    setSaving(true); setError('')
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete-schedule', id }) })
      const d = await readApiResponse(r); if (!r.ok || !d.success) throw new Error(d.error || 'ลบไม่สำเร็จ')
      await load()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  const myLeave = isBoss ? leave : leave.filter((l) => l.username === currentUser?.u)
  const pendingLeave = leave.filter((l) => l.status === 'pending')
  const mySchedule = isBoss ? schedule : schedule.filter((s) => s.username === currentUser?.u)

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setTab('leave')} style={miniTab(tab === 'leave')}>คำขอลา</button>
          <button onClick={() => setTab('schedule')} style={miniTab(tab === 'schedule')}>ตารางเวรพนักงาน</button>
        </div>
        <button onClick={load} aria-label="รีเฟรช" style={{ border: '1px solid var(--payi-border)', background: 'var(--payi-surface)', borderRadius: 9, padding: 7, color: 'var(--payi-mint-strong)', cursor: 'pointer' }}><RefreshCw size={15} /></button>
      </div>

      {error && <div style={{ padding: '10px 14px', background: 'var(--payi-danger-bg)', color: 'var(--payi-danger)', border: '1px solid var(--payi-danger)', borderRadius: 10 }}>{error}</div>}

      {tab === 'leave' && <div style={{ display: 'grid', gap: 14 }}>
        <form onSubmit={submitLeave} style={{ ...card, padding: 20, display: 'grid', gap: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--payi-text-strong)' }}>ส่งคำขอลา</div>
          {isBoss && people.length > 0 && (
            <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 800, color: 'var(--payi-text)' }}>ยื่นแทนพนักงาน (จากตาราง manpower เดือน{leaveForm.start_date.slice(0, 7)})
              <select className="payi-select" value={leaveForm.employee_code} onChange={(e) => setLeaveForm({ ...leaveForm, employee_code: e.target.value })}>
                <option value="">— ตัวเอง —</option>
                {peopleForMonth(leaveForm.start_date.slice(0, 7)).map((p) => <option key={p.code} value={p.code}>{p.name}{p.group ? ` (${p.group})` : ''}</option>)}
              </select>
            </label>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 12 }}>
            <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 800, color: 'var(--payi-text)' }}>ประเภทการลา
              <select className="payi-select" value={leaveForm.leave_type} onChange={(e) => setLeaveForm({ ...leaveForm, leave_type: e.target.value })}>
                {LEAVE_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 800, color: 'var(--payi-text)' }}>วันเริ่ม
              <input className="payi-date-input" type="date" value={leaveForm.start_date} onChange={(e) => setLeaveForm({ ...leaveForm, start_date: e.target.value })} required />
            </label>
            <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 800, color: 'var(--payi-text)' }}>วันสิ้นสุด
              <input className="payi-date-input" type="date" value={leaveForm.half_day ? leaveForm.start_date : leaveForm.end_date} min={leaveForm.start_date} disabled={leaveForm.half_day} onChange={(e) => setLeaveForm({ ...leaveForm, end_date: e.target.value })} required />
            </label>
            <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 800, color: 'var(--payi-text)' }}>เหตุผล
              <input className="payi-input" value={leaveForm.reason} onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} placeholder="ไม่จำเป็นต้องกรอก" />
            </label>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 800, color: 'var(--payi-text)', cursor: 'pointer' }}>
            <input type="checkbox" checked={leaveForm.half_day} onChange={(e) => setLeaveForm({ ...leaveForm, half_day: e.target.checked, end_date: e.target.checked ? leaveForm.start_date : leaveForm.end_date })} />
            ลาครึ่งวัน (0.5 วัน)
          </label>
          <button disabled={saving} className="payi-btn-primary" style={{ justifySelf: 'start', padding: '11px 20px', opacity: saving ? 0.6 : 1 }}>{saving ? 'กำลังบันทึก…' : 'ส่งคำขอลา'}</button>
        </form>

        {isBoss && pendingLeave.length > 0 && <section style={{ ...card, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', fontSize: 15, fontWeight: 900, color: 'var(--payi-text-strong)' }}>รออนุมัติ · {pendingLeave.length} รายการ</div>
          <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700, fontSize: 13 }}>
            <thead><tr style={{ background: 'var(--payi-surface-muted)', color: 'var(--payi-text-muted)', textAlign: 'left' }}>{['พนักงาน', 'ประเภท', 'วันที่', 'จำนวนวัน', 'เหตุผล', ''].map((h) => <th key={h} style={{ padding: '10px 12px' }}>{h}</th>)}</tr></thead>
            <tbody>{pendingLeave.map((l) => <tr key={l.id} style={{ borderTop: '1px solid var(--payi-line)' }}>
              <td style={{ ...td, fontWeight: 900 }}>{l.employee_name}</td>
              <td style={td}>{l.leave_type}</td>
              <td style={td}>{l.start_date} – {l.end_date}</td>
              <td style={td}>{l.days}</td>
              <td style={td}>{l.reason || '-'}</td>
              <td style={td}><div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => decideLeave(l.id, 'approved')} aria-label="อนุมัติ" style={{ border: 0, background: 'var(--payi-success-bg)', color: 'var(--payi-success)', borderRadius: 8, padding: 7, cursor: 'pointer' }}><CheckCircle2 size={16} /></button>
                <button onClick={() => decideLeave(l.id, 'rejected')} aria-label="ไม่อนุมัติ" style={{ border: 0, background: 'var(--payi-danger-bg)', color: 'var(--payi-danger)', borderRadius: 8, padding: 7, cursor: 'pointer' }}><XCircle size={16} /></button>
              </div></td>
            </tr>)}</tbody>
          </table></div>
        </section>}

        <section style={{ ...card, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', fontSize: 15, fontWeight: 900, color: 'var(--payi-text-strong)' }}>{isBoss ? 'คำขอลาทั้งหมด' : 'คำขอลาของฉัน'}</div>
          {loading ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--payi-text-faint)' }}>กำลังโหลด…</div>
            : !myLeave.length ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--payi-text-faint)' }}>ยังไม่มีคำขอลา</div>
            : <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760, fontSize: 13 }}>
              <thead><tr style={{ background: 'var(--payi-surface-muted)', color: 'var(--payi-text-muted)', textAlign: 'left' }}>{['พนักงาน', 'ประเภท', 'วันที่', 'จำนวนวัน', 'สถานะ', ''].map((h) => <th key={h} style={{ padding: '10px 12px' }}>{h}</th>)}</tr></thead>
              <tbody>{myLeave.slice().reverse().map((l) => <tr key={l.id} style={{ borderTop: '1px solid var(--payi-line)' }}>
                <td style={{ ...td, fontWeight: 900 }}>{l.employee_name}</td>
                <td style={td}>{l.leave_type}</td>
                <td style={td}>{l.start_date} – {l.end_date}</td>
                <td style={td}>{l.days}</td>
                <td style={td}><StatusBadge status={l.status} /></td>
                <td style={td}>{l.status === 'pending' && (l.username === currentUser?.u || isBoss) && <button onClick={() => cancelLeave(l.id)} style={{ border: '1px solid var(--payi-danger)', background: 'transparent', color: 'var(--payi-danger)', borderRadius: 8, padding: '5px 10px', fontWeight: 800, cursor: 'pointer', fontSize: 11 }}>ยกเลิก</button>}</td>
              </tr>)}</tbody>
            </table></div>}
        </section>
      </div>}

      {tab === 'schedule' && <div style={{ display: 'grid', gap: 14 }}>
        {isBoss && <form onSubmit={submitSchedule} style={{ ...card, padding: 20, display: 'grid', gap: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--payi-text-strong)' }}>เพิ่มตารางเวร</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,minmax(0,1fr))', gap: 12 }}>
            <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 800, color: 'var(--payi-text)' }}>วันที่
              <input className="payi-date-input" type="date" value={schedForm.date} onChange={(e) => setSchedForm({ ...schedForm, date: e.target.value })} required />
            </label>
            <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 800, color: 'var(--payi-text)' }}>พนักงาน
              {users.length ? <select className="payi-select" value={schedForm.username} onChange={(e) => setSchedForm({ ...schedForm, username: e.target.value })} required>
                <option value="">เลือก...</option>
                {users.map((u) => <option key={u.username} value={u.username}>{u.display_name}</option>)}
              </select> : <input className="payi-input" value={schedForm.username} onChange={(e) => setSchedForm({ ...schedForm, username: e.target.value })} placeholder="username" required />}
            </label>
            <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 800, color: 'var(--payi-text)' }}>เริ่มกะ
              <input className="payi-input" type="time" value={schedForm.shift_start} onChange={(e) => setSchedForm({ ...schedForm, shift_start: e.target.value })} required />
            </label>
            <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 800, color: 'var(--payi-text)' }}>จบกะ
              <input className="payi-input" type="time" value={schedForm.shift_end} onChange={(e) => setSchedForm({ ...schedForm, shift_end: e.target.value })} required />
            </label>
            <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 800, color: 'var(--payi-text)' }}>หมายเหตุ
              <input className="payi-input" value={schedForm.role_note} onChange={(e) => setSchedForm({ ...schedForm, role_note: e.target.value })} placeholder="ไม่จำเป็นต้องกรอก" />
            </label>
          </div>
          <button disabled={saving} className="payi-btn-primary" style={{ justifySelf: 'start', padding: '11px 20px', opacity: saving ? 0.6 : 1 }}>{saving ? 'กำลังบันทึก…' : 'บันทึกตารางเวร'}</button>
        </form>}

        <section style={{ ...card, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', fontSize: 15, fontWeight: 900, color: 'var(--payi-text-strong)' }}>{isBoss ? 'ตารางเวรทั้งหมด' : 'ตารางเวรของฉัน'}</div>
          {loading ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--payi-text-faint)' }}>กำลังโหลด…</div>
            : !mySchedule.length ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--payi-text-faint)' }}>ยังไม่มีตารางเวร</div>
            : <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700, fontSize: 13 }}>
              <thead><tr style={{ background: 'var(--payi-surface-muted)', color: 'var(--payi-text-muted)', textAlign: 'left' }}>{['วันที่', 'พนักงาน', 'เวลากะ', 'หมายเหตุ', ...(isBoss ? [''] : [])].map((h) => <th key={h} style={{ padding: '10px 12px' }}>{h}</th>)}</tr></thead>
              <tbody>{mySchedule.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).map((s) => <tr key={s.id} style={{ borderTop: '1px solid var(--payi-line)' }}>
                <td style={td}>{s.date}</td>
                <td style={{ ...td, fontWeight: 900 }}>{s.employee_name}</td>
                <td style={td}>{s.shift_start}–{s.shift_end}</td>
                <td style={td}>{s.role_note || '-'}</td>
                {isBoss && <td style={td}><button onClick={() => deleteSchedule(s.id)} style={{ border: '1px solid var(--payi-danger)', background: 'transparent', color: 'var(--payi-danger)', borderRadius: 8, padding: '5px 10px', fontWeight: 800, cursor: 'pointer', fontSize: 11 }}>ลบ</button></td>}
              </tr>)}</tbody>
            </table></div>}
        </section>
      </div>}
    </div>
  )
}
