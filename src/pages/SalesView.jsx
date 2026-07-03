import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Store } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

// บันทึกยอดขายนอกแพลตฟอร์ม (หน้าร้าน / LINE / งานอีเวนต์) — เก็บในเครื่อง (local-first)
const STORE = 'payi-offplatform-sales'
const fmt = (n) => Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 0 })
const today = () => new Date().toISOString().slice(0, 10)

export default function SalesView() {
  const [items, setItems] = useState([])
  const [form, setForm] = useState({ date: today(), channel: 'หน้าร้าน', business: '', product: '', qty: 1, revenue: '' })

  useEffect(() => {
    try { setItems(JSON.parse(localStorage.getItem(STORE) || '[]')) } catch { setItems([]) }
  }, [])
  const persist = (next) => { setItems(next); try { localStorage.setItem(STORE, JSON.stringify(next)) } catch {} }

  const add = () => {
    if (!form.product || !form.revenue) return
    persist([{ ...form, id: Date.now(), qty: Number(form.qty) || 1, revenue: Number(form.revenue) || 0 }, ...items])
    setForm({ ...form, product: '', revenue: '', qty: 1 })
  }
  const remove = (id) => persist(items.filter((i) => i.id !== id))

  const totalRevenue = useMemo(() => items.reduce((s, i) => s + i.revenue, 0), [items])
  const totalQty = useMemo(() => items.reduce((s, i) => s + i.qty, 0), [items])
  const byDay = useMemo(() => {
    const m = {}
    for (const i of items) m[i.date] = (m[i.date] || 0) + i.revenue
    return Object.entries(m).map(([label, revenue]) => ({ label: label.slice(5), revenue })).sort((a, b) => a.label.localeCompare(b.label))
  }, [items])

  const inp = { padding: '9px 12px', fontSize: 13 }
  return (
    <div style={{ width: '100%' }}>
      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 20 }}>
        {[['ยอดขายนอกแพลตฟอร์มรวม', `฿${fmt(totalRevenue)}`], ['จำนวนชิ้น', fmt(totalQty)], ['จำนวนรายการ', fmt(items.length)]].map(([label, value]) => (
          <div key={label} className="payi-glass-card" style={{ padding: '16px 18px' }}>
            <div style={{ fontSize: 11, color: 'var(--payi-text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
            <div style={{ fontSize: 24, fontWeight: 850, color: 'var(--payi-text-strong)', marginTop: 6 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Add form */}
      <div className="payi-glass-card" style={{ padding: 16, marginBottom: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr)) auto', gap: 10, alignItems: 'end' }}>
        <input className="payi-date-input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={inp} />
        <select className="payi-select" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })} style={inp}>
          <option>หน้าร้าน</option><option>LINE</option><option>งานอีเวนต์</option><option>Facebook</option><option>อื่นๆ</option>
        </select>
        <input className="payi-input" placeholder="ธุรกิจ" value={form.business} onChange={(e) => setForm({ ...form, business: e.target.value })} style={inp} />
        <input className="payi-input" placeholder="ชื่อสินค้า *" value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })} style={inp} />
        <input className="payi-input" type="number" placeholder="จำนวน" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} style={inp} />
        <input className="payi-input" type="number" placeholder="ยอดขาย ฿ *" value={form.revenue} onChange={(e) => setForm({ ...form, revenue: e.target.value })} style={inp} />
        <button onClick={add} className="payi-btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}><Plus size={15} /> เพิ่ม</button>
      </div>

      {/* Chart */}
      {byDay.length > 0 && (
        <div className="payi-glass-card" style={{ padding: 18, marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--payi-text-strong)', marginBottom: 12 }}>ยอดขายนอกแพลตฟอร์มรายวัน</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={byDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#888' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#888' }} axisLine={false} tickLine={false} tickFormatter={(v) => `฿${v >= 1000 ? Math.round(v / 1000) + 'k' : v}`} />
              <Tooltip formatter={(v) => [`฿${fmt(v)}`, 'ยอดขาย']} />
              <Bar dataKey="revenue" fill="var(--payi-mint)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* List */}
      <div className="payi-glass-card" style={{ padding: 4 }}>
        {items.length === 0 ? (
          <div style={{ padding: 28, textAlign: 'center', color: 'var(--payi-text-faint)' }}>
            <Store size={28} style={{ opacity: 0.4, marginBottom: 8 }} />
            <div style={{ fontSize: 13 }}>ยังไม่มีรายการ — เพิ่มยอดขายนอกแพลตฟอร์มด้านบน</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: 'var(--payi-surface-muted)', color: 'var(--payi-text-muted)' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left' }}>วันที่</th>
                <th style={{ padding: '10px 14px', textAlign: 'left' }}>ช่องทาง</th>
                <th style={{ padding: '10px 14px', textAlign: 'left' }}>สินค้า</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>จำนวน</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>ยอดขาย</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} style={{ borderTop: '1px solid var(--payi-border)' }}>
                  <td style={{ padding: '10px 14px', color: 'var(--payi-text-muted)' }}>{i.date}</td>
                  <td style={{ padding: '10px 14px' }}>{i.channel}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--payi-text-strong)', fontWeight: 500 }}>{i.product}{i.business ? <span style={{ color: 'var(--payi-text-faint)' }}> · {i.business}</span> : null}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>{fmt(i.qty)}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700 }}>฿{fmt(i.revenue)}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}><button onClick={() => remove(i.id)} style={{ border: 'none', background: 'transparent', color: 'var(--payi-text-faint)', cursor: 'pointer' }}><Trash2 size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
