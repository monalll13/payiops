import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2, Clock3, Film, Loader2, Megaphone, PackagePlus, Pencil, RefreshCw,
  Search, Send, Sparkles, Trash2, TrendingUp, X,
} from 'lucide-react'

const fmt = (n) => Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 0 })
const fmtBaht = (n) => '฿' + fmt(n)
const todayIso = () => new Date().toISOString().slice(0, 10)

const EVENT_TYPES = [
  ['image_change', 'แก้รูปสินค้า'],
  ['new_product', 'ลงสินค้าใหม่'],
  ['package_change', 'ปรับแพ็คเกจ'],
  ['video_posted', 'ลงคลิป'],
  ['content_push', 'ดันคอนเทนต์'],
  ['boss_sent', 'ส่งให้บอสแล้ว'],
]

const COLUMNS = [
  { id: 'waiting', title: 'Waiting', icon: Clock3, tone: '#d97706' },
  { id: 'live', title: 'Live', icon: CheckCircle2, tone: '#20b8a6' },
  { id: 'check7', title: '7-Day Check', icon: TrendingUp, tone: '#2f5fd0' },
  { id: 'check30', title: '30-Day Check', icon: RefreshCw, tone: '#7c3aed' },
  { id: 'content', title: 'Push Content', icon: Megaphone, tone: '#db2777' },
]

const BUSINESSES = ['all', 'Payi', 'กรอบรูป']
const PLATFORMS = ['all', 'Shopee', 'TikTok Shop', 'Lazada']

