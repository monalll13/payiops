import { useCallback, useEffect, useMemo, useState } from 'react'
import { Boxes, Layers, AlertTriangle, ArrowLeftRight, Plus, Pencil, X, Eye, EyeOff } from 'lucide-react'
import KpiCard from '../components/KpiCard'

const fmt = (n) => Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 0 })

// เหมือน statusOf ฝั่ง api/_lib/inventory.js — แต่รับ safety stock ที่คำนวณสดจากสูตร lead time
// ด้วย (effectiveSafety) ไม่ใช่แค่เลขที่เซฟไว้ในชีต ไม่งั้นสถานะ/แนะนำสั่งซื้อจะไม่ขยับตามสูตรเลย
const statusOf = (balance, safetyStock) => {
  if (balance <= 0) return 'หมด'
  if (safetyStock > 0 && balance <= safetyStock) return 'ใกล้หมด'
  return 'ปกติ'
}

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

// SS = ยอดขายเฉลี่ย/วัน × (lead time total + ครึ่งนึงถ้าเป็นของเรือ) — สูตรจากไฟล์ Safety UP177 เดิม
// เรือใช้เวลานานและแปรผัน เผื่อเพิ่มอีกครึ่งของ lead time ไปเลย (ROP รวมอยู่ใน SS ตัวนี้แล้ว ไม่แยกช่อง)
const calcSuggestedSafety = (dailyAvg, leadTimeTotal, shipFreight) => {
  if (!dailyAvg || !leadTimeTotal) return null
  const days = leadTimeTotal + (shipFreight ? leadTimeTotal / 2 : 0)
  return Math.round(dailyAvg * days)
}

// แนะนำสั่งซื้อ = ควรมี(SS) - ของที่คาดว่าจะเหลือตอนของมาถึง (คงเหลือตอนนี้ - ใช้ไประหว่างรอ)
const calcRecommendedOrder = (safetyStock, balance, dailyAvg, leadTimeTotal) => {
  const projectedAtArrival = balance - dailyAvg * leadTimeTotal
  return Math.max(0, Math.round(safetyStock - projectedAtArrival))
}

