import { useEffect, useState, useCallback } from 'react'
import { UploadCloud, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2, RefreshCw, Trash2, X } from 'lucide-react'
import * as XLSX from 'xlsx'

const API = '/api'
const fmt = (n) => Number(n || 0).toLocaleString('th-TH')

// ต้องตรงกับ candidate keys ใน pick() ของ api/import-orders.js —
// ใช้กรองเหลือเฉพาะคอลัมน์ที่ backend อ่านจริง ก่อนส่งขึ้น API เพื่อลดขนาด payload
// (ไฟล์ export ดิบมีคอลัมน์เยอะมาก เช่น Shopee 75 คอลัมน์/แถว แต่ backend ใช้แค่ ~10)
const RELEVANT_HEADER_HINTS = [
  'order_id', 'order id', 'orderid', 'ordernumber', 'เลขที่คำสั่งซื้อ', 'หมายเลขคำสั่งซื้อ',
  'order_item_id', 'order item id', 'item id', 'orderitemid',
  'date', 'วันที่', 'order creation', 'created time', 'createtime', 'เวลาการชำระ', 'วันเวลาที่ทำการสั่งซื้อ',
  'business', 'ธุรกิจ', 'แบรนด์', 'brand',
  'sku_platform', 'seller sku', 'sku reference', 'เลขอ้างอิง sku', 'sku',
  'product_name', 'ชื่อสินค้า', 'product name', 'สินค้า', 'itemname',
  'variation_name', 'variation', 'ชื่อตัวเลือก', 'ตัวเลือกสินค้า', 'ประเภทสินค้า',
  'qty', 'quantity', 'จำนวน', 'amount',
  'revenue', 'ยอดขาย', 'total', 'ราคาขายสุทธิ', 'grand total', 'ยอดรวม', 'paidprice',
  'order_status', 'status', 'สถานะ', 'order status',
]
const normalizeHeader = (s) => String(s || '').trim().toLowerCase()

function slimRow(row) {
  const out = {}
  for (const [k, v] of Object.entries(row)) {
    const nk = normalizeHeader(k)
    if (RELEVANT_HEADER_HINTS.some((h) => nk === h || nk.includes(h))) out[k] = v
  }
  return out
}

// ส่งเป็น batch โดยเผื่อพื้นที่จาก payload limit ของ serverless function (~4.5MB)
// ไฟล์ Shopee บางชุดยังมีขนาดราว 4.7MB ที่ 3,000 แถว แม้กรองคอลัมน์แล้ว
const BATCH_SIZE = 2000

async function readApiResponse(response) {
  const text = await response.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return {
      success: false,
      error: response.status === 413
        ? 'ข้อมูลใน batch มีขนาดใหญ่เกินกว่าที่เซิร์ฟเวอร์รองรับ'
        : `เซิร์ฟเวอร์ตอบกลับผิดรูปแบบ (${response.status}): ${text.slice(0, 200)}`,
    }
  }
}

