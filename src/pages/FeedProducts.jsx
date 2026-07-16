import { useEffect, useMemo, useState } from 'react'
import { PackageCheck } from 'lucide-react'

const fmt = (value) => Number(value || 0).toLocaleString('th-TH')

export default function FeedProducts({ dashData, loading, error, onRetry }) {
  const [config, setConfig] = useState([])
  const [configLoading, setConfigLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState('')
  const [monthlyResult, setMonthlyResult] = useState({ month: '', reload: -1, data: null, error: '' })
  const [monthReload, setMonthReload] = useState(0)

  useEffect(() => {
    let active = true
    fetch('/api/sheet-tools?op=planner')
      .then((response) => response.json())
      .then((data) => {
        if (active && data?.success) setConfig(Array.isArray(data.config) ? data.config : [])
      })
      .catch(() => {})
      .finally(() => { if (active) setConfigLoading(false) })
    return () => { active = false }
  }, [])

  const monthOptions = useMemo(() => {
    const earliest = String(dashData?.dataRange?.earliestDate || '').slice(0, 7)
    const latest = String(dashData?.dataRange?.latestDate || '').slice(0, 7)
    if (!earliest || !latest) return []
    const [startYear, startMonth] = earliest.split('-').map(Number)
    const [endYear, endMonth] = latest.split('-').map(Number)
    const options = []
    let year = endYear
    let month = endMonth
    while (year > startYear || (year === startYear && month >= startMonth)) {
      const value = `${year}-${String(month).padStart(2, '0')}`
      options.push({
        value,
        label: new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1)),
      })
      month -= 1
      if (month === 0) { month = 12; year -= 1 }
    }
    return options
  }, [dashData?.dataRange?.earliestDate, dashData?.dataRange?.latestDate])

  const effectiveMonth = selectedMonth || monthOptions[0]?.value || ''

  useEffect(() => {
    if (!effectiveMonth) return
    let active = true
    const [year, month] = effectiveMonth.split('-').map(Number)
    const startDate = `${effectiveMonth}-01`
    const endDate = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
    fetch(`/api/dashboard?startDate=${startDate}&endDate=${endDate}`)
      .then((response) => response.json().then((data) => ({ ok: response.ok, data })))
      .then(({ ok, data }) => {
        if (!active) return
        if (!ok || !data?.success) throw new Error(data?.error || 'โหลดข้อมูลรายเดือนไม่สำเร็จ')
        setMonthlyResult({ month: effectiveMonth, reload: monthReload, data, error: '' })
      })
      .catch((fetchError) => {
        if (active) setMonthlyResult({ month: effectiveMonth, reload: monthReload, data: null, error: fetchError.message })
      })
    return () => { active = false }
  }, [effectiveMonth, monthReload])

  const monthlyData = monthlyResult.month === effectiveMonth ? monthlyResult.data : null
  const monthError = monthlyResult.month === effectiveMonth ? monthlyResult.error : ''
  const monthLoading = Boolean(effectiveMonth) && (monthlyResult.month !== effectiveMonth || monthlyResult.reload !== monthReload)

  const rows = useMemo(() => {
    const disabled = new Set(
      config
        .filter((row) => String(row.enabled) === '0')
        .map((row) => String(row.master_sku || '').trim().toUpperCase())
    )

    return (monthlyData?.packBySku || [])
      .map((row) => ({
        ...row,
        master_sku: String(row.master_sku || '').trim().toUpperCase(),
        qty: Number(row.qty || 0),
      }))
      .filter((row) => /^PY/.test(row.master_sku) && !disabled.has(row.master_sku))
      .sort((a, b) => b.qty - a.qty)
  }, [config, monthlyData?.packBySku])

  const totalQty = rows.reduce((sum, row) => sum + row.qty, 0)

  if (loading || configLoading || (!effectiveMonth && !error)) {
    return <div style={{ padding: 36, textAlign: 'center', color: '#64748b' }}>กำลังโหลดรายการสินค้าที่ต้องฟีด...</div>
  }

  if (error && !dashData) {
    return (
      <div style={{ padding: 36, textAlign: 'center', color: '#b91c1c', background: '#fff', border: '1px solid #fecaca', borderRadius: 16 }}>
        โหลดข้อมูลสินค้าที่ต้องฟีดไม่สำเร็จ
        <button type="button" onClick={onRetry} style={{ marginLeft: 10, border: 0, background: 'transparent', color: '#2563eb', fontWeight: 800, cursor: 'pointer' }}>ลองใหม่</button>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'end', gap: 12, flexWrap: 'wrap' }}>
        <label style={{ display: 'grid', gap: 5, minWidth: 220, color: '#475569', fontSize: 12, fontWeight: 800 }}>
          เดือนที่ใช้อ้างอิง
          <select
            value={effectiveMonth}
            onChange={(event) => setSelectedMonth(event.target.value)}
            style={{ minHeight: 42, border: '1px solid #cfe0f3', borderRadius: 9, padding: '8px 11px', background: '#fff', color: '#102a43', fontWeight: 800 }}
          >
            {monthOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <Stat label="สินค้าที่ใช้งาน" value={`${fmt(rows.length)} SKU`} />
        <Stat label="จำนวนรวม" value={`${fmt(totalQty)} ชิ้น`} />
      </div>

      <section style={{ background: '#fff', border: '1px solid #dce8f5', borderRadius: 16, overflow: 'hidden', boxShadow: '0 10px 28px rgba(15,23,42,.04)' }}>
        <div style={{ padding: '15px 18px', borderBottom: '1px solid #e7eef6', display: 'flex', alignItems: 'center', gap: 9 }}>
          <PackageCheck size={19} color="#2563eb" />
          <div>
            <b style={{ color: '#102a43' }}>สินค้าที่ต้องฟีด</b>
            <div style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>จำนวนชิ้นที่ออกในเดือนที่เลือก รวมยกเลิก/ตีคืน · แสดงเฉพาะสินค้าที่ใช้งานใน Planner Control</div>
          </div>
        </div>

        {monthLoading ? (
          <div style={{ padding: 36, textAlign: 'center', color: '#64748b' }}>กำลังโหลดข้อมูลเดือนที่เลือก...</div>
        ) : monthError ? (
          <div style={{ padding: 36, textAlign: 'center', color: '#b91c1c' }}>
            {monthError}
            <button type="button" onClick={() => setMonthReload((value) => value + 1)} style={{ marginLeft: 10, border: 0, background: 'transparent', color: '#2563eb', fontWeight: 800, cursor: 'pointer' }}>ลองใหม่</button>
          </div>
        ) : rows.length ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fbff', color: '#64748b', fontSize: 12 }}>
                  <th style={head}>ลำดับ</th>
                  <th style={{ ...head, textAlign: 'left' }}>Master SKU</th>
                  <th style={{ ...head, textAlign: 'left' }}>สินค้า</th>
                  <th style={{ ...head, textAlign: 'right' }}>จำนวนที่ต้องฟีด</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.master_sku} style={{ borderTop: '1px solid #edf2f7' }}>
                    <td style={cell}>{index + 1}</td>
                    <td style={{ ...cell, textAlign: 'left', fontFamily: 'monospace', fontWeight: 800, color: '#2563eb' }}>{row.master_sku}</td>
                    <td style={{ ...cell, textAlign: 'left', color: '#334155' }}>{row.display_name || row.master_sku}</td>
                    <td style={{ ...cell, textAlign: 'right', fontWeight: 900, color: '#102a43' }}>{fmt(row.qty)} ชิ้น</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: 36, textAlign: 'center', color: '#64748b' }}>ไม่พบข้อมูลสินค้าที่ต้องฟีดในช่วงวันที่เลือก</div>
        )}
      </section>
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #dce8f5', borderRadius: 14, padding: '14px 16px' }}>
      <div style={{ color: '#64748b', fontSize: 12 }}>{label}</div>
      <div style={{ color: '#102a43', fontSize: 22, fontWeight: 900, marginTop: 5 }}>{value}</div>
    </div>
  )
}

const head = { padding: '11px 14px', textAlign: 'center', fontWeight: 800, whiteSpace: 'nowrap' }
const cell = { padding: '12px 14px', textAlign: 'center', fontSize: 13 }