export default function Inventory() {
  const [data, setData] = useState(null)
  const [salesBySku, setSalesBySku] = useState(new Map()) // sku -> { dailyAverage, abc, units90 }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')
  const [onlyRecommended, setOnlyRecommended] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  const [itemModal, setItemModal] = useState(null) // null | 'new' | item object (edit)
  const [moveModal, setMoveModal] = useState(null) // { sku, display_name, unit, type }

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    Promise.all([
      fetch('/api/sheet-tools?op=inventory&view=items&includeHidden=1').then((r) => r.json()),
      fetch('/api/planner-sales').then((r) => r.json()).catch(() => null),
    ])
      .then(([d, planner]) => {
        if (!d.success) throw new Error(d.error || 'โหลดข้อมูลไม่สำเร็จ')
        setData(d)
        setSalesBySku(new Map((planner?.items || []).map((p) => [String(p.masterSku || '').toUpperCase(), p])))
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const items = data?.items || []
  const totals = data?.totals || { totalProducts: 0, totalStock: 0, lowStockCount: 0, transactionsToday: 0 }

  // ผูกยอดขาย 90 วัน + ABC เข้ากับแต่ละสินค้า แล้วคำนวณขั้นต่ำแนะนำ/แนะนำสั่งซื้อสดๆ ที่นี่ที่เดียว
  // (ตารางกับ modal แก้ไขใช้ตัวเลขชุดเดียวกัน ไม่แยกคำนวณคนละที่)
  //
  // SKU ที่แยกสี/ไซส์เอง (เช่น PY066-B, PY051-C) ไม่มียอดขายของตัวเองตรงๆ เพราะ raw_orders
  // บันทึกรวมเป็น master_sku ฐานเดียว (PY066) มาตั้งแต่ต้น ไม่เคยแยกสีตอนขาย — fallback โดย
  // เฉลี่ยยอดของฐานตามสัดส่วนคงเหลือ (balance) ของแต่ละตัวในกลุ่ม ดีกว่าไม่มีข้อมูลเลย
  // แต่เป็นการประมาณ ไม่ใช่ยอดขายจริงแยกสี
  const baseSkuOf = (sku) => sku.replace(/-[A-Z]$/, '')
  const allocatedSales = useMemo(() => {
    const childrenByBase = new Map()
    for (const it of items) {
      const sku = String(it.sku).toUpperCase()
      if (salesBySku.has(sku)) continue
      const base = baseSkuOf(sku)
      if (base === sku || !salesBySku.has(base)) continue
      if (!childrenByBase.has(base)) childrenByBase.set(base, [])
      childrenByBase.get(base).push(it)
    }
    const result = new Map()
    for (const [base, children] of childrenByBase) {
      const baseItem = items.find((it) => String(it.sku).toUpperCase() === base)
      const group = baseItem ? [baseItem, ...children] : children
      const baseSales = salesBySku.get(base)
      const totalBalance = group.reduce((s, it) => s + (it.balance || 0), 0)
      for (const it of group) {
        const share = totalBalance > 0 ? (it.balance || 0) / totalBalance : 1 / group.length
        result.set(String(it.sku).toUpperCase(), {
          dailyAverage: Math.round(baseSales.dailyAverage * share * 10) / 10,
          units90: Math.round(baseSales.units90 * share),
          abc: baseSales.abc,
          estimated: true,
        })
      }
    }
    return result
  }, [items, salesBySku])

  const enriched = useMemo(() => {
    return items.map((it) => {
      const sku = String(it.sku).toUpperCase()
      const sales = salesBySku.get(sku) || allocatedSales.get(sku)
      const dailyAvg = sales?.dailyAverage || 0
      const units90 = sales?.units90 || 0
      const abc = sales?.abc || null
      const salesEstimated = Boolean(sales?.estimated)
      const leadTimeTotal = (it.lead_time_production || 0) + (it.lead_time_transport || 0)
      const computedSafety = calcSuggestedSafety(dailyAvg, leadTimeTotal, it.ship_freight)
      const effectiveSafety = computedSafety !== null ? computedSafety : it.safety_stock
      const effectiveStatus = statusOf(it.balance, effectiveSafety)
      const recommendedOrder = effectiveStatus !== 'ปกติ' && dailyAvg && leadTimeTotal
        ? calcRecommendedOrder(effectiveSafety, it.balance, dailyAvg, leadTimeTotal)
        : null
      return { ...it, dailyAvg, units90, abc, salesEstimated, leadTimeTotal, computedSafety, effectiveSafety, effectiveStatus, recommendedOrder }
    })
  }, [items, salesBySku, allocatedSales])

  // นับ Low Stock จาก effectiveStatus (สูตรสด) ไม่ใช้ totals.lowStockCount จาก server ตรงๆ
  // เพราะอันนั้นนับจาก safety_stock ที่เซฟไว้ในชีตเท่านั้น จะไม่ตรงกับสถานะที่โชว์ในตาราง
  const activeEnriched = useMemo(() => enriched.filter((it) => it.active), [enriched])
  const lowStockCount = useMemo(() => activeEnriched.filter((it) => it.effectiveStatus !== 'ปกติ').length, [activeEnriched])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let rows = enriched.filter((it) => (showHidden ? !it.active : it.active))
    if (q) rows = rows.filter((it) => it.display_name.toLowerCase().includes(q) || String(it.sku).toLowerCase().includes(q))
    if (onlyRecommended) rows = rows.filter((it) => (it.recommendedOrder || 0) > 0)
    return [...rows].sort((a, b) => String(a.sku).localeCompare(String(b.sku), undefined, { numeric: true }))
  }, [enriched, query, onlyRecommended, showHidden])

  const setItemHidden = async (sku, hidden) => {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/sheet-tools?op=inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'upsert-item', sku, active: !hidden }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'บันทึกไม่สำเร็จ')
      load()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // payload.balanceCorrection (ถ้ามี) มาจากช่อง "นับสต็อกจริง" ในป็อปอัพแก้ไขเดียวกัน —
  // บันทึกแยกเป็นรายการ adjust ใน stock_movements เสมอ (ประวัติแยกดูได้ที่ Stock Movement)
  // ไม่ใช่การเขียนทับ opening_balance ตรงๆ
  const saveItem = async ({ balanceCorrection, ...payload }) => {
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

      if (balanceCorrection?.delta) {
        const res2 = await fetch('/api/sheet-tools?op=inventory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'add-movement',
            sku: payload.sku,
            type: 'adjust',
            qty: balanceCorrection.delta,
            date: balanceCorrection.date,
            note: balanceCorrection.note,
          }),
        })
        const json2 = await res2.json()
        if (!json2.success) throw new Error(json2.error || 'ปรับยอดคงเหลือไม่สำเร็จ')
      }

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
        <KpiCard title="Low Stock" value={fmt(lowStockCount)} subtitle="รายการใกล้หมด/หมด" icon={AlertTriangle} trend={null} />
        <KpiCard title="Transactions" value={fmt(totals.transactionsToday)} subtitle="วันนี้" icon={ArrowLeftRight} trend={null} />
      </div>

      <div style={{ background: 'var(--payi-surface)', border: '1px solid var(--payi-border)', borderRadius: 18, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--payi-text-strong)' }}>สินค้า ({filtered.length} รายการ)</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--payi-text-muted)', cursor: 'pointer' }}>
              <input type="checkbox" checked={onlyRecommended} onChange={(e) => setOnlyRecommended(e.target.checked)} />
              เฉพาะที่แนะนำสั่ง
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--payi-text-muted)', cursor: 'pointer' }}>
              <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />
              แสดงสินค้าที่ซ่อนไว้
            </label>
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
                  <th style={{ padding: '8px 10px' }}>ABC</th>
                  <th style={{ padding: '8px 10px' }}>สินค้า</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>คงเหลือ</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>ขั้นต่ำ</th>
                  <th style={{ padding: '8px 10px' }}>หน่วย</th>
                  <th style={{ padding: '8px 10px' }}>สถานะ</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>แนะนำสั่งซื้อ</th>
                  <th style={{ padding: '8px 10px' }}>วันเติมสินค้า/รอเช็ค</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((it) => {
                  const recommendedOrder = it.recommendedOrder
                  return (
                  <tr key={it.sku} style={{ borderTop: '1px solid var(--payi-border)' }}>
                    <td style={{ padding: '10px' }}>
                      {it.abc && (
                        <span
                          title={it.salesEstimated ? 'ประมาณจากยอดขายรวมของ SKU หลัก แบ่งตามสัดส่วนคงเหลือ ไม่ใช่ยอดขายแยกจริง' : undefined}
                          style={{
                            fontSize: 11, fontWeight: 800, padding: it.ship_freight ? '2px 7px' : 0, borderRadius: 999,
                            background: it.ship_freight ? '#fde047' : 'transparent',
                            color: it.ship_freight ? '#713f12' : 'var(--payi-text-faint)',
                          }}
                        >
                          {it.salesEstimated ? '≈' : ''}{it.abc}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px', opacity: it.active ? 1 : 0.5 }}>
                      <div style={{ fontWeight: 700, color: 'var(--payi-text-strong)' }}>{it.display_name}{!it.active && ' (ซ่อนอยู่)'}</div>
                      <div style={{ fontSize: 11, color: 'var(--payi-text-faint)', fontFamily: 'monospace' }}>{it.sku}</div>
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 800, color: it.balance <= 0 ? 'var(--payi-danger)' : 'var(--payi-text-strong)' }}>{fmt(it.balance)}</td>
                    <td style={{ padding: '10px', textAlign: 'right' }}>
                      <button
                        onClick={() => setItemModal(it)}
                        title="กดเพื่อแก้ไข"
                        style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, color: 'var(--payi-text-muted)' }}
                      >
                        {fmt(it.effectiveSafety)}
                      </button>
                    </td>
                    <td style={{ padding: '10px', color: 'var(--payi-text-muted)' }}>{it.unit}</td>
                    <td style={{ padding: '10px' }}>
                      <StatusBadge status={it.effectiveStatus} />
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right' }}>
                      {recommendedOrder !== null && (
                        <span style={{ fontWeight: 800, color: recommendedOrder > 0 ? '#c2410c' : 'var(--payi-text-faint)' }}>
                          {recommendedOrder > 0 ? `+${fmt(recommendedOrder)}` : '-'}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px' }}>
                      <button
                        onClick={() => setItemModal(it)}
                        title="กดเพื่อแก้ไข"
                        style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, color: 'var(--payi-text)', minHeight: 18, maxWidth: 180, display: 'block', textAlign: 'left', whiteSpace: 'normal' }}
                      >
                        {it.reorder_date || ''}
                      </button>
                    </td>
                    <td style={{ padding: '10px' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        {it.active ? (
                          <>
                            <button onClick={() => setMoveModal({ sku: it.sku, display_name: it.display_name, unit: it.unit, type: 'in' })} title="รับเข้า" style={iconBtnStyle('var(--payi-success)')}>+</button>
                            <button onClick={() => setMoveModal({ sku: it.sku, display_name: it.display_name, unit: it.unit, type: 'out' })} title="เบิกออก" style={iconBtnStyle('var(--payi-danger)')}>−</button>
                            <button onClick={() => setItemModal(it)} title="แก้ไข (รวมปรับยอดคงเหลือ)" style={iconBtnStyle('var(--payi-text-muted)')}><Pencil size={13} /></button>
                            <button onClick={() => setItemHidden(it.sku, true)} title="ซ่อนสินค้านี้ (ไม่ได้ใช้ track สต็อก)" style={iconBtnStyle('var(--payi-text-muted)')}><EyeOff size={13} /></button>
                          </>
                        ) : (
                          <button onClick={() => setItemHidden(it.sku, false)} title="ยกเลิกซ่อน" style={{ ...iconBtnStyle('var(--payi-mint-strong)'), width: 'auto', padding: '0 10px', gap: 6, display: 'flex', alignItems: 'center' }}>
                            <Eye size={13} /> กู้คืน
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {itemModal && (
        <ItemModal
          initial={itemModal === 'new' ? null : itemModal}
          dailyAvg={itemModal === 'new' ? 0 : itemModal.dailyAvg || 0}
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

function ItemModal({ initial, dailyAvg, saving, onClose, onSave }) {
  const isEdit = Boolean(initial)
  const [sku, setSku] = useState(initial?.sku || '')
  const [displayName, setDisplayName] = useState(initial?.display_name || '')
  const [unit, setUnit] = useState(initial?.unit || 'ชิ้น')
  const [leadProd, setLeadProd] = useState(initial?.lead_time_production ?? '')
  const [leadTransport, setLeadTransport] = useState(initial?.lead_time_transport ?? '')
  const [shipFreight, setShipFreight] = useState(initial?.ship_freight ?? false)
  // เปิดมาแล้วมี lead time เดิมอยู่แล้ว = ใช้ค่าที่สูตรคำนวณให้เลยตั้งแต่เปิด ไม่ต้องรอแก้ lead time ก่อน
  const [safetyStock, setSafetyStock] = useState(
    initial?.computedSafety ?? initial?.safety_stock ?? ''
  )
  const [openingBalance, setOpeningBalance] = useState(isEdit ? '' : '0')
  const [reorderNote, setReorderNote] = useState(initial?.reorder_date || '')
  // นับสต็อกจริงไม่ตรง — แก้ตรงนี้เลยแทนป็อปอัพแยก บันทึกเป็นรายการ adjust แยกประวัติเสมอ
  const [actualBalance, setActualBalance] = useState(initial?.balance ?? '')
  const [correctionNote, setCorrectionNote] = useState('')

  // แก้ lead time/ทางเรือแล้ว คำนวณขั้นต่ำแนะนำให้ใหม่อัตโนมัติ (ยังแก้เลขเองทับได้เสมอ)
  const leadTimeTotal = (Number(leadProd) || 0) + (Number(leadTransport) || 0)
  const suggestedSafety = calcSuggestedSafety(dailyAvg, leadTimeTotal, shipFreight)
  useEffect(() => {
    if (suggestedSafety !== null) setSafetyStock(suggestedSafety)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadProd, leadTransport, shipFreight])

  const balanceDelta = isEdit && actualBalance !== '' ? Number(actualBalance) - initial.balance : 0

  const submit = (e) => {
    e.preventDefault()
    if (!sku.trim() || !displayName.trim()) return
    const payload = { sku: sku.trim(), display_name: displayName.trim(), unit, safety_stock: safetyStock }
    if (!isEdit) payload.opening_balance = openingBalance
    if (isEdit) {
      payload.reorder_date = reorderNote
      payload.lead_time_production = leadProd
      payload.lead_time_transport = leadTransport
      payload.ship_freight = shipFreight
      if (balanceDelta) {
        payload.balanceCorrection = {
          delta: balanceDelta,
          date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }),
          note: correctionNote.trim() || `ปรับยอดจากนับสต็อกจริง (เดิม ${fmt(initial.balance)} → ${fmt(Number(actualBalance))})`,
        }
      }
    }
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
        {isEdit && (
          <div style={{ background: 'var(--payi-surface-muted)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--payi-text-muted)' }}>Lead time (ไว้คำนวณขั้นต่ำแนะนำอัตโนมัติ)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>ผลิต (วัน)</label>
                <input type="number" value={leadProd} onChange={(e) => setLeadProd(e.target.value)} style={inputStyle} placeholder="0" />
              </div>
              <div>
                <label style={labelStyle}>ขนส่ง (วัน)</label>
                <input type="number" value={leadTransport} onChange={(e) => setLeadTransport(e.target.value)} style={inputStyle} placeholder="0" />
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={shipFreight} onChange={(e) => setShipFreight(e.target.checked)} />
              ส่งทางเรือ (เผื่อเวลาเพิ่มอีกครึ่งของ lead time)
            </label>
            <div style={{ fontSize: 11, color: 'var(--payi-text-faint)' }}>
              {dailyAvg
                ? `ยอดขายเฉลี่ย ${dailyAvg.toFixed(1)}/วัน${suggestedSafety !== null ? ` — แนะนำขั้นต่ำ ${suggestedSafety}` : ' — กรอก lead time เพื่อคำนวณ'}`
                : 'ไม่มีข้อมูลยอดขาย 90 วันล่าสุดของ SKU นี้ — คำนวณอัตโนมัติไม่ได้ ต้องกรอกขั้นต่ำเอง'}
            </div>
          </div>
        )}
        {!isEdit && (
          <div>
            <label style={labelStyle}>ยอดคงเหลือเริ่มต้น</label>
            <input type="number" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} style={inputStyle} placeholder="0" />
          </div>
        )}
        {isEdit && (
          <div>
            <label style={labelStyle}>วันเติมสินค้า/รอเช็ค</label>
            <input
              value={reorderNote}
              onChange={(e) => setReorderNote(e.target.value)}
              style={inputStyle}
              placeholder="เช่น สั่งแล้ว 2 ล็อต ล็อตแรกมา 200/500 รออีก 300 ต้นเดือน"
            />
          </div>
        )}
        {isEdit && (
          <div style={{ background: 'var(--payi-surface-muted)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--payi-text-muted)' }}>
              ปรับยอดคงเหลือ (นับสต็อกจริงไม่ตรง) — ในระบบตอนนี้ {fmt(initial.balance)} {unit}
            </div>
            <input
              type="number"
              value={actualBalance}
              onChange={(e) => setActualBalance(e.target.value)}
              style={inputStyle}
              placeholder="นับจริงได้เท่าไหร่"
            />
            {balanceDelta !== 0 && (
              <div style={{ fontSize: 12, fontWeight: 700, color: balanceDelta > 0 ? 'var(--payi-success)' : 'var(--payi-danger)' }}>
                ส่วนต่าง: {balanceDelta > 0 ? '+' : ''}{fmt(balanceDelta)} {unit}
              </div>
            )}
            {balanceDelta !== 0 && (
              <input
                value={correctionNote}
                onChange={(e) => setCorrectionNote(e.target.value)}
                style={inputStyle}
                placeholder="หมายเหตุ — ไม่บังคับ (ไม่กรอกจะบันทึกอัตโนมัติ)"
              />
            )}
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