function MapProductModal({ productName, business, platform, onClose, onMapped }) {
  const [options, setOptions] = useState([])
  const [mode, setMode] = useState('existing') // 'existing' | 'new'
  const [masterSku, setMasterSku] = useState('')
  const [newSku, setNewSku] = useState('')
  const [newName, setNewName] = useState(productName)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`${API}/import-orders?view=mapping-options`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setOptions(d.products || []) })
      .catch(() => {})
  }, [])

  const submit = async () => {
    const sku = mode === 'existing' ? masterSku : newSku.trim()
    if (!sku) { setError('เลือกหรือกรอก master SKU ก่อน'); return }
    setSaving(true); setError('')
    try {
      const r = await fetch(`${API}/import-orders?view=map-product`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productName, masterSku: sku, displayName: mode === 'new' ? newName : undefined, business, platform }),
      })
      const d = await readApiResponse(r)
      if (!r.ok || !d.success) { setError(d.error || 'จับคู่ไม่สำเร็จ'); return }
      onMapped(productName)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={onClose}>
      <div className="payi-glass-card" style={{ width: 420, maxWidth: '92vw', padding: 22 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--payi-text-strong)' }}>จับคู่สินค้า</div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--payi-text-muted)' }}><X size={16} /></button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--payi-text-muted)', marginBottom: 16 }}>"{productName}"</div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {[['existing', 'สินค้าที่มีอยู่แล้ว'], ['new', 'สร้างสินค้าใหม่']].map(([m, label]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                flex: 1, padding: '7px 10px', fontSize: 12, fontWeight: 600, borderRadius: 8, cursor: 'pointer',
                border: mode === m ? '1px solid var(--payi-mint-strong)' : '1px solid var(--payi-border)',
                background: mode === m ? 'var(--payi-mint-strong)' : 'transparent',
                color: mode === m ? '#fff' : 'var(--payi-text)',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === 'existing' ? (
          <select className="payi-select" value={masterSku} onChange={(e) => setMasterSku(e.target.value)} style={{ width: '100%', padding: '8px 12px', fontSize: 13 }}>
            <option value="">-- เลือกสินค้า --</option>
            {options.map((o) => <option key={o.master_sku} value={o.master_sku}>{o.display_name} ({o.master_sku})</option>)}
          </select>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input className="payi-input" placeholder="master SKU ใหม่" value={newSku} onChange={(e) => setNewSku(e.target.value)} style={{ padding: '8px 12px', fontSize: 13 }} />
            <input className="payi-input" placeholder="ชื่อสินค้าที่แสดง" value={newName} onChange={(e) => setNewName(e.target.value)} style={{ padding: '8px 12px', fontSize: 13 }} />
          </div>
        )}

        {error && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--payi-danger)' }}>{error}</div>}

        <button onClick={submit} disabled={saving} className="payi-btn-primary" style={{ marginTop: 16, width: '100%', padding: '10px', fontSize: 13, fontWeight: 700, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}>
          {saving ? <><Loader2 size={14} className="payi-spin" /> กำลังบันทึก...</> : 'จับคู่'}
        </button>
      </div>
    </div>
  )
}