export default function MarketingRadar() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    fetch('/api/marketing-events')
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) throw new Error(d.error || 'โหลดข้อมูลไม่สำเร็จ')
        if (d.productOptions?.length) {
          setData(d)
          return
        }
        return fetch('/api/products')
          .then((r) => r.json())
          .then((products) => {
            const fallbackOptions = (products.groups || []).map((item) => ({
              product_key: item.key,
              master_sku: '',
              display_name: item.label || item.key,
              revenue: item.revenue || 0,
              units: item.units || 0,
              skuCount: item.skuCount || item.members?.length || 0,
            }))
            setData({ ...d, productOptions: fallbackOptions })
          })
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    // Existing pages in this app load server data this way; keep this page aligned.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const events = useMemo(() => data?.events || [], [data])
  const radar = useMemo(() => data?.radar || {}, [data])
  const signals = useMemo(() => data?.productSignals || [], [data])
  const signalWindow = data?.signalWindow

  const filteredSignals = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return signals
    return signals.filter((item) =>
      String(item.display_name || '').toLowerCase().includes(q) ||
      String(item.master_sku || '').toLowerCase().includes(q)
    )
  }, [signals, query])

  const updateEvent = async (eventId, patch) => {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/marketing-events', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, ...patch }),
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

  const createEvent = async (payload) => {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/marketing-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'บันทึกไม่สำเร็จ')
      setDraft(null)
      load()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // บันทึก: มี event_id = แก้ไข (PATCH) ไม่งั้น = สร้างใหม่ (POST)
  const saveEvent = async (payload) => {
    if (payload.event_id) {
      await updateEvent(payload.event_id, {
        event_type: payload.event_type,
        event_date: payload.event_date,
        platform: payload.platform,
        business: payload.business,
        note: payload.note,
      })
      setDraft(null)
    } else {
      await createEvent(payload)
    }
  }

  const deleteEvent = async (eventId) => {
    if (!window.confirm('ลบเหตุการณ์นี้?')) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/marketing-events?event_id=${encodeURIComponent(eventId)}`, { method: 'DELETE' })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'ลบไม่สำเร็จ')
      if (draft?.event_id === eventId) setDraft(null)
      load()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (event) => setDraft({
    event_id: event.event_id,
    product_key: event.product_key,
    master_sku: event.master_sku,
    display_name: event.display_name,
    business: event.business || 'all',
    platform: event.platform || 'all',
    event_type: event.event_type || 'image_change',
    event_date: event.event_date || todayIso(),
    status: event.status,
    confirmed_at: event.confirmed_at || '',
    note: event.note || '',
  })

  const onDropStatus = (status, event) => {
    const eventId = event.dataTransfer.getData('event_id')
    if (eventId) updateEvent(eventId, { status })
  }

  if (loading && !data) return <Center><Loader2 size={18} className="payi-spin" /> กำลังโหลดเรดาร์การตลาด...</Center>

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(280px, 0.8fr)', gap: 16 }}>
        <section style={{ background: 'var(--payi-surface-dark)', color: '#fff', borderRadius: 8, padding: 22, minHeight: 168, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.68)', fontWeight: 700, marginBottom: 8 }}>MARKETING CHANGE TRACKER</div>
              <h2 style={{ margin: 0, fontSize: 28, lineHeight: 1.12, letterSpacing: 0 }}>Marketing Radar</h2>
              <p style={{ margin: '10px 0 0', maxWidth: 640, color: 'rgba(255,255,255,0.76)', fontSize: 13, lineHeight: 1.7 }}>
                จดเหตุการณ์สั้น ๆ เช่น ส่งให้บอสแล้ว รูปขึ้นร้านแล้ว หรือลงคลิป แล้วให้ระบบเทียบยอดขายก่อน/หลัง 7 วันและ 30 วันให้อัตโนมัติ
              </p>
            </div>
            <button onClick={load} disabled={saving} title="Sync sales" style={iconButton('#fff', 'rgba(255,255,255,0.14)')}>
              <RefreshCw size={17} className={saving ? 'payi-spin' : ''} />
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, marginTop: 24 }}>
            <Metric label="Waiting" value={radar.waiting?.length || 0} />
            <Metric label="Live" value={radar.live?.length || 0} />
            <Metric label="Due to check" value={(radar.check7?.length || 0) + (radar.check30?.length || 0)} />
            <Metric label="To push" value={radar.content?.length || 0} />
          </div>
        </section>

        <section className="payi-glass-card" style={{ padding: 18, borderRadius: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Sparkles size={17} color="var(--payi-mint)" />
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--payi-text-strong)' }}>Content &amp; Sales Lens</div>
          </div>
          <Lens event={events[0]} />
        </section>
      </div>

      {error && (
        <div style={{ padding: '10px 12px', background: 'var(--payi-danger-bg)', color: 'var(--payi-danger)', border: '1px solid var(--payi-danger)', borderRadius: 8, fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 16, alignItems: 'start' }}>
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(160px, 1fr))', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
          {COLUMNS.map((column) => (
            <RadarColumn
              key={column.id}
              column={column}
              items={radar[column.id] || []}
              onDropStatus={onDropStatus}
              updateEvent={updateEvent}
              onEdit={startEdit}
              onDelete={deleteEvent}
            />
          ))}
        </section>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="payi-glass-card" style={{ padding: 14, borderRadius: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 2 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--payi-text-strong)' }}>Products to Push</div>
              <Film size={16} color="var(--payi-text-muted)" />
            </div>
            {signalWindow && (
              <div style={{ fontSize: 10.5, color: 'var(--payi-text-muted)', marginBottom: 10 }}>
                Last 7 data days · {signalWindow.start} – {signalWindow.end}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--payi-border)', background: 'var(--payi-surface)', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>
              <Search size={15} color="var(--payi-text-muted)" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหา SKU / สินค้า" style={{ minWidth: 0, flex: 1, border: 0, outline: 0, background: 'transparent', fontSize: 13 }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 520, overflowY: 'auto' }}>
              {filteredSignals.slice(0, 12).map((item) => (
                <SignalItem key={item.product_key} item={item} onTrack={() => setDraft({
                  product_key: item.product_key,
                  master_sku: item.master_sku,
                  display_name: item.display_name,
                  business: 'all',
                  platform: 'all',
                  event_type: 'content_push',
                  event_date: todayIso(),
                  status: 'live',
                  confirmed_at: todayIso(),
                })} />
              ))}
              {!filteredSignals.length && <EmptyLine text="ยังไม่มีสัญญาณสินค้า รอข้อมูลยอดขายหลังนำเข้าออเดอร์" />}
            </div>
          </div>

          <div className="payi-glass-card" style={{ padding: 14, borderRadius: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--payi-text-strong)' }}>
                Quick Capture{draft?.event_id && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--payi-warning)' }}> · กำลังแก้ไข</span>}
              </div>
              {draft?.event_id && (
                <button onClick={() => setDraft(null)} title="ยกเลิกแก้ไข" style={cardIconBtn}><X size={13} /> ยกเลิก</button>
              )}
            </div>
            <QuickCapture draft={draft} setDraft={setDraft} onSave={saveEvent} saving={saving} productOptions={data?.productOptions || []} />
          </div>
        </aside>
      </div>

      <section className="payi-glass-card" style={{ padding: 16, borderRadius: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--payi-text-strong)', marginBottom: 12 }}>Event History</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {events.slice(0, 30).map((event) => <TimelineRow key={event.event_id} event={event} onEdit={startEdit} onDelete={deleteEvent} />)}
          {!events.length && <EmptyLine text="ยังไม่มีเหตุการณ์การตลาด เริ่มจากจดสินค้าใหม่ แก้รูป หรือลงคลิปได้เลย" />}
        </div>
      </section>
    </div>
  )
}

function RadarColumn({ column, items, onDropStatus, updateEvent, onEdit, onDelete }) {
  const Icon = column.icon
  return (
    <div
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => onDropStatus(column.id, event)}
      style={{ minWidth: 170, background: 'rgba(255,255,255,0.55)', border: '1px solid var(--payi-border)', borderRadius: 8, padding: 10, minHeight: 360 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Icon size={15} color={column.tone} />
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--payi-text-strong)' }}>{column.title}</div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 800, color: column.tone, background: 'var(--payi-surface)', border: '1px solid var(--payi-border)', borderRadius: 6, padding: '2px 6px' }}>{items.length}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((event) => <EventCard key={event.event_id} event={event} updateEvent={updateEvent} onEdit={onEdit} onDelete={onDelete} />)}
        {!items.length && <EmptyLine text="Drop cards here" compact />}
      </div>
    </div>
  )
}

function EventCard({ event, updateEvent, onEdit, onDelete }) {
  const lift = event.snapshot?.lift7
  return (
    <article
      draggable
      onDragStart={(dragEvent) => dragEvent.dataTransfer.setData('event_id', event.event_id)}
      style={{ background: 'var(--payi-surface)', border: '1px solid var(--payi-border)', borderRadius: 8, padding: 10, boxShadow: '0 8px 22px rgba(15,23,42,0.05)', cursor: 'grab' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--payi-text-strong)', lineHeight: 1.35 }}>{event.display_name || event.master_sku || event.product_key}</div>
          <div style={{ fontSize: 10, color: 'var(--payi-text-muted)', marginTop: 3, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis' }}>{event.master_sku || event.product_key}</div>
        </div>
        <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--payi-mint-strong)', background: 'var(--payi-mint-soft)', borderRadius: 6, padding: '2px 6px', whiteSpace: 'nowrap' }}>{event.event_label}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 10 }}>
        <Tiny label="Before 7d" value={fmtBaht(event.snapshot?.before7?.revenue)} />
        <Tiny label="After 7d" value={fmtBaht(event.snapshot?.after7?.revenue)} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 9 }}>
        <span style={{ fontSize: 11, color: lift == null ? 'var(--payi-text-muted)' : lift >= 0 ? 'var(--payi-success)' : 'var(--payi-danger)', fontWeight: 800 }}>
          {lift == null ? 'ยังไม่มีฐานเทียบ' : `${lift >= 0 ? '+' : ''}${lift}%`}
        </span>
        {!event.confirmed_at ? (
          <button onClick={() => updateEvent(event.event_id, { status: 'live', confirmed_at: todayIso() })} title="ยืนยันว่าขึ้นร้านแล้ว" style={smallActionStyle}>
            <CheckCircle2 size={13} /> ขึ้นแล้ว
          </button>
        ) : (
          <span style={{ fontSize: 10, color: 'var(--payi-text-faint)' }}>ขึ้นแล้ว {event.snapshot?.daysLive ?? 0} วัน</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 9, paddingTop: 8, borderTop: '1px solid var(--payi-border)' }}>
        <button onClick={() => onEdit(event)} title="แก้ไข" style={cardIconBtn}><Pencil size={12} /></button>
        {event.status !== 'done' && (
          <button onClick={() => updateEvent(event.event_id, { status: 'done' })} title="ทำเสร็จ (เอาออกจากบอร์ด)" style={cardIconBtn}><CheckCircle2 size={12} /> เสร็จ</button>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={() => onDelete(event.event_id)} title="ลบ" style={{ ...cardIconBtn, color: 'var(--payi-danger)' }}><Trash2 size={12} /></button>
      </div>
    </article>
  )
}

function SignalItem({ item, onTrack }) {
  const lift = item.lift7
  return (
    <div style={{ border: '1px solid var(--payi-border)', background: 'var(--payi-surface)', borderRadius: 8, padding: 10 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--payi-text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.display_name}</div>
          <div style={{ fontSize: 10, color: 'var(--payi-text-muted)', fontFamily: 'monospace' }}>{item.master_sku || item.product_key}</div>
        </div>
        <button onClick={onTrack} title="จดเป็นงานดันคอนเทนต์" style={iconButton('var(--payi-mint-strong)', 'var(--payi-mint-soft)')}>
          <Send size={14} />
        </button>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, fontSize: 11 }}>
        <span style={{ color: 'var(--payi-text-muted)' }}>{fmtBaht(item.revenue7)} ใน 7 วัน</span>
        <span style={{ color: lift == null ? 'var(--payi-text-faint)' : lift >= 0 ? 'var(--payi-success)' : 'var(--payi-danger)', fontWeight: 800 }}>{lift == null ? 'ใหม่' : `${lift >= 0 ? '+' : ''}${lift}%`}</span>
      </div>
    </div>
  )
}

function QuickCapture({ draft, setDraft, onSave, saving, productOptions = [] }) {
  const [productOpen, setProductOpen] = useState(false)
  const isEditing = Boolean(draft?.event_id)
  const value = draft || {
    product_key: '',
    master_sku: '',
    display_name: '',
    business: 'all',
    platform: 'all',
    event_type: 'image_change',
    event_date: todayIso(),
    status: 'waiting',
    confirmed_at: '',
    note: '',
  }
  const set = (patch) => setDraft({ ...value, ...patch })
  const productValue = value.master_sku || value.display_name || value.product_key
  const productQuery = productValue.trim().toLowerCase()
  const productChoices = productOptions
    .filter((item) => item.product_key || item.master_sku || item.display_name)
    .filter((item) => {
      if (!productQuery) return true
      return [item.display_name, item.master_sku, item.product_key]
        .some((part) => String(part || '').toLowerCase().includes(productQuery))
    })
    .slice(0, 80)
  const pickProduct = (picked) => {
    set({
      display_name: picked.display_name || picked.master_sku || picked.product_key,
      master_sku: picked.master_sku || '',
      product_key: picked.product_key || picked.master_sku || picked.display_name,
    })
    setProductOpen(false)
  }
  const setProduct = (raw) => {
    set({
      display_name: raw,
      master_sku: raw,
      product_key: raw,
    })
    setProductOpen(true)
  }
  const platformOptions = value.business === 'Payi' ? [...PLATFORMS, 'Payi Outlet'] : PLATFORMS
  const canSave = value.product_key || value.master_sku

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ position: 'relative' }}>
        <input
          value={productValue}
          onChange={(e) => setProduct(e.target.value)}
          onFocus={() => !isEditing && setProductOpen(true)}
          onBlur={() => window.setTimeout(() => setProductOpen(false), 140)}
          placeholder="สินค้า / SKU"
          readOnly={isEditing}
          title={isEditing ? 'แก้ไขสินค้าไม่ได้ (ลบแล้วสร้างใหม่ถ้าต้องเปลี่ยน)' : undefined}
          style={{ ...inputStyle, ...(isEditing ? { background: 'var(--payi-surface-muted)', color: 'var(--payi-text-muted)' } : null) }}
        />
        {productOpen && !isEditing && (
          <div style={dropdownStyle}>
            {productChoices.slice(0, 8).map((item) => (
              <button key={item.product_key || item.master_sku || item.display_name} type="button" onMouseDown={() => pickProduct(item)} style={dropdownItemStyle}>
                <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--payi-text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.display_name || item.master_sku || item.product_key}</span>
                <span style={{ fontSize: 10, color: 'var(--payi-text-muted)', fontFamily: 'monospace' }}>
                  {item.skuCount ? `รวม ${item.skuCount} SKU` : (item.master_sku || item.product_key)}
                </span>
              </button>
            ))}
            {!productChoices.length && (
              <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--payi-text-muted)' }}>
                ไม่พบสินค้าเดิม กดบันทึกเพื่อใช้เป็นสินค้าใหม่ได้
              </div>
            )}
          </div>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <select value={value.event_type} onChange={(e) => set({ event_type: e.target.value })} style={inputStyle}>
          {EVENT_TYPES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <input type="date" value={value.event_date} onChange={(e) => set({ event_date: e.target.value })} style={inputStyle} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <select
          value={value.business}
          onChange={(e) => set({
            business: e.target.value,
            platform: e.target.value === 'Payi' ? value.platform : (value.platform === 'Payi Outlet' ? 'all' : value.platform),
          })}
          style={inputStyle}
        >
          {BUSINESSES.map((item) => <option key={item} value={item}>{optionLabel(item)}</option>)}
        </select>
        <select value={value.platform} onChange={(e) => set({ platform: e.target.value })} style={inputStyle}>
          {platformOptions.map((item) => <option key={item} value={item}>{optionLabel(item)}</option>)}
        </select>
      </div>
      <textarea value={value.note} onChange={(e) => set({ note: e.target.value })} placeholder="โน้ตสั้น ๆ" rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
      <button disabled={!canSave || saving} onClick={() => onSave(value)} style={{ ...primaryBtnStyle, opacity: !canSave || saving ? 0.55 : 1 }}>
        {saving ? <Loader2 size={15} className="payi-spin" /> : <PackagePlus size={15} />} {isEditing ? 'อัปเดตเหตุการณ์' : 'บันทึกเหตุการณ์'}
      </button>
    </div>
  )
}

function Lens({ event }) {
  const lens = event?.lens
  const rows = lens ? [
    ['Strategy', lens.strategy],
    ['Audience', lens.audience],
    ['Sales', lens.conversion],
    ['Process', lens.process],
    ['Next', lens.nextMove],
  ] : [
    ['Strategy', 'เริ่มจากจดเหตุการณ์สั้น ๆ'],
    ['Audience', 'สัญญาณจะขึ้นหลังดึงยอดขาย'],
    ['Sales', 'ระบบเทียบก่อน/หลังให้อัตโนมัติ'],
    ['Process', 'กดยืนยันเมื่อร้านเปลี่ยนขึ้นจริง'],
    ['Next', 'ลองติดตามรูปสินค้า หรือสินค้าใหม่ 1 ตัว'],
  ]
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {rows.map(([label, text]) => (
        <div key={label} style={{ display: 'grid', gridTemplateColumns: '88px minmax(0, 1fr)', gap: 8, fontSize: 12, lineHeight: 1.45 }}>
          <span style={{ fontWeight: 800, color: 'var(--payi-mint-strong)' }}>{label}</span>
          <span style={{ color: 'var(--payi-text)' }}>{text}</span>
        </div>
      ))}
    </div>
  )
}

function TimelineRow({ event, onEdit, onDelete }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '110px minmax(0, 1fr) 110px 80px 78px', gap: 10, alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--payi-border)', fontSize: 12 }}>
      <div style={{ color: 'var(--payi-text-muted)', fontWeight: 700 }}>{event.event_date}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 800, color: 'var(--payi-text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.display_name || event.master_sku || event.product_key}</div>
        <div style={{ color: 'var(--payi-text-muted)', fontFamily: 'monospace', fontSize: 10 }}>{event.event_label} · {optionLabel(event.platform || 'all')}{event.status === 'done' ? ' · เสร็จ' : ''}</div>
      </div>
      <div style={{ color: 'var(--payi-text)' }}>{event.confirmed_at || 'ยังไม่ยืนยัน'}</div>
      <div style={{ textAlign: 'right', fontWeight: 800, color: (event.snapshot?.lift7 ?? 0) >= 0 ? 'var(--payi-success)' : 'var(--payi-danger)' }}>
        {event.snapshot?.lift7 == null ? '-' : `${event.snapshot.lift7 >= 0 ? '+' : ''}${event.snapshot.lift7}%`}
      </div>
      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
        <button onClick={() => onEdit(event)} title="แก้ไข" style={cardIconBtn}><Pencil size={12} /></button>
        <button onClick={() => onDelete(event.event_id)} title="ลบ" style={{ ...cardIconBtn, color: 'var(--payi-danger)' }}><Trash2 size={12} /></button>
      </div>
    </div>
  )
}

function Metric({ label, value }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 8, padding: 10 }}>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.64)', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, marginTop: 2 }}>{value}</div>
    </div>
  )
}

function Tiny({ label, value }) {
  return (
    <div style={{ border: '1px solid var(--payi-border)', background: 'var(--payi-surface-muted)', borderRadius: 8, padding: 7 }}>
      <div style={{ fontSize: 9, color: 'var(--payi-text-muted)', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 12, color: 'var(--payi-text-strong)', fontWeight: 900, marginTop: 2 }}>{value}</div>
    </div>
  )
}

function EmptyLine({ text, compact }) {
  return <div style={{ padding: compact ? 10 : 14, fontSize: 12, color: 'var(--payi-text-faint)', textAlign: 'center', border: '1px dashed var(--payi-border)', borderRadius: 8 }}>{text}</div>
}

function Center({ children }) {
  return <div style={{ height: '52vh', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--payi-text-muted)', fontSize: 14 }}>{children}</div>
}

function optionLabel(value) {
  if (value === 'all') return 'ทั้งหมด'
  if (value === 'Payi Outlet') return 'Outlet'
  return value
}

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  border: '1px solid var(--payi-border)',
  background: 'var(--payi-surface)',
  borderRadius: 8,
  padding: '9px 10px',
  fontSize: 12,
  color: 'var(--payi-text-strong)',
  outline: 'none',
}

const dropdownStyle = {
  position: 'absolute',
  zIndex: 30,
  left: 0,
  right: 0,
  top: 'calc(100% + 4px)',
  maxHeight: 260,
  overflowY: 'auto',
  background: 'var(--payi-surface)',
  border: '1px solid var(--payi-border)',
  borderRadius: 8,
  boxShadow: '0 18px 42px rgba(15,23,42,0.12)',
}

const dropdownItemStyle = {
  width: '100%',
  border: 'none',
  borderBottom: '1px solid var(--payi-border)',
  background: 'transparent',
  padding: '9px 11px',
  display: 'grid',
  gap: 2,
  textAlign: 'left',
  cursor: 'pointer',
}

const primaryBtnStyle = {
  border: 'none',
  borderRadius: 8,
  background: 'var(--payi-mint)',
  color: '#fff',
  padding: '10px 12px',
  fontSize: 12,
  fontWeight: 800,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
}

const smallActionStyle = {
  border: '1px solid var(--payi-border)',
  background: 'var(--payi-mint-soft)',
  color: 'var(--payi-mint-strong)',
  borderRadius: 7,
  padding: '4px 7px',
  fontSize: 10,
  fontWeight: 800,
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  cursor: 'pointer',
}

const cardIconBtn = {
  border: '1px solid var(--payi-border)',
  background: 'var(--payi-surface)',
  color: 'var(--payi-text-muted)',
  borderRadius: 7,
  padding: '4px 7px',
  fontSize: 10,
  fontWeight: 800,
  display: 'flex',
  alignItems: 'center',
  gap: 3,
  cursor: 'pointer',
}

function iconButton(color, background) {
  return {
    width: 32,
    height: 32,
    border: '1px solid var(--payi-border)',
    borderRadius: 8,
    color,
    background,
    display: 'grid',
    placeItems: 'center',
    cursor: 'pointer',
    flexShrink: 0,
  }
}
