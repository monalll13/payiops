import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, Upload, FileText, ChevronDown, X, ExternalLink } from 'lucide-react'
import { LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const API_BASE_C = 'http://localhost:4000'
const fmtC = n => Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 0 })
const FLAG_COLORS = { damaged: '#ef4444', incomplete: '#f59e0b', wrong: '#8b5cf6' }
const THAI_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']
const pctColor = pct => {
  if (pct === null || pct === undefined) return '#94a3b8'
  if (pct > 0) return '#dc2626'
  if (pct < 0) return '#16a34a'
  return '#94a3b8'
}
const fmtPct = pct => {
  if (pct === null || pct === undefined) return '—'
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct}%`
}

// ============================================================
// COMPONENT: เครื่องมือลบประวัติล็อตไฟล์แบบซ่อนจิ๋ว
// ============================================================
function ClearClaimsPanel({ onResetSuccess }) {
  const [isOpen, setIsOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [selectedFileId, setSelectedFileId] = useState('')

  const loadUploadedFiles = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_C}/claims/imports-list`)
      const data = await res.json()
      if (data.success && Array.isArray(data.files)) setUploadedFiles(data.files)
    } catch (err) { console.error(err) }
  }, [])

  useEffect(() => { if (isOpen) loadUploadedFiles() }, [isOpen, loadUploadedFiles])

  const handleClearSelectedClaim = async () => {
    if (!selectedFileId) return
    if (!window.confirm("⚠️ ยืนยันต้องการลบข้อมูลล็อตไฟล์นี้ออกจากตารางหลัก?")) return
    setIsDeleting(true)
    try {
      const res = await fetch(`${API_BASE_C}/claims/import/${selectedFileId}`, { method: 'DELETE' })
      const resData = await res.json()
      if (resData.success) {
        alert("🗑️ ลบข้อมูลล็อตไฟล์เรียบร้อย"); setSelectedFileId(''); loadUploadedFiles(); onResetSuccess()
      }
    } catch (err) { alert(err.message) } finally { setIsDeleting(false) }
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <button onClick={() => setIsOpen(!isOpen)} style={{ background: 'none', border: 'none', color: '#cbd5e1', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: 0 }}>
        {isOpen ? '🔽 ซ่อนเมนูลบไฟล์' : '⚙️ ลบประวัติไฟล์ล็อตเฉพาะชุด'}
      </button>
      {isOpen && (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, marginTop: 6, display: 'flex', gap: 8 }}>
          <select value={selectedFileId} onChange={(e) => setSelectedFileId(e.target.value)} style={{ flex: 1, padding: '6px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 11 }}>
            <option value="">-- เลือกไฟล์เคลมที่จะลบ --</option>
            {uploadedFiles.map((f, i) => <option key={i} value={f.import_id}>📄 {f.file_name || f.import_id} ({f.row_count} แถว)</option>)}
          </select>
          <button onClick={handleClearSelectedClaim} disabled={isDeleting || !selectedFileId} style={{ background: !selectedFileId ? '#cbd5e1' : '#ef4444', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 11, cursor: 'pointer' }}>
            ลบ
          </button>
        </div>
      )}
    </div>
  )
}

// ============================================================
// COMPONENT: Accordion ทั่วไป
// ============================================================
function AccordionSection({ title, icon, defaultOpen = false, children }) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, marginBottom: 16, overflow: 'hidden' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'none', border: 'none', cursor: 'pointer', padding: '16px 20px',
          fontSize: 13, fontWeight: 700, color: '#111827',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{icon} {title}</span>
        <ChevronDown size={16} style={{ color: '#94a3b8', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>
      {isOpen && <div style={{ padding: '0 20px 20px' }}>{children}</div>}
    </div>
  )
}

