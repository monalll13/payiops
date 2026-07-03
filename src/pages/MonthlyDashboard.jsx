import { useEffect, useMemo, useState } from 'react'
import { DollarSign, ShoppingBag, Package, Loader2, Info } from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, ComposedChart, Line, Legend,
} from 'recharts'
import KpiCard from '../components/KpiCard.jsx'

const fmt = (n) => Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 0 })
const fmtBaht = (n) => '฿' + fmt(n)
const fmtShort = (n) => '฿' + (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : Math.round(n))
const PLATFORM_COLORS = { Shopee: '#F0662C', 'TikTok Shop': '#2AA79B', Lazada: '#2F5FD0' }
const platColor = (p) => PLATFORM_COLORS[p] || '#94a3b8'
const THAI_MONTH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const monthLabel = (ym) => THAI_MONTH[parseInt(ym.slice(5, 7), 10) - 1] || ym

function TooltipBox({ active, payload, label, moneyKeys = [] }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--payi-surface-dark)', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#fff' }}>
      <div style={{ color: 'var(--payi-line)', marginBottom: 6, fontWeight: 700 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 2 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color || p.fill || p.stroke }} />
          <span style={{ color: '#cbd5e1' }}>{p.name}:</span>
          <span style={{ fontWeight: 700 }}>{moneyKeys.includes(p.dataKey) ? fmtBaht(p.value) : fmt(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

export default function MonthlyDashboard() {
  const [year, setYear] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [month, setMonth] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true); setError(null)
    fetch(`/api/monthly${year ? `?year=${year}` : ''}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return
        if (!d.success) throw new Error(d.error)
        setData(d)
        if (!year && d.years?.length) setYear(d.years[d.years.length - 1])
        setMonth((prev) => (d.months?.includes(prev) ? prev : d.months?.[d.months.length - 1] || ''))
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [year])

  const trend = data?.trend || []
  const idx = trend.findIndex((t) => t.month === month)
  const cur = idx >= 0 ? trend[idx] : null
  const prev = idx > 0 ? trend[idx - 1] : null
  const mom = (c, p) => (p > 0 ? Math.round(((c - p) / p) * 100) : null)

  const stores = useMemo(() => (data?.byStore?.[month] || []), [data, month])
  const platformShare = useMemo(() => {
    const m = {}
    for (const s of stores) m[s.platform] = (m[s.platform] || 0) + s.sales
    return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }, [stores])
  const trendChart = useMemo(() => trend.map((t) => ({ label: monthLabel(t.month), sales: t.sales, orders: t.orders })), [trend])

  if (loading && !data) return <Center><Loader2 size={18} className="payi-spin" /> กำลังโหลดข้อมูล...</Center>
  if (error) return <Center danger><Info size={18} /> โหลดไม่สำเร็จ: {error}</Center>

  const salesMoM = cur && prev ? mom(cur.sales, prev.sales) : null
  const ordersMoM = cur && prev ? mom(cur.orders, prev.orders) : null
  const unitsMoM = cur && prev ? mom(cur.units, prev.units) : null

  return (
    <div style={{ width: '100%' }}>
      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <select value={year} onChange={(e) => setYear(e.target.value)} className="payi-select" style={{ padding: '8px 12px', fontSize: 13 }}>
          {(data?.years || []).map((y) => <option key={y} value={y}>ปี {y}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {(data?.months || []).map((ym) => (
            <button key={ym} onClick={() => setMonth(ym)} style={{
              padding: '7px 14px', fontSize: 13, fontWeight: month === ym ? 800 : 600, borderRadius: 8, cursor: 'pointer',
              border: `1px solid ${month === ym ? 'var(--payi-mint)' : 'var(--payi-border)'}`,
              background: month === ym ? 'var(--payi-mint-soft)' : 'var(--payi-surface)',
              color: month === ym ? 'var(--payi-mint-strong)' : 'var(--payi-text)',
            }}>{monthLabel(ym)}</button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 20 }}>
        <KpiCard title="ยอดขายรวม" value={fmtBaht(cur?.sales || 0)} subtitle={prev ? `เทียบ ${monthLabel(prev.month)}` : 'เดือนนี้'} icon={DollarSign} trend={salesMoM !== null ? `${salesMoM >= 0 ? '+' : ''}${salesMoM}%` : null} isPositive={salesMoM === null || salesMoM >= 0} />
        <KpiCard title="จำนวนออเดอร์" value={fmt(cur?.orders || 0)} subtitle={prev ? `เทียบ ${monthLabel(prev.month)}` : 'เดือนนี้'} icon={ShoppingBag} trend={ordersMoM !== null ? `${ordersMoM >= 0 ? '+' : ''}${ordersMoM}%` : null} isPositive={ordersMoM === null || ordersMoM >= 0} />
        <KpiCard title="จำนวนชิ้น" value={fmt(cur?.units || 0)} subtitle={prev ? `เทียบ ${monthLabel(prev.month)}` : 'เดือนนี้'} icon={Package} trend={unitsMoM !== null ? `${unitsMoM >= 0 ? '+' : ''}${unitsMoM}%` : null} isPositive={unitsMoM === null || unitsMoM >= 0} />
      </div>

      {/* Sales by store + Platform donut */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(240px, 1fr)', gap: 16, marginBottom: 20 }}>
        <Card title="ยอดขายแยกร้าน" sub={`เดือน${monthLabel(month)} · เรียงจากมากไปน้อย`}>
          <ResponsiveContainer width="100%" height={Math.max(200, stores.length * 42)}>
            <BarChart data={stores} layout="vertical" margin={{ left: 8, right: 40, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: '#888' }} axisLine={false} tickLine={false} tickFormatter={(v) => `฿${v >= 1000000 ? (v / 1000000).toFixed(1) + 'M' : Math.round(v / 1000) + 'k'}`} />
              <YAxis type="category" dataKey="store" tick={{ fontSize: 12, fill: 'var(--payi-text)' }} axisLine={false} tickLine={false} width={110} />
              <Tooltip content={<TooltipBox moneyKeys={['sales']} />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
              <Bar dataKey="sales" name="ยอดขาย" radius={[0, 6, 6, 0]} barSize={20} label={{ position: 'right', fontSize: 11, fill: 'var(--payi-text-muted)', formatter: (v) => fmtShort(v) }}>
                {stores.map((s, i) => <Cell key={i} fill={platColor(s.platform)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="สัดส่วนแพลตฟอร์ม" sub={`เดือน${monthLabel(month)}`}>
          <ResponsiveContainer width="100%" height={230}>
            <PieChart>
              <Pie data={platformShare} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={82} paddingAngle={2}>
                {platformShare.map((p, i) => <Cell key={i} fill={platColor(p.name)} />)}
              </Pie>
              <Tooltip content={<TooltipBox moneyKeys={['value']} />} />
              <Legend verticalAlign="bottom" height={24} formatter={(v) => <span style={{ fontSize: 12, color: 'var(--payi-text)' }}>{v}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Monthly trend combo */}
      <Card title="แนวโน้มรายเดือน" sub="แท่ง = ยอดขาย · เส้น = จำนวนออเดอร์" mb>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={trendChart} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--payi-text-muted)' }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="l" tick={{ fontSize: 10, fill: '#888' }} axisLine={false} tickLine={false} tickFormatter={(v) => `฿${v >= 1000000 ? (v / 1000000).toFixed(0) + 'M' : Math.round(v / 1000) + 'k'}`} />
            <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10, fill: '#888' }} axisLine={false} tickLine={false} />
            <Tooltip content={<TooltipBox moneyKeys={['sales']} />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
            <Bar yAxisId="l" dataKey="sales" name="ยอดขาย" fill="var(--payi-mint)" radius={[6, 6, 0, 0]} barSize={38} />
            <Line yAxisId="r" dataKey="orders" name="ออเดอร์" stroke="#F0662C" strokeWidth={2.5} dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>

      {/* Orders by store */}
      <Card title="จำนวนออเดอร์แยกร้าน" sub={`เดือน${monthLabel(month)}`}>
        <ResponsiveContainer width="100%" height={Math.max(180, stores.length * 42)}>
          <BarChart data={[...stores].sort((a, b) => b.orders - a.orders)} layout="vertical" margin={{ left: 8, right: 40, top: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10, fill: '#888' }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="store" tick={{ fontSize: 12, fill: 'var(--payi-text)' }} axisLine={false} tickLine={false} width={110} />
            <Tooltip content={<TooltipBox />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
            <Bar dataKey="orders" name="ออเดอร์" radius={[0, 6, 6, 0]} barSize={20} label={{ position: 'right', fontSize: 11, fill: 'var(--payi-text-muted)', formatter: (v) => fmt(v) }}>
              {[...stores].sort((a, b) => b.orders - a.orders).map((s, i) => <Cell key={i} fill={platColor(s.platform)} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, padding: '10px 14px', background: 'var(--payi-surface-muted)', borderRadius: 10, fontSize: 12, color: 'var(--payi-text-muted)' }}>
        <Info size={15} />
        ค่า Ads และยอด TikTok แยกช่อง (Affiliate/Live/VDO) ยังไม่รวม — ต้องต่อแหล่งข้อมูลเพิ่ม
      </div>
    </div>
  )
}

function Card({ title, sub, children, mb }) {
  return (
    <div className="payi-glass-card" style={{ padding: 18, marginBottom: mb ? 20 : 0 }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--payi-text-strong)' }}>{title}</div>
        {sub && <div style={{ fontSize: 12, color: 'var(--payi-text-muted)', marginTop: 2 }}>{sub}</div>}
      </div>
      {children}
    </div>
  )
}

function Center({ children, danger }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: '50vh', fontSize: 14, color: danger ? 'var(--payi-danger)' : 'var(--payi-text-muted)' }}>
      {children}
    </div>
  )
}
