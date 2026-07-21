import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, RefreshCw, XCircle } from 'lucide-react'

const API = '/api/sheet-tools?op=hr'
const LEAVE_TYPES = ['พักร้อน', 'ลากิจ', 'ลาป่วย', 'ขาดงาน', 'สลับวันหยุด']
const EMPLOYEE_GROUPS = ['คนแพ็ก', 'คนฟีด', 'พาร์ทไทม์', 'อื่น ๆ', 'ออฟฟิศ']
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

async function readApiResponse(response) {
  try { return await response.json() } catch { return { success: false, error: `HTTP ${response.status}` } }
}

export default function HR() {
  const loadStarted = useRef(false)
  const [authEnabled, setAuthEnabled] = useState(true)
  useEffect(() => { fetch('/api/auth?action=status').then((r) => r.json()).then((d) => setAuthEnabled(!!d.enabled)).catch(() => {}) }, [])
  const currentUser = (() => { try { return JSON.parse(localStorage.getItem('payi-user') || 'null') } catch { return null } })()
  const isBoss = !authEnabled || currentUser?.role === 'admin'

  const [leave, setLeave] = useState([])
  const [people, setPeople] = useState([])
  const [activeMonths, setActiveMonths] = useState({})
  const [leaveBalances, setLeaveBalances] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [leaveForm, setLeaveForm] = useState({ employee_code: '', leave_type: LEAVE_TYPES[0], start_date: today(), end_date: today(), half_day: false, reason: '', backup_office: '' })
  const isSwap = leaveForm.leave_type === 'สลับวันหยุด'
  const officePeople = people.filter((p) => p.group === 'ออฟฟิศ')
  const [leaveLock, setLeaveLock] = useState({ locked: false, lockedDates: [] })
  const [empForm, setEmpForm] = useState({ code: '', name: '', group: EMPLOYEE_GROUPS[0] })
  const [showAddEmployee, setShowAddEmployee] = useState(false)
  const [editEmployees, setEditEmployees] = useState(false)

  // เช็คว่าช่วงที่เลือกทำให้บ้านล่างเหลือคนน้อยกว่าขั้นต่ำไหม — เช็คเฉพาะตอนยื่นแทนพนักงาน (มี employee_code)
  useEffect(() => {
    if (!leaveForm.employee_code) { setLeaveLock({ locked: false, lockedDates: [] }); return }
    const timer = setTimeout(() => {
      fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'check-leave-lock', ...leaveForm }) })
        .then((r) => r.json())
        .then((d) => { if (d.success) setLeaveLock({ locked: !!d.locked, lockedDates: d.lockedDates || [] }) })
        .catch(() => {})
    }, 300)
    return () => clearTimeout(timer)
  }, [leaveForm.employee_code, leaveForm.leave_type, leaveForm.start_date, leaveForm.end_date, leaveForm.half_day])

  const load = async () => {
    setLoading(true); setError('')
    try {
      const r = await fetch(API); const d = await readApiResponse(r)
      if (!r.ok || !d.success) throw new Error(d.error || 'โหลดข้อมูลไม่สำเร็จ')
      setLeave(d.leave || []); setPeople(d.people || []); setActiveMonths(d.activeMonths || {}); setLeaveBalances(d.leaveBalances || [])
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

  const submitLeave = async (e) => {
    e.preventDefault()
    if (leaveLock.locked && !leaveForm.backup_office) { setError('ต้องเลือกคนออฟฟิศมาทดแทนก่อน (บ้านล่างเหลือคนน้อยกว่าขั้นต่ำวันนี้)'); return }
    setSaving(true); setError('')
    try {
      const action = leaveForm.employee_code ? 'request-leave-for' : 'request-leave'
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...leaveForm }) })
      const d = await readApiResponse(r); if (!r.ok || !d.success) throw new Error(d.error || 'ส่งคำขอไม่สำเร็จ')
      setLeaveForm({ employee_code: '', leave_type: LEAVE_TYPES[0], start_date: today(), end_date: today(), half_day: false, reason: '', backup_office: '' })
      setLeaveLock({ locked: false, lockedDates: [] })
      await load()
    } catch (e2) { setError(e2.message) } finally { setSaving(false) }
  }

  const addEmployee = async (e) => {
    e.preventDefault(); setSaving(true); setError('')
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add-employee', ...empForm }) })
      const d = await readApiResponse(r); if (!r.ok || !d.success) throw new Error(d.error || 'เพิ่มพนักงานไม่สำเร็จ')
      setEmpForm({ code: '', name: '', group: EMPLOYEE_GROUPS[0] }); setShowAddEmployee(false)
      await load()
    } catch (e2) { setError(e2.message) } finally { setSaving(false) }
  }

  const editEmployeeGroup = async (code, group) => {
    setSaving(true); setError('')
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'edit-employee-group', code, group }) })
      const d = await readApiResponse(r); if (!r.ok || !d.success) throw new Error(d.error || 'แก้กลุ่มไม่สำเร็จ')
      await load()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  const removeEmployee = async (code, group, name) => {
    if (!window.confirm(`ลบ ${name} ออกจากรายชื่อพนักงานใช่ไหม? (ประวัติการลาเดิมยังอยู่)`)) return
    setSaving(true); setError('')
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'remove-employee', code, group }) })
      const d = await readApiResponse(r); if (!r.ok || !d.success) throw new Error(d.error || 'ลบไม่สำเร็จ')
      await load()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
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

  const myLeave = isBoss ? leave : leave.filter((l) => l.username === currentUser?.u)
  const pendingLeave = leave.filter((l) => l.status === 'pending')

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--payi-text-strong)' }}>คำขอลา</div>
        <button onClick={load} aria-label="รีเฟรช" style={{ border: '1px solid var(--payi-border)', background: 'var(--payi-surface)', borderRadius: 9, padding: 7, color: 'var(--payi-mint-strong)', cursor: 'pointer' }}><RefreshCw size={15} /></button>
      </div>

      {error && <div style={{ padding: '10px 14px', background: 'var(--payi-danger-bg)', color: 'var(--payi-danger)', border: '1px solid var(--payi-danger)', borderRadius: 10 }}>{error}</div>}

      <div style={{ display: 'grid', gap: 14 }}>
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
              <select className="payi-select" value={leaveForm.leave_type} onChange={(e) => setLeaveForm({ ...leaveForm, leave_type: e.target.value, half_day: false })}>
                {LEAVE_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 800, color: 'var(--payi-text)' }}>{isSwap ? 'จากวันที่ (วันหยุดเดิม)' : 'วันเริ่ม'}
              <input className="payi-date-input" type="date" value={leaveForm.start_date} onChange={(e) => setLeaveForm({ ...leaveForm, start_date: e.target.value })} required />
            </label>
            <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 800, color: 'var(--payi-text)' }}>{isSwap ? 'เป็นวันที่ (วันหยุดใหม่)' : 'วันสิ้นสุด'}
              <input className="payi-date-input" type="date" value={leaveForm.half_day ? leaveForm.start_date : leaveForm.end_date} min={isSwap ? undefined : leaveForm.start_date} disabled={leaveForm.half_day} onChange={(e) => setLeaveForm({ ...leaveForm, end_date: e.target.value })} required />
            </label>
            <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 800, color: 'var(--payi-text)' }}>เหตุผล
              <input className="payi-input" value={leaveForm.reason} onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} placeholder="ไม่จำเป็นต้องกรอก" />
            </label>
          </div>
          {!isSwap && <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 800, color: 'var(--payi-text)', cursor: 'pointer' }}>
            <input type="checkbox" checked={leaveForm.half_day} onChange={(e) => setLeaveForm({ ...leaveForm, half_day: e.target.checked, end_date: e.target.checked ? leaveForm.start_date : leaveForm.end_date })} />
            ลาครึ่งวัน (0.5 วัน)
          </label>}
          {leaveLock.locked && (
            <div style={{ display: 'grid', gap: 8, padding: 12, background: 'var(--payi-warning-bg)', border: '1px solid var(--payi-warning)', borderRadius: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--payi-warning)' }}>
                วันที่ {leaveLock.lockedDates.join(', ')} บ้านล่างจะเหลือคนน้อยกว่า 3 คน — ต้องเลือกคนออฟฟิศมาทดแทนก่อนส่งคำขอ
              </div>
              <select className="payi-select" value={leaveForm.backup_office} onChange={(e) => setLeaveForm({ ...leaveForm, backup_office: e.target.value })} required>
                <option value="">— เลือกคนออฟฟิศทดแทน —</option>
                {officePeople.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
              </select>
            </div>
          )}
          <button disabled={saving} className="payi-btn-primary" style={{ justifySelf: 'start', padding: '11px 20px', opacity: saving ? 0.6 : 1 }}>{saving ? 'กำลังบันทึก…' : 'ส่งคำขอลา'}</button>
        </form>

        {leaveBalances.length > 0 && <section style={{ ...card, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--payi-text-strong)' }}>วันลาพักร้อนคงเหลือ · ปี {new Date().getFullYear() + 543}</div>
            {isBoss && <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setEditEmployees((v) => !v)} style={{ border: '1px solid var(--payi-border)', background: editEmployees ? 'var(--payi-danger-bg)' : 'var(--payi-surface)', color: editEmployees ? 'var(--payi-danger)' : 'var(--payi-text-muted)', borderRadius: 9, padding: '7px 13px', fontWeight: 800, cursor: 'pointer', fontSize: 12 }}>{editEmployees ? 'เสร็จแล้ว' : 'แก้ไข'}</button>
              <button onClick={() => setShowAddEmployee((v) => !v)} style={{ border: '1px solid var(--payi-mint)', background: showAddEmployee ? 'var(--payi-mint-soft)' : 'var(--payi-surface)', color: 'var(--payi-mint-strong)', borderRadius: 9, padding: '7px 13px', fontWeight: 800, cursor: 'pointer', fontSize: 12 }}>{showAddEmployee ? 'ยกเลิก' : '+ เพิ่มพนักงาน'}</button>
            </div>}
          </div>
          {isBoss && showAddEmployee && <form onSubmit={addEmployee} style={{ padding: '0 20px 16px', display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr)) auto', gap: 10, alignItems: 'end' }}>
            <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 800, color: 'var(--payi-text)' }}>รหัส
              <input className="payi-input" value={empForm.code} onChange={(e) => setEmpForm({ ...empForm, code: e.target.value })} placeholder="เช่น TANG" required />
            </label>
            <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 800, color: 'var(--payi-text)' }}>ชื่อ
              <input className="payi-input" value={empForm.name} onChange={(e) => setEmpForm({ ...empForm, name: e.target.value })} placeholder="เช่น แตง" required />
            </label>
            <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 800, color: 'var(--payi-text)' }}>กลุ่ม
              <select className="payi-select" value={empForm.group} onChange={(e) => setEmpForm({ ...empForm, group: e.target.value })}>
                {EMPLOYEE_GROUPS.map((g) => <option key={g}>{g}</option>)}
              </select>
            </label>
            <button disabled={saving} className="payi-btn-primary" style={{ padding: '11px 16px', opacity: saving ? 0.6 : 1 }}>{saving ? 'กำลังบันทึก…' : 'เพิ่ม'}</button>
          </form>}
          {[
            { key: 'บ้านล่าง', label: 'บ้านล่าง', rows: leaveBalances.filter((b) => b.group !== 'ออฟฟิศ') },
            { key: 'ออฟฟิศ', label: 'ออฟฟิศ', rows: leaveBalances.filter((b) => b.group === 'ออฟฟิศ') },
          ].filter((g) => g.rows.length > 0).map((g) => (
            <div key={g.key} style={{ padding: '0 20px 16px' }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--payi-text-muted)', margin: '10px 0 6px' }}>{g.label}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {g.rows.map((b) => (
                  <div key={b.code} style={{ position: 'relative', border: '1px solid var(--payi-border)', borderRadius: 10, padding: '8px 12px', minWidth: 120 }}>
                    {isBoss && editEmployees && <button onClick={() => removeEmployee(b.code, b.group, b.name)} aria-label={`ลบ ${b.name}`} title="ลบพนักงาน" style={{ position: 'absolute', top: 4, right: 4, border: 0, background: 'var(--payi-danger-bg)', color: 'var(--payi-danger)', borderRadius: 999, width: 18, height: 18, display: 'grid', placeItems: 'center', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>}
                    <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--payi-text-strong)' }}>{b.name}</div>
                    <div style={{ fontSize: 12, color: b.remaining <= 0 ? 'var(--payi-danger)' : 'var(--payi-text-muted)' }}>เหลือ <b>{b.remaining}</b> / {b.quota} วัน</div>
                    {isBoss && editEmployees && b.group !== 'ออฟฟิศ' && (
                      <select className="payi-select" value={b.group} onChange={(e) => editEmployeeGroup(b.code, e.target.value)} style={{ marginTop: 6, fontSize: 11, padding: '3px 5px' }}>
                        {EMPLOYEE_GROUPS.filter((g) => g !== 'ออฟฟิศ').map((g) => <option key={g}>{g}</option>)}
                      </select>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>}

        {isBoss && pendingLeave.length > 0 && <section style={{ ...card, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', fontSize: 15, fontWeight: 900, color: 'var(--payi-text-strong)' }}>รออนุมัติ · {pendingLeave.length} รายการ</div>
          <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700, fontSize: 13 }}>
            <thead><tr style={{ background: 'var(--payi-surface-muted)', color: 'var(--payi-text-muted)', textAlign: 'left' }}>{['พนักงาน', 'ประเภท', 'วันที่', 'จำนวนวัน', 'เหตุผล', ''].map((h) => <th key={h} style={{ padding: '10px 12px' }}>{h}</th>)}</tr></thead>
            <tbody>{pendingLeave.map((l) => <tr key={l.id} style={{ borderTop: '1px solid var(--payi-line)' }}>
              <td style={{ ...td, fontWeight: 900 }}>{l.employee_name}</td>
              <td style={td}>{l.leave_type}</td>
              <td style={td}>{l.start_date} – {l.end_date}</td>
              <td style={td}>{l.days}</td>
              <td style={td}>{l.reason || '-'}{l.backup_office && <div style={{ fontSize: 11, color: 'var(--payi-warning)', fontWeight: 800 }}>ทดแทน: {people.find((p) => p.code === l.backup_office)?.name || l.backup_office}</div>}</td>
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
      </div>
    </div>
  )
}
