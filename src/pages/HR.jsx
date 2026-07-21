import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle, CalendarDays, Check, Clock3, Pencil, Plus, RefreshCw,
  Send, ShieldCheck, UsersRound, X,
} from 'lucide-react'
import './HR.css'

const API = '/api/sheet-tools?op=hr'
const LEAVE_TYPES = ['พักร้อน', 'ลากิจ', 'ลาป่วย', 'ขาดงาน', 'สลับวันหยุด']
const EMPLOYEE_GROUPS = ['คนแพ็ก', 'คนฟีด', 'พาร์ทไทม์', 'อื่น ๆ', 'ออฟฟิศ']
const NO_VACATION_GROUPS = new Set(['คนฟีด', 'พาร์ทไทม์'])
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
const thaiYear = new Date().getFullYear() + 543

const STATUS = {
  pending: { label: 'รอพิจารณา', className: 'is-pending' },
  approved: { label: 'อนุมัติแล้ว', className: 'is-approved' },
  rejected: { label: 'ไม่อนุมัติ', className: 'is-rejected' },
}

const formatDate = (value) => value
  ? new Date(`${value}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
  : '—'

const formatDateRange = (leave) => {
  if (leave.leave_type === 'สลับวันหยุด') return `${formatDate(leave.start_date)} → ${formatDate(leave.end_date)}`
  return leave.start_date === leave.end_date ? formatDate(leave.start_date) : `${formatDate(leave.start_date)} – ${formatDate(leave.end_date)}`
}

function StatusBadge({ status }) {
  const item = STATUS[status] || STATUS.pending
  return <span className={`hr-status ${item.className}`}><span aria-hidden="true" />{item.label}</span>
}

function Field({ label, children, className = '' }) {
  return <label className={`hr-field ${className}`}><span>{label}</span>{children}</label>
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
  const [leaveLock, setLeaveLock] = useState({ locked: false, lockedDates: [] })
  const [empForm, setEmpForm] = useState({ code: '', name: '', group: EMPLOYEE_GROUPS[0] })
  const [showAddEmployee, setShowAddEmployee] = useState(false)
  const [editEmployees, setEditEmployees] = useState(false)
  const isSwap = leaveForm.leave_type === 'สลับวันหยุด'
  const officePeople = people.filter((p) => p.group === 'ออฟฟิศ')
  const selectedEmployee = people.find((person) => person.code === leaveForm.employee_code)
  const availableLeaveTypes = selectedEmployee && NO_VACATION_GROUPS.has(selectedEmployee.group) ? LEAVE_TYPES.filter((type) => type !== 'พักร้อน') : LEAVE_TYPES
  const vacationLeaveBalances = leaveBalances.filter((item) => !NO_VACATION_GROUPS.has(item.group))
  const { employee_code: leaveEmployeeCode, leave_type: leaveType, start_date: leaveStartDate, end_date: leaveEndDate, half_day: leaveHalfDay } = leaveForm

  useEffect(() => {
    if (!leaveEmployeeCode) return
    const timer = setTimeout(() => {
      fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'check-leave-lock', employee_code: leaveEmployeeCode, leave_type: leaveType, start_date: leaveStartDate, end_date: leaveEndDate, half_day: leaveHalfDay }) })
        .then((r) => r.json())
        .then((d) => { if (d.success) setLeaveLock({ locked: !!d.locked, lockedDates: d.lockedDates || [] }) })
        .catch(() => {})
    }, 300)
    return () => clearTimeout(timer)
  }, [leaveEmployeeCode, leaveType, leaveStartDate, leaveEndDate, leaveHalfDay])

  const load = async () => {
    setLoading(true); setError('')
    try {
      const response = await fetch(API); const data = await readApiResponse(response)
      if (!response.ok || !data.success) throw new Error(data.error || 'โหลดข้อมูลไม่สำเร็จ')
      setLeave(data.leave || []); setPeople(data.people || []); setActiveMonths(data.activeMonths || {}); setLeaveBalances(data.leaveBalances || [])
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }

  const peopleForMonth = (month) => {
    if (!Object.keys(activeMonths).length) return people
    return people.filter((person) => (activeMonths[person.code] || []).includes(month))
  }
  useEffect(() => { if (loadStarted.current) return; loadStarted.current = true; load() }, [])

  const postAction = async (body, fallbackError) => {
    const response = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await readApiResponse(response)
    if (!response.ok || !data.success) throw new Error(data.error || fallbackError)
    return data
  }

  const submitLeave = async (event) => {
    event.preventDefault()
    if (leaveLock.locked && !leaveForm.backup_office) { setError('ต้องเลือกคนออฟฟิศมาทดแทนก่อน (บ้านล่างเหลือคนน้อยกว่าขั้นต่ำวันนี้)'); return }
    setSaving(true); setError('')
    try {
      await postAction({ action: leaveForm.employee_code ? 'request-leave-for' : 'request-leave', ...leaveForm }, 'ส่งคำขอไม่สำเร็จ')
      setLeaveForm({ employee_code: '', leave_type: LEAVE_TYPES[0], start_date: today(), end_date: today(), half_day: false, reason: '', backup_office: '' })
      setLeaveLock({ locked: false, lockedDates: [] }); await load()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  const addEmployee = async (event) => {
    event.preventDefault(); setSaving(true); setError('')
    try {
      await postAction({ action: 'add-employee', ...empForm }, 'เพิ่มพนักงานไม่สำเร็จ')
      setEmpForm({ code: '', name: '', group: EMPLOYEE_GROUPS[0] }); setShowAddEmployee(false); await load()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  const editEmployeeGroup = async (code, group) => {
    setSaving(true); setError('')
    try { await postAction({ action: 'edit-employee-group', code, group }, 'แก้กลุ่มไม่สำเร็จ'); await load() }
    catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  const removeEmployee = async (code, group, name) => {
    if (!window.confirm(`ลบ ${name} ออกจากรายชื่อพนักงานใช่ไหม? (ประวัติการลาเดิมยังอยู่)`)) return
    setSaving(true); setError('')
    try { await postAction({ action: 'remove-employee', code, group }, 'ลบไม่สำเร็จ'); await load() }
    catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  const decideLeave = async (id, decision) => {
    setSaving(true); setError('')
    try { await postAction({ action: 'decide-leave', id, decision }, 'บันทึกไม่สำเร็จ'); await load() }
    catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  const cancelLeave = async (id) => {
    if (!window.confirm('ยกเลิกคำขอลานี้ใช่ไหม?')) return
    setSaving(true); setError('')
    try { await postAction({ action: 'cancel-leave', id }, 'ยกเลิกไม่สำเร็จ'); await load() }
    catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  const myLeave = isBoss ? leave : leave.filter((item) => item.username === currentUser?.u)
  const pendingLeave = leave.filter((item) => item.status === 'pending')
  const approvedThisMonth = leave.filter((item) => item.status === 'approved' && String(item.start_date).slice(0, 7) === today().slice(0, 7)).length
  const peopleOnLeaveToday = leave.filter((item) => item.status === 'approved' && item.leave_type !== 'สลับวันหยุด' && item.start_date <= today() && item.end_date >= today()).length

  return (
    <main className="hr-page" id="main-content">
      <header className="hr-page-header">
        <div>
          <span className="hr-eyebrow"><ShieldCheck size={15} /> HR workspace</span>
          <h1>จัดการวันลา</h1>
          <p>อนุมัติคำขอ ดูยอดคงเหลือ และยื่นแทนพนักงานในที่เดียว</p>
        </div>
        <button className="hr-icon-button" onClick={load} aria-label="รีเฟรชข้อมูล" title="รีเฟรชข้อมูล"><RefreshCw size={18} /></button>
      </header>

      {error && <div className="hr-alert is-error" role="alert"><AlertTriangle size={18} /><span>{error}</span></div>}

      <section className="hr-metrics" aria-label="ภาพรวมวันลา">
        <article className="hr-metric is-emphasis"><div className="hr-metric-icon"><Clock3 size={20} /></div><div><span>รออนุมัติ</span><strong>{pendingLeave.length}</strong><small>รายการที่ต้องจัดการ</small></div></article>
        <article className="hr-metric"><div className="hr-metric-icon"><CalendarDays size={20} /></div><div><span>ลาวันนี้</span><strong>{peopleOnLeaveToday}</strong><small>คนที่อนุมัติแล้ว</small></div></article>
        <article className="hr-metric"><div className="hr-metric-icon"><Check size={20} /></div><div><span>อนุมัติเดือนนี้</span><strong>{approvedThisMonth}</strong><small>รายการ</small></div></article>
        <article className="hr-metric"><div className="hr-metric-icon"><UsersRound size={20} /></div><div><span>พนักงานในระบบ</span><strong>{people.length}</strong><small>คน</small></div></article>
      </section>

      {!!vacationLeaveBalances.length && <section className="hr-panel" aria-labelledby="balance-heading">
        <div className="hr-section-heading hr-balance-heading">
          <div><span className="hr-section-kicker">โควตาปี {thaiYear}</span><h2 id="balance-heading">วันลาพักร้อนคงเหลือ</h2></div>
          {isBoss && <div className="hr-toolbar"><button className={`hr-button is-secondary ${editEmployees ? 'is-active' : ''}`} onClick={() => setEditEmployees((value) => !value)}><Pencil size={16} />{editEmployees ? 'เสร็จแล้ว' : 'แก้ไขกลุ่ม'}</button><button className="hr-button is-secondary" onClick={() => setShowAddEmployee((value) => !value)}><Plus size={17} />{showAddEmployee ? 'ปิด' : 'เพิ่มพนักงาน'}</button></div>}
        </div>
        {isBoss && showAddEmployee && <form className="hr-add-employee" onSubmit={addEmployee}>
          <Field label="รหัส"><input value={empForm.code} onChange={(e) => setEmpForm({ ...empForm, code: e.target.value })} placeholder="เช่น TANG" required /></Field>
          <Field label="ชื่อ"><input value={empForm.name} onChange={(e) => setEmpForm({ ...empForm, name: e.target.value })} placeholder="ชื่อพนักงาน" required /></Field>
          <Field label="กลุ่ม"><select value={empForm.group} onChange={(e) => setEmpForm({ ...empForm, group: e.target.value })}>{EMPLOYEE_GROUPS.map((group) => <option key={group}>{group}</option>)}</select></Field>
          <button className="hr-button is-primary" disabled={saving}><Plus size={17} />เพิ่ม</button>
        </form>}
        <div className="hr-balance-groups">{[
          { key: 'lower', label: 'บ้านล่าง', rows: vacationLeaveBalances.filter((item) => item.group !== 'ออฟฟิศ') },
          { key: 'office', label: 'ออฟฟิศ', rows: vacationLeaveBalances.filter((item) => item.group === 'ออฟฟิศ') },
        ].filter((group) => group.rows.length).map((group) => <div className="hr-balance-group" key={group.key}><h3>{group.label}<span>{group.rows.length} คน</span></h3><div className="hr-balance-grid">{group.rows.map((item) => {
          const percentage = item.quota > 0 ? Math.max(0, Math.min(100, (item.remaining / item.quota) * 100)) : 0
          return <article className={`hr-balance-card ${item.remaining <= 0 ? 'is-empty' : ''}`} key={item.code}>
            <div className="hr-balance-card-top"><div className="hr-avatar is-small" aria-hidden="true">{item.name?.trim().slice(0, 1) || '?'}</div><div><strong>{item.name}</strong><span>{item.group}</span></div>{isBoss && editEmployees && <button className="hr-remove-button" onClick={() => removeEmployee(item.code, item.group, item.name)} aria-label={`ลบ ${item.name}`}><X size={15} /></button>}</div>
            <div className="hr-balance-value"><strong>{item.remaining}</strong><span>/ {item.quota} วัน</span></div>
            <div className="hr-progress" aria-label={`เหลือ ${item.remaining} จาก ${item.quota} วัน`}><span style={{ width: `${percentage}%` }} /></div>
            {isBoss && editEmployees && item.group !== 'ออฟฟิศ' && <select aria-label={`กลุ่มของ ${item.name}`} value={item.group} onChange={(e) => editEmployeeGroup(item.code, e.target.value)}>{EMPLOYEE_GROUPS.filter((value) => value !== 'ออฟฟิศ').map((value) => <option key={value}>{value}</option>)}</select>}
          </article>
        })}</div></div>)}</div>
      </section>}

      {isBoss && <section className="hr-panel hr-approval-panel" aria-labelledby="pending-heading">
        <div className="hr-section-heading">
          <div><span className="hr-section-kicker">งานที่ต้องทำก่อน</span><h2 id="pending-heading">คิวรออนุมัติ</h2></div>
          <span className="hr-count-pill">{pendingLeave.length} รายการ</span>
        </div>
        {loading ? <div className="hr-empty">กำลังโหลดข้อมูล…</div> : !pendingLeave.length ? (
          <div className="hr-empty is-success"><span><Check size={22} /></span><strong>จัดการครบแล้ว</strong><p>ไม่มีคำขอลาที่รออนุมัติ</p></div>
        ) : <div className="hr-approval-grid">{pendingLeave.map((item) => (
          <article className="hr-request-card" key={item.id}>
            <div className="hr-request-top">
              <div className="hr-avatar" aria-hidden="true">{item.employee_name?.trim().slice(0, 1) || '?'}</div>
              <div className="hr-request-person"><strong>{item.employee_name}</strong><span>{item.leave_type}</span></div>
              <StatusBadge status={item.status} />
            </div>
            <div className="hr-request-facts">
              <div><CalendarDays size={16} /><span>วันที่</span><strong>{formatDateRange(item)}</strong></div>
              <div><Clock3 size={16} /><span>จำนวน</span><strong>{item.days} วัน</strong></div>
            </div>
            {(item.reason || item.backup_office) && <div className="hr-request-note">
              {item.reason && <p><span>เหตุผล</span>{item.reason}</p>}
              {item.backup_office && <p><span>คนทดแทน</span>{people.find((person) => person.code === item.backup_office)?.name || item.backup_office}</p>}
            </div>}
            <div className="hr-request-actions">
              <button className="hr-button is-reject" disabled={saving} onClick={() => decideLeave(item.id, 'rejected')}><X size={17} />ไม่อนุมัติ</button>
              <button className="hr-button is-approve" disabled={saving} onClick={() => decideLeave(item.id, 'approved')}><Check size={17} />อนุมัติ</button>
            </div>
          </article>
        ))}</div>}
      </section>}

      <div className="hr-workspace-grid">
        <section className="hr-panel" aria-labelledby="history-heading">
          <div className="hr-section-heading"><div><span className="hr-section-kicker">ประวัติ</span><h2 id="history-heading">{isBoss ? 'คำขอลาทั้งหมด' : 'คำขอลาของฉัน'}</h2></div></div>
          {loading ? <div className="hr-empty">กำลังโหลดข้อมูล…</div> : !myLeave.length ? <div className="hr-empty">ยังไม่มีคำขอลา</div> : (
            <div className="hr-history-list">{myLeave.slice().reverse().map((item) => (
              <article className="hr-history-row" key={item.id}>
                <div className="hr-history-main"><strong>{item.employee_name}</strong><span>{item.leave_type} · {formatDateRange(item)}</span></div>
                <div className="hr-history-days">{item.days}<span>วัน</span></div>
                <StatusBadge status={item.status} />
                {item.status === 'pending' && (item.username === currentUser?.u || isBoss) && <button className="hr-text-button is-danger" onClick={() => cancelLeave(item.id)}>ยกเลิก</button>}
              </article>
            ))}</div>
          )}
        </section>

        <aside className="hr-panel hr-form-panel" aria-labelledby="request-heading">
          <div className="hr-section-heading"><div><span className="hr-section-kicker">งานด่วน</span><h2 id="request-heading">ยื่นคำขอลา</h2></div><Send size={20} /></div>
          <form className="hr-form" onSubmit={submitLeave}>
            {isBoss && people.length > 0 && <Field label={`ยื่นแทนพนักงาน · ${leaveForm.start_date.slice(0, 7)}`}>
              <select value={leaveForm.employee_code} onChange={(e) => { const employee_code = e.target.value; const person = people.find((item) => item.code === employee_code); const leave_type = person && NO_VACATION_GROUPS.has(person.group) && leaveForm.leave_type === 'พักร้อน' ? 'ลากิจ' : leaveForm.leave_type; setLeaveForm({ ...leaveForm, employee_code, leave_type }); if (!employee_code) setLeaveLock({ locked: false, lockedDates: [] }) }}>
                <option value="">— ตัวเอง —</option>
                {peopleForMonth(leaveForm.start_date.slice(0, 7)).map((person) => <option key={person.code} value={person.code}>{person.name}{person.group ? ` · ${person.group}` : ''}</option>)}
              </select>
            </Field>}
            <Field label="ประเภทการลา"><select value={leaveForm.leave_type} onChange={(e) => setLeaveForm({ ...leaveForm, leave_type: e.target.value, half_day: false })}>{availableLeaveTypes.map((type) => <option key={type}>{type}</option>)}</select></Field>
            <div className="hr-form-columns">
              <Field label={isSwap ? 'วันหยุดเดิม' : 'วันเริ่ม'}><input type="date" value={leaveForm.start_date} onChange={(e) => setLeaveForm({ ...leaveForm, start_date: e.target.value, end_date: leaveForm.half_day ? e.target.value : leaveForm.end_date })} required /></Field>
              <Field label={isSwap ? 'วันหยุดใหม่' : 'วันสิ้นสุด'}><input type="date" value={leaveForm.half_day ? leaveForm.start_date : leaveForm.end_date} min={isSwap ? undefined : leaveForm.start_date} disabled={leaveForm.half_day} onChange={(e) => setLeaveForm({ ...leaveForm, end_date: e.target.value })} required /></Field>
            </div>
            {!isSwap && <label className="hr-check"><input type="checkbox" checked={leaveForm.half_day} onChange={(e) => setLeaveForm({ ...leaveForm, half_day: e.target.checked, end_date: e.target.checked ? leaveForm.start_date : leaveForm.end_date })} /><span>ลาครึ่งวัน <small>0.5 วัน</small></span></label>}
            <Field label="เหตุผล · ไม่บังคับ"><input value={leaveForm.reason} onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} placeholder="เพิ่มรายละเอียดสั้น ๆ" /></Field>
            {leaveLock.locked && <div className="hr-alert is-warning"><AlertTriangle size={18} /><div><strong>จำนวนคนต่ำกว่ากำหนด</strong><span>วันที่ {leaveLock.lockedDates.join(', ')} ต้องเลือกคนออฟฟิศมาทดแทน</span><select value={leaveForm.backup_office} onChange={(e) => setLeaveForm({ ...leaveForm, backup_office: e.target.value })} required><option value="">เลือกคนทดแทน</option>{officePeople.map((person) => <option key={person.code} value={person.code}>{person.name}</option>)}</select></div></div>}
            <button className="hr-button is-primary" disabled={saving}><Send size={17} />{saving ? 'กำลังบันทึก…' : 'ส่งคำขอลา'}</button>
          </form>
        </aside>
      </div>

    </main>
  )
}
