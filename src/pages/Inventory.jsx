import { useCallback, useEffect, useMemo, useState } from 'react'
import { Boxes, Layers, AlertTriangle, ArrowLeftRight, Plus, Pencil, X } from 'lucide-react'
import KpiCard from '../components/KpiCard'

const fmt = (n) => Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 0 })

const STATUS_STYLE = {
  'ปกติ': { bg: 'var(--payi-success-bg)', color: 'var(--payi-success)' },
  'ใกล้หมด': { bg: '#fff7ed', color: '#c2410c' },
  'หมด': { bg: 'var(--payi-danger-bg)', color: 'var(--payi-danger)' },
}

function StatusBadge({ status }) {
  const style = STATUS_STYLE[status] || STATUS_STYLE['ปกติ']
  return (
    <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 999, background: style.bg, color: style.color }}>
      {status}
    </span>
  )
}

// ฟอร์มกลาง ใช้ทั้งเพิ่มสินค้าใหม่ และรับเข้า/เบิกออกด่วนจากตาราง
function Modal({ title, onClose, children }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', display: 'grid', placeItems: 'center', zIndex: 999 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--payi-surface)', borderRadius: 16, padding: 24, width: 420, maxWidth: '92vw', boxShadow: '0 20px 60px rgba(15,23,42,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--payi-text-strong)' }}>{title}</div>
          <button onClick={onClose} style={{ border: 'none', background: 'var(--payi-border)', borderRadius: '50%', width: 28, height: 28, display: 'grid', placeItems: 'center', cursor: 'pointer', color: 'var(--payi-text-muted)' }}>
            <X size={14} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

const inputStyle = { width: '100%', border: '1px solid var(--payi-border)', borderRadius: 10, padding: '9px 12px', fontSize: 13, outline: 'none', boxSizing: 'border-box' }
const labelStyle = { fontSize: 12, fontWeight: 700, color: 'var(--payi-text-muted)', marginBottom: 5, display: 'block' }

export default function Inventory() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')
  const [itemModal, setItemModal] = useState(null) // null | 'new' | item object (edit)
  const [moveModal, setMoveModal] = useState(null) // { sku, display_name, unit, type }

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    fetch('/api/sheet-tools?op=inventory&view=items')
      .then((r) => r.json())
      .then((d) => { if (!d.success) throw new Error(d.error || 'โหลดข้อมูลไม่สำเร็จ'); setData(d) })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const items = data?.items || []
  const totals = data?.totals || { totalProducts: 0, totalStock: 0, lowStockCount: 0, transactionsToday: 0 }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((it) => it.display_name.toLowerCase().includes(q) || String(it.sku).toLowerCase().includes(q))
  }, [items, query])

  const saveItem = async (payload) => {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/sheet-tools?op=inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'upsert-item', ...payload }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'บันทึกไม่สำเร็จ')
      setItemModal(null)
      load()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const saveMovement = async (payload) => {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/sheet-tools?op=inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add-movement', ...payload }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'บันทึกไม่สำเร็จ')
      setMoveModal(null)
      load()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, width: '100%' }}>
      {error && (
        <div style={{ background: 'var(--payi-danger-bg)', color: 'var(--payi-danger)', borderRadius: 12, padding: '10px 14px', fontSize: 13 }}>{error}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        <KpiCard title="Total Products" value={fmt(totals.totalProducts)} subtitle="รายการสินค้า" icon={Boxes} trend={null} />
        <KpiCard title="Total Stock" value={fmt(totals.totalStock)} subtitle="รวมทุกหน่วย" icon={Layers} trend={null} />
        <KpiCard title="Low Stock" value={fmt(totals.lowStockCount)} subtitle="รายการใกล้หมด/หมด" icon={AlertTriangle} trend={null} />
        <KpiCard title="Transactions" value={fmt(totals.transactionsToday)} subtitle="วันนี้" icon={ArrowLeftRight} trend={null} />
      </div>

      <div style={{ background: 'var(--payi-surface)', border: '1px solid var(--payi-border)', borderRadius: 18, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--payi-text-strong)' }}>สินค้า ({filtered.length} รายการ)</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาสินค้า..." style={{ ...inputStyle, width: 220 }} />
            <button
              onClick={() => setItemModal('new')}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--payi-mint)', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 16px', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}
            >
              <Plus size={14} /> เพิ่มสินค้า
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--payi-text-faint)', fontSize: 13 }}>กำลังโหลด...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--payi-text-faint)', fontSize: 13 }}>ยังไม่มีสินค้าในระบบ — กด "เพิ่มสินค้า" เพื่อเริ่มต้น</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--payi-text-muted)', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <th style={{ padding: '8px 10px' }}>สินค้า</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>คงเหลือ</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>ขั้นต่ำ</th>
                  <th style={{ padding: '8px 10px' }}>หน่วย</th>
                  <th style={{ padding: '8px 10px' }}>สถานะ</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((it) => (
                  <tr key={it.sku} style={{ borderTop: '1px solid var(--payi-border)' }}>
                    <td style={{ padding: '10px' }}>
                      <div style={{ fontWeight: 700, color: 'var(--payi-text-strong)' }}>{it.display_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--payi-text-faint)', fontFamily: 'monospace' }}>{it.sku}</div>
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 800, color: it.balance <= 0 ? 'var(--payi-danger)' : 'var(--payi-text-strong)' }}>{fmt(it.balance)}</td>
                    <td style={{ padding: '10px', textAlign: 'right', color: 'var(--payi-text-muted)' }}>{fmt(it.safety_stock)}</td>
                    <td style={{ padding: '10px', color: 'var(--payi-text-muted)' }}>{it.unit}</td>
                    <td style={{ padding: '10px' }}><StatusBadge status={it.status} /></td>
                    <td style={{ padding: '10px' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button onClick={() => setMoveModal({ sku: it.sku, display_name: it.display_name, unit: it.unit, type: 'in' })} title="รับเข้า" style={iconBtnStyle('var(--payi-success)')}>+</button>
                        <button onClick={() => setMoveModal({ sku: it.sku, display_name: it.display_name, unit: it.unit, type: 'out' })} title="เบิกออก" style={iconBtnStyle('var(--payi-danger)')}>−</button>
                        <button onClick={() => setItemModal(it)} title="แก้ไข" style={iconBtnStyle('var(--payi-text-muted)')}><Pencil size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {itemModal && (
        <ItemModal
          initial={itemModal === 'new' ? null : itemModal}
          saving={saving}
          onClose={() => setItemModal(null)}
          onSave={saveItem}
        />
      )}

      {moveModal && (
        <MovementModal
          target={moveModal}
          saving={saving}
          onClose={() => setMoveModal(null)}
          onSave={saveMovement}
        />
      )}
    </div>
  )
}