export default function Upload() {
  const [file, setFile] = useState(null)
  const [rows, setRows] = useState([])
  const [headers, setHeaders] = useState([])
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)
  const [platform, setPlatform] = useState('auto')
  const [business, setBusiness] = useState('')
  const [log, setLog] = useState([])
  const [deletingId, setDeletingId] = useState('')
  const [mapTarget, setMapTarget] = useState(null)

  const loadLog = useCallback(async () => {
    try {
      const r = await fetch(`${API}/import-orders?view=log`)
      const d = await r.json()
      if (d.success) setLog(d.imports || [])
    } catch { /* ignore */ }
  }, [])
  useEffect(() => { loadLog() }, [loadLog])

  const handleDeleteImport = async (im) => {
    if (!im.importId) return
    if (!window.confirm(`ยืนยันลบล็อตไฟล์ "${im.file}" (${fmt(im.rows)} แถว) ออกจากข้อมูลจริง?`)) return
    setDeletingId(im.importId)
    try {
      const r = await fetch(`${API}/import-orders?importId=${encodeURIComponent(im.importId)}`, { method: 'DELETE' })
      const d = await readApiResponse(r)
      if (!r.ok || !d.success) { alert(d.error || 'ลบไม่สำเร็จ'); return }
      loadLog()
    } catch (e) {
      alert(e.message)
    } finally {
      setDeletingId('')
    }
  }

  const handleFile = async (f) => {
    if (!f) return
    setFile(f); setResult(null); setParsing(true)
    try {
      const buf = await f.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const json = XLSX.utils.sheet_to_json(ws, { defval: '' })
      setRows(json)
      setHeaders(json.length ? Object.keys(json[0]) : [])
    } catch (e) {
      setResult({ success: false, error: 'อ่านไฟล์ไม่สำเร็จ: ' + e.message })
    } finally {
      setParsing(false)
    }
  }

  const doImport = async () => {
    if (!rows.length) return
    setImporting(true); setResult(null)
    try {
      const slim = rows.map(slimRow)
      const batches = []
      for (let i = 0; i < slim.length; i += BATCH_SIZE) batches.push(slim.slice(i, i + BATCH_SIZE))

      let imported = 0, mapped = 0, skipped = 0, skippedInvalid = 0
      const tabs = new Set()
      const unmappedSamples = []
      for (let i = 0; i < batches.length; i++) {
        setResult({ success: true, inProgress: true, note: `กำลังนำเข้า batch ${i + 1}/${batches.length}...` })
        const r = await fetch(`${API}/import-orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file?.name || 'upload.xlsx', platform, business, rows: batches[i] }),
        })
        const d = await readApiResponse(r)
        if (!r.ok || !d.success) {
          setResult({ success: false, error: d.error || `นำเข้าข้อมูลไม่สำเร็จ (${r.status})` })
          setImporting(false)
          return
        }
        imported += d.imported || 0
        mapped += d.mapped || 0
        skipped += d.skipped || 0
        skippedInvalid += d.skippedInvalid || 0
        for (const t of d.tabs || []) tabs.add(t)
        for (const name of (d.unmappedSamples || [])) if (unmappedSamples.length < 20 && !unmappedSamples.includes(name)) unmappedSamples.push(name)
      }

      setResult({ success: true, imported, mapped, skipped, skippedInvalid, unmappedSamples, tabs: [...tabs] })
      setFile(null); setRows([]); setHeaders([]); loadLog()
    } catch (e) {
      setResult({ success: false, error: e.message })
    } finally {
      setImporting(false)
    }
  }

  return (
    <div style={{ width: '100%', maxWidth: 900 }}>
      {/* Dropzone */}
      <label
        className="payi-glass-card"
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '40px 20px', border: '2px dashed var(--payi-line)', cursor: 'pointer', marginBottom: 20 }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0]) }}
      >
        <UploadCloud size={38} style={{ color: 'var(--payi-mint-strong)' }} />
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--payi-text-strong)' }}>ลากไฟล์มาวาง หรือคลิกเพื่อเลือก</div>
        <div style={{ fontSize: 12, color: 'var(--payi-text-muted)' }}>รองรับไฟล์ .xlsx / .xls จาก Shopee, TikTok Shop, Lazada</div>
        <input type="file" accept=".xlsx,.xls" onChange={(e) => handleFile(e.target.files?.[0])} style={{ display: 'none' }} />
      </label>

      {parsing && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--payi-text-muted)', fontSize: 13, marginBottom: 16 }}>
          <Loader2 size={16} className="payi-spin" /> กำลังอ่านไฟล์...
        </div>
      )}

      {/* Preview + confirm */}
      {rows.length > 0 && !parsing && (
        <div className="payi-glass-card" style={{ padding: 20, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <FileSpreadsheet size={18} style={{ color: 'var(--payi-mint-strong)' }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--payi-text-strong)' }}>{file?.name}</span>
            <span style={{ fontSize: 12, color: 'var(--payi-text-muted)' }}>· {fmt(rows.length)} แถว · {headers.length} คอลัมน์</span>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--payi-text-muted)', marginBottom: 4 }}>แพลตฟอร์ม</div>
              <select className="payi-select" value={platform} onChange={(e) => setPlatform(e.target.value)} style={{ padding: '8px 12px', fontSize: 13 }}>
                <option value="auto">ตรวจอัตโนมัติ</option>
                <option value="Shopee">Shopee</option>
                <option value="TikTok Shop">TikTok Shop</option>
                <option value="Lazada">Lazada</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--payi-text-muted)', marginBottom: 4 }}>ธุรกิจ/แบรนด์ (ถ้ามีในไฟล์ไม่ต้องกรอก)</div>
              <input className="payi-input" value={business} onChange={(e) => setBusiness(e.target.value)} placeholder="เช่น Payi" style={{ padding: '8px 12px', fontSize: 13 }} />
            </div>
          </div>

          {/* ตัวอย่างคอลัมน์ */}
          <div style={{ overflowX: 'auto', border: '1px solid var(--payi-border)', borderRadius: 10, marginBottom: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: 'var(--payi-surface-muted)' }}>
                  {headers.slice(0, 8).map((h) => <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--payi-text-muted)', whiteSpace: 'nowrap', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 3).map((r, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--payi-border)' }}>
                    {headers.slice(0, 8).map((h) => <td key={h} style={{ padding: '7px 10px', color: 'var(--payi-text)', whiteSpace: 'nowrap', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>{String(r[h])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button onClick={doImport} disabled={importing} className="payi-btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 22px', fontSize: 14, fontWeight: 700, cursor: importing ? 'default' : 'pointer', opacity: importing ? 0.7 : 1 }}>
            {importing ? <><Loader2 size={16} className="payi-spin" /> กำลังนำเข้า...</> : <><CheckCircle2 size={16} /> นำเข้าข้อมูลเข้า Google Sheets</>}
          </button>
        </div>
      )}

      {/* Result */}
      {result && (
        <div style={{ background: result.success ? 'var(--payi-success-bg)' : 'var(--payi-danger-bg)', border: `1px solid ${result.success ? '#bbf7d0' : '#fecaca'}`, borderRadius: 12, padding: '14px 18px', marginBottom: 20, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          {result.success ? <CheckCircle2 size={18} style={{ color: 'var(--payi-success)', flexShrink: 0, marginTop: 1 }} /> : <AlertTriangle size={18} style={{ color: 'var(--payi-danger)', flexShrink: 0, marginTop: 1 }} />}
          <div style={{ fontSize: 13, color: result.success ? '#15803d' : 'var(--payi-danger)' }}>
            {result.inProgress
              ? result.note
              : result.success
                ? `นำเข้าสำเร็จ ${fmt(result.imported)} แถว · จับคู่ SKU ได้ ${fmt(result.mapped)} · ข้ามซ้ำ ${fmt(result.skipped - (result.skippedInvalid || 0))}${result.skippedInvalid ? ` · ข้อมูลไม่ครบ ${fmt(result.skippedInvalid)}` : ''}`
                : `ผิดพลาด: ${result.error}`}
            {result.success && !result.inProgress && result.unmappedSamples?.length > 0 && (
              <div style={{ marginTop: 8, color: '#92400e' }}>
                สินค้าที่ยังไม่จับคู่ SKU:
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {result.unmappedSamples.map((name) => (
                    <span key={name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px', border: '1px solid #fde68a', borderRadius: 8, background: '#fffbeb', fontSize: 12 }}>
                      {name}
                      <button onClick={() => setMapTarget(name)} style={{ border: 'none', background: '#fef3c7', color: '#92400e', borderRadius: 6, padding: '2px 7px', fontWeight: 700, cursor: 'pointer', fontSize: 11 }}>+ Map</button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recent imports */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--payi-text-strong)' }}>ประวัติการนำเข้าล่าสุด</div>
        <button onClick={loadLog} style={{ display: 'flex', alignItems: 'center', gap: 5, border: 'none', background: 'transparent', color: 'var(--payi-text-muted)', fontSize: 12, cursor: 'pointer' }}><RefreshCw size={13} /> รีเฟรช</button>
      </div>
      <div className="payi-glass-card" style={{ padding: 4 }}>
        {log.length === 0 ? (
          <div style={{ padding: 16, fontSize: 12, color: 'var(--payi-text-faint)', textAlign: 'center' }}>ยังไม่มีประวัติการนำเข้า</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <tbody>
              {log.map((im, i) => (
                <tr key={i} style={{ borderBottom: i < log.length - 1 ? '1px solid var(--payi-border)' : 'none' }}>
                  <td style={{ padding: '10px 14px', color: 'var(--payi-text-strong)', fontWeight: 600 }}>{im.platform} · {im.business}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--payi-text-muted)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{im.file}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--payi-text)', whiteSpace: 'nowrap' }}>{fmt(im.rows)} แถว</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--payi-text-faint)', whiteSpace: 'nowrap' }}>{im.at ? String(im.at).slice(0, 10) : ''}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {im.importId && (
                      <button
                        onClick={() => handleDeleteImport(im)}
                        disabled={deletingId === im.importId}
                        title="ลบล็อตไฟล์นี้"
                        style={{ display: 'inline-flex', alignItems: 'center', border: 'none', background: 'transparent', color: 'var(--payi-danger)', cursor: deletingId === im.importId ? 'default' : 'pointer', opacity: deletingId === im.importId ? 0.5 : 1, padding: 4 }}
                      >
                        {deletingId === im.importId ? <Loader2 size={14} className="payi-spin" /> : <Trash2 size={14} />}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {mapTarget && (
        <MapProductModal
          productName={mapTarget}
          business={business}
          platform={platform === 'auto' ? '' : platform}
          onClose={() => setMapTarget(null)}
          onMapped={(name) => {
            setResult((r) => r ? { ...r, unmappedSamples: (r.unmappedSamples || []).filter((n) => n !== name) } : r)
            setMapTarget(null)
          }}
        />
      )}
    </div>
  )
}