// ============================================================
// COMPONENT: ตาราง 1 — สรุปเคลมรายเดือน
// ============================================================
function MonthlyClaimSummary({ data }) {
  if (!data) return <div style={{ fontSize: 12, color: '#94a3b8' }}>กำลังโหลดข้อมูล...</div>
  const { monthly, monthlyTotal } = data

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 700 }}>
        <thead>
          <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
            <th style={{ padding: '10px 14px', textAlign: 'left' }}>เดือน</th>
            <th style={{ padding: '10px 14px', textAlign: 'right' }}>จำนวนรายการ</th>
            <th style={{ padding: '10px 14px', textAlign: 'right' }}>มูลค่ารวม (฿)</th>
            <th style={{ padding: '10px 14px', textAlign: 'right', color: FLAG_COLORS.damaged }}>เสียหาย</th>
            <th style={{ padding: '10px 14px', textAlign: 'right', color: FLAG_COLORS.incomplete }}>ส่งไม่ครบ</th>
            <th style={{ padding: '10px 14px', textAlign: 'right', color: FLAG_COLORS.wrong }}>ส่งผิด</th>
            <th style={{ padding: '10px 14px', textAlign: 'right' }}>%เปลี่ยนแปลง</th>
          </tr>
        </thead>
        <tbody>
          {monthly.map((m, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '11px 14px', color: '#1e293b' }}>{THAI_MONTHS[i]}</td>
              <td style={{ padding: '11px 14px', textAlign: 'right', color: '#475569' }}>{fmtC(m.count)}</td>
              <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 700, color: m.value > 0 ? '#dc2626' : '#cbd5e1', background: m.value > 0 ? '#fef2f2' : 'transparent' }}>
                {m.value > 0 ? `฿${fmtC(m.value)}` : '฿0'}
              </td>
              <td style={{ padding: '11px 14px', textAlign: 'right', color: '#475569' }}>{fmtC(m.damaged)}</td>
              <td style={{ padding: '11px 14px', textAlign: 'right', color: '#475569' }}>{fmtC(m.incomplete)}</td>
              <td style={{ padding: '11px 14px', textAlign: 'right', color: '#475569' }}>{fmtC(m.wrong)}</td>
              <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 600, color: pctColor(m.pctChange) }}>{fmtPct(m.pctChange)}</td>
            </tr>
          ))}
          <tr style={{ background: '#f8fafc', fontWeight: 800, color: '#111827' }}>
            <td style={{ padding: '12px 14px' }}>รวมทั้งปี</td>
            <td style={{ padding: '12px 14px', textAlign: 'right' }}>{fmtC(monthlyTotal.count)}</td>
            <td style={{ padding: '12px 14px', textAlign: 'right', color: '#dc2626' }}>฿{fmtC(monthlyTotal.value)}</td>
            <td style={{ padding: '12px 14px', textAlign: 'right' }}>{fmtC(monthlyTotal.damaged)}</td>
            <td style={{ padding: '12px 14px', textAlign: 'right' }}>{fmtC(monthlyTotal.incomplete)}</td>
            <td style={{ padding: '12px 14px', textAlign: 'right' }}>{fmtC(monthlyTotal.wrong)}</td>
            <td style={{ padding: '12px 14px', textAlign: 'right', color: pctColor(monthlyTotal.pctChange) }}>{fmtPct(monthlyTotal.pctChange)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// ============================================================
// COMPONENT: ตาราง 2 — สรุปเคลมแยกตามแบรนด์
// ============================================================
function BrandClaimSummary({ data }) {
  if (!data) return <div style={{ fontSize: 12, color: '#94a3b8' }}>กำลังโหลดข้อมูล...</div>
  const { businesses, byBusinessMonthly, byBusinessTotal } = data
  if (!businesses || businesses.length === 0) {
    return <div style={{ fontSize: 12, color: '#94a3b8' }}>ยังไม่มีข้อมูลแบรนด์</div>
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 700 }}>
        <thead>
          <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
            <th rowSpan={2} style={{ padding: '10px 14px', textAlign: 'left', verticalAlign: 'bottom' }}>เดือน</th>
            {businesses.map(b => (
              <th key={b} colSpan={2} style={{ padding: '10px 14px', textAlign: 'center', borderLeft: '1px solid #e2e8f0' }}>{b}</th>
            ))}
          </tr>
          <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#94a3b8', fontSize: 11 }}>
            {businesses.map(b => (
              <>
                <th key={`${b}-value`} style={{ padding: '6px 14px', textAlign: 'right', borderLeft: '1px solid #e2e8f0' }}>มูลค่า (฿)</th>
                <th key={`${b}-count`} style={{ padding: '6px 14px', textAlign: 'right' }}>รายการ</th>
              </>
            ))}
          </tr>
        </thead>
        <tbody>
          {byBusinessMonthly.map((row, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '11px 14px', color: '#1e293b' }}>{THAI_MONTHS[i]}</td>
              {businesses.map(b => (
                <>
                  <td key={`${b}-value-${i}`} style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 700, color: row[b].value > 0 ? '#2563eb' : '#cbd5e1', borderLeft: '1px solid #f1f5f9' }}>
                    {row[b].value > 0 ? `฿${fmtC(row[b].value)}` : '฿0'}
                  </td>
                  <td key={`${b}-count-${i}`} style={{ padding: '11px 14px', textAlign: 'right', color: '#475569' }}>{fmtC(row[b].count)}</td>
                </>
              ))}
            </tr>
          ))}
          <tr style={{ background: '#f8fafc', fontWeight: 800, color: '#111827' }}>
            <td style={{ padding: '12px 14px' }}>รวมทั้งปี</td>
            {businesses.map(b => (
              <>
                <td key={`${b}-total-value`} style={{ padding: '12px 14px', textAlign: 'right', color: '#2563eb', borderLeft: '1px solid #e2e8f0' }}>฿{fmtC(byBusinessTotal[b].value)}</td>
                <td key={`${b}-total-count`} style={{ padding: '12px 14px', textAlign: 'right' }}>{fmtC(byBusinessTotal[b].count)}</td>
              </>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}


// ============================================================
// COMPONENT: SKU Detail Popup Panel (เหมือนหน้ายอดขาย)
// ============================================================
function SkuDetailPanel({ masterSku, displayName, startDate, endDate, business, onClose }) {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)

  useEffect(() => {
    if (!masterSku) return
    setLoading(true); setErr(null)
    const params = new URLSearchParams()
    if (startDate) params.set('startDate', startDate)
    if (endDate)   params.set('endDate', endDate)
    if (business)  params.set('business', business)
    fetch(`${API_BASE_C}/claims-view/sku/${encodeURIComponent(masterSku)}?${params}`)
      .then(r => r.json())
      .then(d => { if (d.success) setDetail(d); else setErr(d.error) })
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false))
  }, [masterSku, startDate, endDate, business])

  // Close on backdrop click
  const handleBackdrop = (e) => { if (e.target === e.currentTarget) onClose() }

  return (
    <div
      onClick={handleBackdrop}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div style={{
        background: '#fff', borderRadius: 20, width: '100%', maxWidth: 680,
        maxHeight: '88vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 60px rgba(0,0,0,0.18)',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, letterSpacing: '0.05em', marginBottom: 4 }}>MASTER SKU</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 16, fontFamily: 'monospace', fontWeight: 800, color: '#2563eb' }}>{masterSku}</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>{displayName}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, padding: '6px 8px', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', padding: '20px 24px', flex: 1 }}>
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, color: '#94a3b8', fontSize: 13 }}>
              กำลังโหลดข้อมูล...
            </div>
          )}
          {err && (
            <div style={{ background: '#fef2f2', borderRadius: 10, padding: '12px 16px', color: '#dc2626', fontSize: 12 }}>
              ⚠️ {err}
            </div>
          )}
          {detail && !loading && (
            <>
              {/* KPI Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
                {[
                  { label: 'เคสเคลมทั้งหมด', value: fmtC(detail.totalCount), color: '#2563eb', bg: '#eff6ff' },
                  { label: 'มูลค่าความเสียหาย', value: `฿${fmtC(detail.totalValue)}`, color: '#dc2626', bg: '#fef2f2' },
                  { label: 'จำนวนแบรนด์', value: fmtC(detail.byBusiness?.length || 0), color: '#7c3aed', bg: '#f5f3ff' },
                ].map((k, i) => (
                  <div key={i} style={{ background: k.bg, borderRadius: 12, padding: '14px 16px' }}>
                    <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, marginBottom: 4 }}>{k.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: k.color }}>{k.value}</div>
                  </div>
                ))}
              </div>

              {/* สรุปตามเหตุผล */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10 }}>สาเหตุของการเคลม</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  {[
                    { key: 'damaged',    label: '🔴 เสียหาย',     color: FLAG_COLORS.damaged },
                    { key: 'incomplete', label: '🟡 ส่งไม่ครบ',   color: FLAG_COLORS.incomplete },
                    { key: 'wrong',      label: '🟣 ส่งผิด',      color: FLAG_COLORS.wrong },
                  ].map(r => {
                    const d = detail.reasonSummary?.[r.key] || { count: 0, value: 0 }
                    return (
                      <div key={r.key} style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 14px', borderLeft: `3px solid ${r.color}` }}>
                        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{r.label}</div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: r.color }}>{fmtC(d.count)}</div>
                        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>฿{fmtC(d.value)}</div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* แยกตามแบรนด์ */}
              {detail.byBusiness?.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10 }}>สรุปตามแบรนด์</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', color: '#64748b' }}>
                        <th style={{ padding: '8px 12px', textAlign: 'left', borderRadius: '6px 0 0 6px' }}>แบรนด์</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right' }}>จำนวนเคส</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right', borderRadius: '0 6px 6px 0' }}>มูลค่า (฿)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.byBusiness.map((b, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '9px 12px', color: '#1e293b', fontWeight: 600 }}>{b.business}</td>
                          <td style={{ padding: '9px 12px', textAlign: 'right', color: '#dc2626', fontWeight: 700 }}>{fmtC(b.count)}</td>
                          <td style={{ padding: '9px 12px', textAlign: 'right', color: '#475569' }}>฿{fmtC(b.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* รายการเคลม */}
              {detail.records?.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10 }}>
                    รายการเคลมทั้งหมด ({fmtC(detail.records.length)} รายการ)
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, minWidth: 500 }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', color: '#64748b' }}>
                          <th style={{ padding: '8px 10px', textAlign: 'left' }}>วันที่</th>
                          <th style={{ padding: '8px 10px', textAlign: 'left' }}>แบรนด์</th>
                          <th style={{ padding: '8px 10px', textAlign: 'right' }}>มูลค่า (฿)</th>
                          <th style={{ padding: '8px 10px', textAlign: 'center' }}>เสียหาย</th>
                          <th style={{ padding: '8px 10px', textAlign: 'center' }}>ไม่ครบ</th>
                          <th style={{ padding: '8px 10px', textAlign: 'center' }}>ผิด</th>
                          <th style={{ padding: '8px 10px', textAlign: 'left' }}>หมายเหตุ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.records.map((rec, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid #f8fafc' }}
                            onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            <td style={{ padding: '8px 10px', color: '#64748b' }}>{rec.date}</td>
                            <td style={{ padding: '8px 10px', color: '#1e293b' }}>{rec.business}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: rec.claim_value > 0 ? '#dc2626' : '#cbd5e1' }}>
                              {rec.claim_value > 0 ? `฿${fmtC(rec.claim_value)}` : '—'}
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>{rec.is_damaged ? <span style={{ color: FLAG_COLORS.damaged, fontWeight: 700 }}>●</span> : <span style={{ color: '#e2e8f0' }}>○</span>}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>{rec.is_incomplete ? <span style={{ color: FLAG_COLORS.incomplete, fontWeight: 700 }}>●</span> : <span style={{ color: '#e2e8f0' }}>○</span>}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>{rec.is_wrong_item ? <span style={{ color: FLAG_COLORS.wrong, fontWeight: 700 }}>●</span> : <span style={{ color: '#e2e8f0' }}>○</span>}</td>
                            <td style={{ padding: '8px 10px', color: '#94a3b8', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rec.note || rec.free_item || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// COMPONENT: All SKUs Modal (ดูทั้งหมด)
// ============================================================
function AllSkusModal({ topSkus, onClose, onSelectSku }) {
  const handleBackdrop = (e) => { if (e.target === e.currentTarget) onClose() }

  return (
    <div
      onClick={handleBackdrop}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 999,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div style={{
        background: '#fff', borderRadius: 20, width: '100%', maxWidth: 760,
        maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 60px rgba(0,0,0,0.18)',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#111827' }}>
            🏆 อันดับสินค้าเสียทั้งหมด ({fmtC(topSkus.length)} SKU)
          </div>
          <button
            onClick={onClose}
            style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, padding: '6px 8px', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center' }}
          >
            <X size={16} />
          </button>
        </div>
        {/* Table */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                <th style={{ padding: '10px 16px', textAlign: 'left', width: 36 }}>#</th>
                <th style={{ padding: '10px 16px', textAlign: 'left' }}>MASTER SKU</th>
                <th style={{ padding: '10px 16px', textAlign: 'left' }}>ชื่อสินค้า</th>
                <th style={{ padding: '10px 16px', textAlign: 'right' }}>จำนวนเคส</th>
                <th style={{ padding: '10px 16px', textAlign: 'right' }}>มูลค่าทุนเสียหาย</th>
              </tr>
            </thead>
            <tbody>
              {topSkus.map((s, i) => (
                <tr
                  key={i}
                  onClick={() => { onSelectSku({ master_sku: s.master_sku || 'UNMAPPED', display_name: s.display_name || 'ชื่อสินค้าหลุดแมพ' }); onClose() }}
                  style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', background: s.master_sku === 'UNMAPPED' ? '#fff1f1' : 'transparent' }}
                  onMouseEnter={e => e.currentTarget.style.background = s.master_sku === 'UNMAPPED' ? '#ffe4e4' : '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background = s.master_sku === 'UNMAPPED' ? '#fff1f1' : 'transparent'}
                >
                  <td style={{ padding: '11px 16px', color: i < 3 ? '#f59e0b' : '#94a3b8', fontWeight: 700 }}>{i + 1}</td>
                  <td style={{ padding: '11px 16px', fontFamily: 'monospace', color: s.master_sku === 'UNMAPPED' ? '#dc2626' : '#2563eb', fontWeight: 700 }}>{s.master_sku || 'UNMAPPED'}</td>
                  <td style={{ padding: '11px 16px', color: '#1e293b' }}>{s.display_name || 'ชื่อสินค้าหลุดแมพ'}</td>
                  <td style={{ padding: '11px 16px', textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>{fmtC(s.count)}</td>
                  <td style={{ padding: '11px 16px', textAlign: 'right', color: '#475569' }}>฿{fmtC(s.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default function ClaimView() {
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(false)
  const [err, setErr]           = useState(null)
  const [startDate, setStart]   = useState('')
  const [endDate, setEnd]       = useState('')
  const [business, setBusiness] = useState('')
  const [ts, setTs]             = useState('')

  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)

  const [monthlyData, setMonthlyData] = useState(null)
  const [monthlyLoading, setMonthlyLoading] = useState(false)
  const [selectedSku, setSelectedSku] = useState(null)
  const [showAllSkus, setShowAllSkus] = useState(false)

  const loadMonthly = useCallback(async () => {
    setMonthlyLoading(true)
    try {
      const r = await fetch(`${API_BASE_C}/claims-view/monthly?year=2026`)
      const d = await r.json()
      if (d.success) setMonthlyData(d)
    } catch (e) { console.error(e) } finally { setMonthlyLoading(false) }
  }, [])

  useEffect(() => { loadMonthly() }, [loadMonthly])


  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const params = new URLSearchParams()
      if (startDate) params.set('startDate', startDate)
      if (endDate)   params.set('endDate', endDate)
      if (business)  params.set('business', business)
      
      const r = await fetch(`${API_BASE_C}/claims-view?${params}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = await r.json()
      if (!d.success) throw new Error(d.error)
      setData(d)
      setTs(new Date().toLocaleTimeString('th-TH'))
    } catch (e) { setErr(e.message) } finally { setLoading(false) }
  }, [startDate, endDate, business])

  useEffect(() => { load() }, [load])

  const handleImport = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true); setImportResult(null)
    const form = new FormData()
    form.append('file', file)
    try {
      const r = await fetch(`${API_BASE_C}/claims/import`, { method: 'POST', body: form })
      const d = await r.json()
      setImportResult(d)
      load()
      loadMonthly()
    } catch (e) { 
      setImportResult({ success: false, error: e.message }) 
    } finally { 
      setImporting(false) 
    }
  }

  const total = data?.totalClaims || 0;
  const value = data?.claimValue ?? data?.totalValue ?? 0;
  const damaged    = data?.damageCount    || 0
  const incomplete = data?.incompleteCount || 0
  const wrong      = data?.wrongItemCount  || 0
  const topSkus = data?.topClaimSkus    || []
  const trend   = data?.claimByDate || []

  return (
    <div style={{ width: '100%', fontFamily: 'system-ui, sans-serif', padding: '10px 4px' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#111827', letterSpacing: '-0.02em' }}>Claim View 🛡️</div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>วิเคราะห์สถิติจดแจ้งยอดเคลมสินค้า · อัปเดตล่าสุด {ts || '—'}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <input type="date" value={startDate} onChange={e => setStart(e.target.value)} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 12px', fontSize: 12, color: '#334155', background: '#f8fafc' }} />
          <span style={{ color: '#94a3b8', fontSize: 12 }}>ถึง</span>
          <input type="date" value={endDate} onChange={e => setEnd(e.target.value)} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 12px', fontSize: 12, color: '#334155', background: '#f8fafc' }} />
          
          <button onClick={load} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#111827', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> รีเฟรช
          </button>

          <label style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: 10, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <Upload size={14} /> {importing ? 'กำลังนำเข้าไฟล์...' : 'Import Excel ใบเคลม'}
            <input type="file" accept=".xlsx,.xls" onChange={handleImport} style={{ display: 'none' }} disabled={importing} />
          </label>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {err && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 18px', color: '#dc2626', fontSize: 12, marginBottom: 16 }}>⚠️ เกิดข้อผิดพลาด: {err}</div>}
      {importResult && (
        <div style={{ background: importResult.success ? '#f0fdf4' : '#fef2f2', border: `1px solid ${importResult.success ? '#bbf7d0' : '#fecaca'}`, borderRadius: 10, padding: '12px 18px', fontSize: 13, color: importResult.success ? '#15803d' : '#dc2626', marginBottom: 16 }}>
          {importResult.success ? `✅ นำเข้าข้อมูลเคลมเรียบร้อยและเพิ่มเข้าตารางสำเร็จแล้วครับ` : `❌ ผิดพลาด: ${importResult.error}`}
        </div>
      )}

      {/* บล็อกพับเก็บปุ่มลบไฟล์ */}
      <ClearClaimsPanel onResetSuccess={() => { load(); loadMonthly() }} />

      {/* Accordion: สรุปเคลมรายเดือน + สรุปเคลมแยกตามแบรนด์ */}
      <AccordionSection title="สรุปเคลมรายเดือน (ทั้งปี 2026)" icon="📊">
        {monthlyLoading && !monthlyData ? <div style={{ fontSize: 12, color: '#94a3b8' }}>กำลังโหลด...</div> : <MonthlyClaimSummary data={monthlyData} />}
      </AccordionSection>

      <AccordionSection title="สรุปเคลมแยกตามแบรนด์ (รายเดือน)" icon="🏷️">
        {monthlyLoading && !monthlyData ? <div style={{ fontSize: 12, color: '#94a3b8' }}>กำลังโหลด...</div> : <BrandClaimSummary data={monthlyData} />}
      </AccordionSection>

      {/* สถิติการ์ดแดชบอร์ดหลัก */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 24 }}>
        {[
          { title: 'เคสเคลมรวมทั้งหมด', value: fmtC(total), accent: '#2563eb' },
          { title: 'มูลค่ารวมความเสียหาย', value: `฿${fmtC(value)}`, accent: '#ef4444' },
          { title: 'สินค้าเสีย/พัง', value: fmtC(damaged), accent: FLAG_COLORS.damaged, pct: total > 0 ? Math.round(damaged/total*100) : 0 },
          { title: 'ส่งของไม่ครบชิ้น', value: fmtC(incomplete), accent: FLAG_COLORS.incomplete, pct: total > 0 ? Math.round(incomplete/total*100) : 0 },
          { title: 'คลังส่งของผิด', value: fmtC(wrong), accent: FLAG_COLORS.wrong, pct: total > 0 ? Math.round(wrong/total*100) : 0 },
        ].map((t, i) => (
          <div key={i} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '16px 18px' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>{t.title}</span>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#111827' }}>{t.value}</div>
            {t.pct != null && <div style={{ fontSize: 10, color: t.accent, fontWeight: 600, marginTop: 2 }}>{t.pct}% ของงานเคลม</div>}
          </div>
        ))}
      </div>

      {/* กราฟแนวโน้มแสดงผลอย่างถูกต้อง */}
      {trend.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 20, marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 14 }}>แนวโน้มสถิติบันทึกยอดเคลมสินค้า (รายวัน)</div>
          <div style={{ width: '100%', minWidth: 0 }}>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#ef4444" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ตารางจัดอันดับ Top 10 */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>ตารางจัดอันดับรายการสินค้าเสียสูงสุด (Top 10 SKU)</div>
          {topSkus.length > 10 && (
            <button
              onClick={() => setShowAllSkus(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: 'none', border: '1px solid #e2e8f0', borderRadius: 8,
                padding: '6px 12px', fontSize: 12, fontWeight: 600, color: '#2563eb',
                cursor: 'pointer',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#eff6ff'; e.currentTarget.style.borderColor = '#bfdbfe' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.borderColor = '#e2e8f0' }}
            >
              <ExternalLink size={12} /> ดูทั้งหมด ({fmtC(topSkus.length)} SKU)
            </button>
          )}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left' }}>#</th>
                <th style={{ padding: '10px 14px', textAlign: 'left' }}>MASTER SKU</th>
                <th style={{ padding: '10px 14px', textAlign: 'left' }}>ชื่อสินค้าจริงในระบบ</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>จำนวนเคส</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>มูลค่าทุนเสียหาย</th>
              </tr>
            </thead>
            <tbody>
              {topSkus.slice(0, 10).map((s, i) => (
                <tr
                  key={i}
                  onClick={() => setSelectedSku({ master_sku: s.master_sku || 'UNMAPPED', display_name: s.display_name || 'ชื่อสินค้าหลุดแมพ' })}
                  style={{ borderBottom: '1px solid #f1f5f9', background: s.master_sku === 'UNMAPPED' ? '#fff1f1' : 'transparent', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = s.master_sku === 'UNMAPPED' ? '#ffe4e4' : '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background = s.master_sku === 'UNMAPPED' ? '#fff1f1' : 'transparent'}
                >
                  <td style={{ padding: '11px 14px', color: i < 3 ? '#f59e0b' : '#94a3b8', fontWeight: i < 3 ? 800 : 400 }}>{i + 1}</td>
                  <td style={{ padding: '11px 14px', fontFamily: 'monospace', color: s.master_sku === 'UNMAPPED' ? '#dc2626' : '#2563eb', fontWeight: 700 }}>{s.master_sku || 'UNMAPPED'}</td>
                  <td style={{ padding: '11px 14px', color: '#1e293b' }}>{s.display_name || 'ชื่อสินค้าหลุดแมพ'}</td>
                  <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>{fmtC(s.count)}</td>
                  <td style={{ padding: '11px 14px', textAlign: 'right', color: '#475569' }}>฿{fmtC(s.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {topSkus.length > 10 && (
          <div style={{ marginTop: 12, textAlign: 'center' }}>
            <button
              onClick={() => setShowAllSkus(true)}
              style={{
                background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8,
                padding: '8px 20px', fontSize: 12, fontWeight: 600, color: '#475569',
                cursor: 'pointer', width: '100%',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#f8fafc' }}
            >
              ดูทั้งหมด {fmtC(topSkus.length)} SKU →
            </button>
          </div>
        )}
      </div>

      {/* Modal: ดูทั้งหมด */}
      {showAllSkus && (
        <AllSkusModal
          topSkus={topSkus}
          onClose={() => setShowAllSkus(false)}
          onSelectSku={(sku) => setSelectedSku(sku)}
        />
      )}

      {/* Modal: รายละเอียด SKU */}
      {selectedSku && (
        <SkuDetailPanel
          masterSku={selectedSku.master_sku}
          displayName={selectedSku.display_name}
          startDate={startDate}
          endDate={endDate}
          business={business}
          onClose={() => setSelectedSku(null)}
        />
      )}

    </div>
  )
}