const iconBtnStyle = (color) => ({
  border: '1px solid var(--payi-border)', background: 'var(--payi-surface-muted)', color,
  width: 28, height: 28, borderRadius: 8, display: 'grid', placeItems: 'center',
  fontSize: 16, fontWeight: 800, cursor: 'pointer', lineHeight: 1,
})

function ItemModal({ initial, saving, onClose, onSave }) {
  const isEdit = Boolean(initial)
  const [sku, setSku] = useState(initial?.sku || '')
  const [displayName, setDisplayName] = useState(initial?.display_name || '')
  const [unit, setUnit] = useState(initial?.unit || 'ชิ้น')
  const [safetyStock, setSafetyStock] = useState(initial?.safety_stock ?? '')
  const [openingBalance, setOpeningBalance] = useState(isEdit ? '' : '0')

  const submit = (e) => {
    e.preventDefault()
    if (!sku.trim() || !displayName.trim()) return
    const payload = { sku: sku.trim(), display_name: displayName.trim(), unit, safety_stock: safetyStock }
    if (!isEdit) payload.opening_balance = openingBalance
    onSave(payload)
  }

  return (
    <Modal title={isEdit ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={labelStyle}>รหัสสินค้า (SKU)</label>
          <input value={sku} onChange={(e) => setSku(e.target.value)} disabled={isEdit} required style={{ ...inputStyle, opacity: isEdit ? 0.6 : 1 }} placeholder="เช่น PY006" />
        </div>
        <div>
          <label style={labelStyle}>ชื่อสินค้า</label>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required style={inputStyle} placeholder="เช่น ถุงเท้าเจล 2in1 M" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>หน่วย</label>
            <input value={unit} onChange={(e) => setUnit(e.target.value)} style={inputStyle} placeholder="คู่ / ชิ้น / แพ็ค" />
          </div>
          <div>
            <label style={labelStyle}>ขั้นต่ำ (safety stock)</label>
            <input type="number" value={safetyStock} onChange={(e) => setSafetyStock(e.target.value)} style={inputStyle} placeholder="0" />
          </div>
        </div>
        {!isEdit && (
          <div>
            <label style={labelStyle}>ยอดคงเหลือเริ่มต้น</label>
            <input type="number" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} style={inputStyle} placeholder="0" />
          </div>
        )}
        <button type="submit" disabled={saving} style={{ marginTop: 6, background: 'var(--payi-mint)', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 16px', fontSize: 14, fontWeight: 800, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
          {saving ? 'กำลังบันทึก...' : 'บันทึก'}
        </button>
      </form>
    </Modal>
  )
}

function MovementModal({ target, saving, onClose, onSave }) {
  const [type, setType] = useState(target.type || 'in')
  const [qty, setQty] = useState('')
  const [date, setDate] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }))
  const [note, setNote] = useState('')

  const submit = (e) => {
    e.preventDefault()
    if (!qty || Number(qty) === 0) return
    onSave({ sku: target.sku, type, qty, date, note })
  }

  return (
    <Modal title={`บันทึกรายการ — ${target.display_name}`} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {[['in', 'รับเข้า'], ['out', 'เบิกออก'], ['adjust', 'ปรับยอด']].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setType(id)}
              style={{
                flex: 1, padding: '9px 0', borderRadius: 10, fontSize: 12, fontWeight: 800, cursor: 'pointer',
                border: `1px solid ${type === id ? 'var(--payi-mint)' : 'var(--payi-border)'}`,
                background: type === id ? 'var(--payi-mint-soft)' : 'var(--payi-surface)',
                color: type === id ? 'var(--payi-mint-strong)' : 'var(--payi-text-muted)',
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div>
          <label style={labelStyle}>{type === 'adjust' ? `จำนวนที่ปรับ (${target.unit}) — ใส่ลบถ้าลดยอด` : `จำนวน (${target.unit})`}</label>
          <input type="number" value={qty} onChange={(e) => setQty(e.target.value)} required style={inputStyle} placeholder="0" />
        </div>
        <div>
          <label style={labelStyle}>วันที่</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>หมายเหตุ</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} style={inputStyle} placeholder="ไม่บังคับ" />
        </div>
        <button type="submit" disabled={saving} style={{ marginTop: 6, background: 'var(--payi-mint)', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 16px', fontSize: 14, fontWeight: 800, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
          {saving ? 'กำลังบันทึก...' : 'บันทึก'}
        </button>
      </form>
    </Modal>
  )
}
