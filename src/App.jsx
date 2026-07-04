import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import payiLogo from './assets/payi-logo.png'
import { 
  Bell, Search, UserCircle2, DollarSign, ShoppingBag, TrendingUp, BarChart3,
  AlertTriangle, AlertCircle, ArrowRight, X, Sparkles, TrendingDown, Loader2
} from 'lucide-react'
import KpiCard from './components/KpiCard'
import Upload from './pages/Upload'
import LinksHub from './pages/LinksHub'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell
} from 'recharts'
import PackingView from './pages/PackingView'
import DevHub from './pages/DevHub'
import ClaimView from './pages/ClaimView'
import SalesView from './pages/SalesView'
import MonthlyDashboard from './pages/MonthlyDashboard'
import ProductDashboard from './pages/ProductDashboard'
import ProductTrends from './pages/ProductTrends'
import MarketingRadar from './pages/MarketingRadar'

const API_BASE = '/api'

const fmt = n => Number(n).toLocaleString('th-TH', { maximumFractionDigits: 0 })

// ─── CSV export helper ──────────────────────────────────────────────────
function exportToCsv(filename, rows) {
  if (!rows || rows.length === 0) return
  const headers = Object.keys(rows[0])
  const escapeCell = (val) => {
    const str = String(val ?? '')
    if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`
    return str
  }
  const lines = [
    headers.join(','),
    ...rows.map(row => headers.map(h => escapeCell(row[h])).join(','))
  ]
  const csvContent = '\uFEFF' + lines.join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

const PLATFORM_COLORS = { 'Shopee': '#E05D45', 'TikTok Shop': '#2D2D2D', 'Lazada': '#0F146D' }

// ============================================================
// CRISP SVG ICONS (MATCHING THE SCREENSHOT)
// ============================================================
const Icons = {
  Executive: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" />
      <rect x="14" y="3" width="7" height="5" />
      <rect x="14" y="12" width="7" height="9" />
      <rect x="3" y="16" width="7" height="5" />
    </svg>
  ),
  ImportOrders: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  ),
  Inventory: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  ),
  StockMovement: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 11 21 7 17 3" />
      <line x1="21" y1="7" x2="9" y2="7" />
      <polyline points="7 21 3 17 7 13" />
      <line x1="3" y1="17" x2="15" y2="17" />
    </svg>
  ),
  Tasks: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  ),
  SOPs: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  ),
  LinksHub: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  ),
  DevHub: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  ),
  AIAssistant: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  ),
  Settings: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

const menuGroups = [
  {
    title: 'ภาพรวม',
    items: [
      { id: 'Executive', label: 'ภาพรวมผู้บริหาร', renderIcon: Icons.Executive },
      { id: 'Monthly', label: 'สรุปรายเดือน', renderIcon: Icons.Executive },
      { id: 'Products', label: 'Dashboard สินค้า', renderIcon: Icons.Inventory },
      { id: 'ProductTrends', label: '% เปลี่ยนแปลงสินค้า', renderIcon: Icons.StockMovement }
    ]
  },
  {
    title: 'ยอดขาย',
    items: [
      { id: 'Import Orders', label: 'นำเข้าออเดอร์', renderIcon: Icons.ImportOrders, dotColor: 'var(--payi-success)' },
      { id: 'Sales', label: 'ยอดขายนอกแพลตฟอร์ม', renderIcon: Icons.Executive }
    ]
  },
  {
    title: 'การตลาด',
    items: [
      { id: 'MarketingRadar', label: 'เรดาร์การตลาด', renderIcon: Icons.StockMovement, dotColor: 'var(--payi-warning)' }
    ]
  },
  {
    title: 'คลังสินค้า',
    items: [
      { id: 'Inventory', label: 'สต็อกสินค้า', renderIcon: Icons.Inventory, dotColor: 'var(--payi-danger)' },
      { id: 'Stock Movement', label: 'ความเคลื่อนไหวสต็อก', renderIcon: Icons.StockMovement }
    ]
  },
  {
    title: 'งานปฏิบัติการ',
    items: [
      { id: 'Tasks', label: 'งานค้าง', renderIcon: Icons.Tasks, dotColor: 'var(--payi-warning)' },
      { id: 'Packing', label: 'แพ็กสินค้า', renderIcon: Icons.Tasks },
      { id: 'Claims', label: 'เคลมสินค้า', renderIcon: Icons.Tasks }
    ]
  },
  {
    title: 'เครื่องมือ',
    items: [
      { id: 'SOPs', label: 'คู่มือ SOP', renderIcon: Icons.SOPs },
      { id: 'Links Hub', label: 'ลิงก์สำคัญ', helper: 'บอส / ผู้จัดการ', renderIcon: Icons.LinksHub },
      { id: 'Dev Hub', label: 'มุม Dev', helper: 'ทีมพัฒนา / คนใหม่', renderIcon: Icons.DevHub }
    ]
  },
  {
    title: 'AI',
    items: [
      { id: 'AI Assistant', label: 'PAYI Brain', renderIcon: Icons.AIAssistant },
      { id: 'Settings', label: 'ตั้งค่า', renderIcon: Icons.Settings }
    ]
  }
]

function AlertsSection({ alerts }) {
  if (!alerts || alerts.length === 0) return null;
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--payi-text)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--payi-danger)', display: 'inline-block' }}></span>
        Alert Center · ความผิดปกติที่ต้องจัดการด่วน
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {alerts.map((alert, idx) => {
          const isCritical = alert.type === 'critical';
          const bg = isCritical ? 'var(--payi-danger-bg)' : 'var(--payi-surface)beb';
          const border = isCritical ? 'var(--payi-danger)' : 'var(--payi-warning)';
          const textColor = isCritical ? 'var(--payi-danger)' : 'var(--payi-warning)';
          const badgeBg = isCritical ? 'var(--payi-danger-bg)' : 'var(--payi-warning-bg)';
          const Icon = isCritical ? AlertCircle : AlertTriangle;

          return (
            <div key={idx} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 14, padding: '16px 20px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, boxShadow: '0 4px 12px rgba(15,23,42,0.01)' }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{ marginTop: 2, color: isCritical ? 'var(--payi-danger)' : 'var(--payi-warning)' }}>
                  <Icon size={20} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: badgeBg, color: textColor, letterSpacing: '0.03em' }}>{alert.category || alert.code || 'ALERT'}</span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--payi-text-strong)', marginTop: 6 }}>{alert.message}</div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TrendingCard({ title, items, isUp }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={{ background: 'var(--payi-surface)', border: '1px solid var(--payi-border)', borderRadius: 16, padding: '20px', flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        {isUp ? <TrendingUp size={18} color="var(--payi-success)" /> : <TrendingDown size={18} color="var(--payi-danger)" />}
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--payi-text-strong)' }}>{title}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map((item, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: idx < items.length - 1 ? 12 : 0, borderBottom: idx < items.length - 1 ? '1px solid var(--payi-border)' : 'none' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--payi-text-strong)' }}>{item.display_name || item.master_sku}</div>
              <div style={{ fontSize: 11, color: 'var(--payi-text-muted)', fontFamily: 'monospace' }}>{item.master_sku}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: isUp ? 'var(--payi-success)' : 'var(--payi-danger)' }}>
                {isUp ? '+' : ''}{item.delta?.toLocaleString()}
              </div>
              <div style={{ fontSize: 10, color: 'var(--payi-text-faint)' }}>
                วันนี้: ฿{(item.todayRevenue || 0).toLocaleString()}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function AIAssistantView() {
  const modes = [
    { id: 'executive', name: 'Executive AI', desc: 'สรุปภาพรวมและเรื่องที่ต้องตัดสินใจ' },
    { id: 'sales', name: 'Sales Analyst', desc: 'วิเคราะห์ยอดขาย แบรนด์ ช่องทาง และ SKU' },
    { id: 'ops', name: 'Ops Assistant', desc: 'เช็กงานหลังบ้าน แพ็ก สต็อก และงานค้าง' },
    { id: 'claims', name: 'Claim Detective', desc: 'หาสินค้าที่เคลมบ่อยและมูลค่าเสียหาย' },
    { id: 'marketing', name: 'Marketing Brain', desc: 'ช่วยคิดแคมเปญ คอนเทนต์ และมุมขาย' },
  ]
  const quickPrompts = {
    executive: ['สรุปวันนี้ให้ผู้บริหาร', 'มีอะไรผิดปกติไหม', 'ทำ action list ให้หน่อย'],
    sales: ['แบรนด์ไหนยอดตก', 'SKU ไหนควรดัน', 'สรุปยอดนอกแพลตฟอร์ม'],
    ops: ['งานหลังบ้านเสี่ยงตรงไหน', 'เช็ก stock movement', 'สรุปงานที่ต้องตาม'],
    claims: ['เคลมเดือนนี้เป็นยังไง', 'SKU ไหนควรระวัง', 'สรุปเคลมส่งทีม'],
    marketing: ['คิด hook คลิปสั้น', 'จัดโปรสินค้าไหนดี', 'ร่าง brief ให้ทีมคอนเทนต์'],
  }

  const [activeMode, setActiveMode] = useState('executive')
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([
    { id: 1, role: 'ai', text: 'PAYI Brain พร้อมแล้วค่ะ เลือกโหมดหรือกดคำถามสำเร็จรูปได้เลย เดี๋ยวช่วยสรุปเป็นภาษาคนทำงานให้พร้อม action ต่อทันที' }
  ])

  const mode = modes.find(m => m.id === activeMode) || modes[0]
  const addPrompt = (text) => setInput(text)
  const buildReply = (text) => {
    const lower = text.toLowerCase()
    if (activeMode === 'claims' || text.includes('เคลม')) {
      return 'สรุปมุม Claims: ให้เริ่มจาก SKU ที่มีเคสซ้ำสูงสุด แยกเหตุผลเป็นเสีย/พัง ส่งไม่ครบ และส่งผิด แล้วส่งรายการ Top 10 ให้ทีมคลังตรวจขั้นตอนแพ็กกับ QC ก่อน รอบถัดไปควรดูมูลค่าเสียหายรวมคู่กับจำนวนเคส เพื่อไม่หลงโฟกัสแค่สินค้าที่เคสเยอะแต่ต้นทุนต่ำค่ะ'
    }
    if (activeMode === 'marketing' || lower.includes('hook') || text.includes('คอนเทนต์')) {
      return 'สรุปมุม Marketing: เลือก SKU ที่ขายดีแต่เคลมต่ำเป็นตัวหลักของแคมเปญ แล้วทำ 3 มุมคือ pain point, before/after, และ social proof ส่วน SKU ที่เคลมสูงให้พักการดันแอดไว้ก่อนจนกว่าทีม Ops จะเคลียร์สาเหตุค่ะ'
    }
    if (activeMode === 'sales' || text.includes('ยอด')) {
      return 'สรุปมุม Sales: ให้ดูยอดขายแยกแบรนด์และช่องทางก่อน แล้วค่อยเจาะ SKU ที่โต/ตกผิดปกติ ถ้าช่องทางนอกแพลตฟอร์มโตดี ควรแยก campaign code หรือ note ให้ชัดเพื่อวัดผลรอบถัดไปค่ะ'
    }
    if (activeMode === 'ops' || text.includes('สต็อก') || text.includes('งาน')) {
      return 'สรุปมุม Ops: วันนี้ควรไล่ 3 จุดก่อนคือสินค้าขายเร็วที่เสี่ยงขาด, SKU ที่มีเคลมซ้ำ, และงานค้างที่กระทบการแพ็ก พอได้รายการแล้วให้แยก owner กับ deadline สั้น ๆ เพื่อปิดงานได้จริงค่ะ'
    }
    return 'สรุปสำหรับผู้บริหาร: วันนี้ควรดู 1) ยอดขายและช่องทางที่โต/ตก 2) SKU ที่ต้องดันหรือพัก 3) เคลมที่กระทบต้นทุน 4) งานหลังบ้านที่ต้องตาม แนะนำให้ส่ง action list รายทีมก่อนจบวันค่ะ'
  }
  const send = (text = input) => {
    const clean = text.trim()
    if (!clean) return
    setMessages(prev => [...prev, { id: Date.now(), role: 'user', text: clean }])
    setInput('')
    setTimeout(() => {
      setMessages(prev => [...prev, { id: Date.now() + 1, role: 'ai', text: buildReply(clean) }])
    }, 250)
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 380px', gap: 24, width: '100%' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ background: 'var(--payi-surface)', border: '1px solid var(--payi-border)', borderRadius: 18, padding: 22 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--payi-text-strong)' }}>PAYI Brain</div>
          <div style={{ fontSize: 13, color: 'var(--payi-text-muted)', marginTop: 4 }}>ผู้ช่วยวิเคราะห์ยอดขาย เคลม สต็อก งานหลังบ้าน และแผนการตลาดของ PAYI Ops</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          {modes.map(m => {
            const active = activeMode === m.id
            return (
              <button key={m.id} onClick={() => setActiveMode(m.id)} style={{ textAlign: 'left', border: `1px solid ${active ? 'var(--payi-surface-dark)' : 'var(--payi-border)'}`, background: active ? 'var(--payi-surface-dark)' : 'var(--payi-surface)', color: active ? 'var(--payi-surface)' : 'var(--payi-text-strong)', borderRadius: 14, padding: 14, cursor: 'pointer' }}>
                <div style={{ fontSize: 13, fontWeight: 800 }}>{m.name}</div>
                <div style={{ fontSize: 11, color: active ? 'var(--payi-line)' : 'var(--payi-text-muted)', marginTop: 5, lineHeight: 1.45 }}>{m.desc}</div>
              </button>
            )
          })}
        </div>

        <div style={{ background: 'var(--payi-surface)', border: '1px solid var(--payi-border)', borderRadius: 18, padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--payi-text-strong)', marginBottom: 10 }}>{mode.name} พร้อมใช้งาน</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {(quickPrompts[activeMode] || []).map(prompt => (
              <button key={prompt} onClick={() => addPrompt(prompt)} style={{ border: '1px solid #dbe3ef', background: 'var(--payi-surface-muted)', color: 'var(--payi-text)', borderRadius: 999, padding: '8px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                {prompt}
              </button>
            ))}
          </div>
        </div>

        <div style={{ background: 'var(--payi-surface)', border: '1px solid var(--payi-border)', borderRadius: 18, padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--payi-text-strong)', marginBottom: 14 }}>สิ่งที่ PAYI Brain จะช่วยได้</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
            {[
              ['Daily Brief', 'สรุปยอดขาย เคลม และงานเสี่ยงเป็นภาษาสั้น ๆ'],
              ['Anomaly Check', 'ชี้จุดผิดปกติ เช่น ยอดตก เคลมพุ่ง หรือ SKU เสี่ยง'],
              ['Action List', 'แปลง insight เป็นรายการงานพร้อม owner/deadline'],
              ['Team Summary', 'ร่างข้อความส่งทีมขาย คลัง แพ็ก หรือคอนเทนต์'],
            ].map(([title, desc]) => (
              <div key={title} style={{ border: '1px solid var(--payi-border)', background: 'var(--payi-surface-muted)', borderRadius: 14, padding: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--payi-text-strong)' }}>{title}</div>
                <div style={{ fontSize: 11, color: 'var(--payi-text-muted)', marginTop: 5, lineHeight: 1.5 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ background: 'var(--payi-surface)', border: '1px solid var(--payi-border)', borderRadius: 18, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: 620 }}>
        <div style={{ background: 'var(--payi-surface-dark)', color: 'var(--payi-surface)', padding: '15px 18px' }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>PAYI Brain Chat</div>
          <div style={{ fontSize: 11, color: 'var(--payi-line)', marginTop: 2 }}>{mode.name}</div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, background: 'var(--payi-surface-muted)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {messages.map(m => (
            <div key={m.id} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%' }}>
              <div style={{ background: m.role === 'user' ? 'var(--payi-mint)' : 'var(--payi-surface)', color: m.role === 'user' ? 'var(--payi-surface)' : 'var(--payi-text-strong)', border: m.role === 'user' ? 'none' : '1px solid var(--payi-border)', borderRadius: m.role === 'user' ? '14px 14px 3px 14px' : '14px 14px 14px 3px', padding: '10px 13px', fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-line' }}>
                {m.text}
              </div>
            </div>
          ))}
        </div>
        <form onSubmit={e => { e.preventDefault(); send() }} style={{ padding: 12, borderTop: '1px solid var(--payi-border)', display: 'flex', gap: 8 }}>
          <input value={input} onChange={e => setInput(e.target.value)} placeholder="ถาม PAYI Brain..." style={{ flex: 1, border: '1px solid var(--payi-border)', borderRadius: 12, padding: '9px 12px', fontSize: 12, outline: 'none' }} />
          <button type="submit" style={{ background: 'var(--payi-surface-dark)', color: 'var(--payi-surface)', border: 'none', borderRadius: 12, padding: '0 16px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>ส่ง</button>
        </form>
      </div>
    </div>
  )
}

// ============================================================
// SIDE DRAWER PRODUCT INSIGHT (REAL CONNECTED)
// ============================================================
function ProductInsightDrawer({ isOpen, onClose, selectedSku }) {
  if (!isOpen || !selectedSku) return null;

  const platformEntries = Object.entries(selectedSku.platforms || {})
    .map(([name, revenue]) => ({
      name,
      revenue: Number(revenue),
      qty: Number((selectedSku.platformUnits || {})[name] || 0),
      fill: PLATFORM_COLORS[name] || '#888'
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const skuRealChartData = platformEntries.length > 0
    ? platformEntries
    : [
        { name: 'Shopee',     revenue: 0, qty: 0, fill: PLATFORM_COLORS['Shopee'] },
        { name: 'TikTok Shop', revenue: 0, qty: 0, fill: PLATFORM_COLORS['TikTok Shop'] },
        { name: 'Lazada',     revenue: 0, qty: 0, fill: PLATFORM_COLORS['Lazada'] },
      ];

  const totalPlatformRev = skuRealChartData.reduce((s, p) => s + p.revenue, 0);

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.15)', backdropFilter: 'blur(4px)',
          zIndex: 998
        }}
      />

      <div className="payi-drawer-slide-in" style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: '460px', backgroundColor: 'var(--payi-surface)',
        boxShadow: '-10px 0 40px rgba(15, 23, 42, 0.08)',
        zIndex: 999, display: 'flex', flexDirection: 'column',
        padding: '32px', boxSizing: 'border-box'
      }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
          <div style={{ maxWidth: '85%' }}>
            <span style={{ fontSize: '11px', fontFamily: 'monospace', fontWeight: 700, padding: '3px 8px', backgroundColor: 'var(--payi-mint-soft)', color: 'var(--payi-mint)', borderRadius: 6 }}>
              {selectedSku.sku}
            </span>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--payi-text-strong)', marginTop: 8, lineHeight: 1.4 }}>
              {selectedSku.display_name}
            </h3>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'var(--payi-border)', padding: 6, borderRadius: '50%', cursor: 'pointer', display: 'grid', placeItems: 'center', color: 'var(--payi-text-muted)' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20, paddingRight: 4 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ background: 'var(--payi-surface-muted)', border: '1px solid var(--payi-border)', padding: '16px', borderRadius: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--payi-text-muted)', fontWeight: 500 }}>ยอดขายรวม SKU นี้</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--payi-text-strong)', marginTop: 6 }}>฿{fmt(selectedSku.revenue)}</div>
            </div>
            <div style={{ background: 'var(--payi-surface-muted)', border: '1px solid var(--payi-border)', padding: '16px', borderRadius: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--payi-text-muted)', fontWeight: 500 }}>จำนวนชิ้นที่ขายได้</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--payi-text-strong)', marginTop: 6 }}>{fmt(selectedSku.qty)} ชิ้น</div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--payi-text)', marginBottom: 14 }}>สัดส่วนรายรับตามช่องทางจริง (Real Revenue Breakdown)</div>
            <div style={{ width: '100%', height: 140, background: 'var(--payi-surface)', border: '1px solid var(--payi-border)', borderRadius: 16, padding: '14px 14px 0 0', boxSizing: 'border-box' }}>
              {totalPlatformRev > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={skuRealChartData} layout="vertical" margin={{ top: 5, right: 10, left: 15, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--payi-text-muted)' }} axisLine={false} tickLine={false} tickFormatter={(v) => `฿${fmt(v)}`} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: 'var(--payi-text)', fontWeight: 500 }} axisLine={false} tickLine={false} width={75} />
                    <Tooltip cursor={{ fill: 'rgba(0,0,0,0.02)' }} contentStyle={{ borderRadius: 8, border: '1px solid var(--payi-border)', fontSize: 12 }} formatter={(v) => [`฿${fmt(v)}`, 'ยอดขาย']} />
                    <Bar dataKey="revenue" radius={[0, 8, 8, 0]} barSize={12}>
                      {skuRealChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: '100%', display: 'grid', placeItems: 'center', fontSize: 12, color: 'var(--payi-text-faint)' }}>ไม่มีข้อมูลแยกสัดส่วนช่องทางขาย</div>
              )}
            </div>
          </div>

          {totalPlatformRev > 0 && (
            <div style={{ background: 'var(--payi-surface-muted)', border: '1px solid var(--payi-border)', borderRadius: 16, padding: '14px 16px' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--payi-text)', marginBottom: 10 }}>รายละเอียดแยกช่องทาง</div>
              {skuRealChartData.map((p, i) => {
                const pct = totalPlatformRev > 0 ? Math.round(p.revenue / totalPlatformRev * 100) : 0;
                return (
                  <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: i < skuRealChartData.length - 1 ? '1px solid var(--payi-border)' : 'none' }}>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: p.fill, flexShrink: 0 }} />
                    <div style={{ flex: 1, fontSize: 12, fontWeight: 500, color: 'var(--payi-text-strong)' }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--payi-text-faint)', width: 64, textAlign: 'right' }}>{fmt(p.qty)} ชิ้น</div>
                    <div style={{ fontSize: 11, color: 'var(--payi-text-faint)', width: 32, textAlign: 'right' }}>{pct}%</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--payi-text-strong)', width: 90, textAlign: 'right' }}>฿{fmt(p.revenue)}</div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)', border: '1px solid #bbf7d0', borderRadius: 20, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#15803d', fontSize: 14, fontWeight: 700, marginBottom: 10 }}>
              <Sparkles size={16} />
              คำแนะนำกลยุทธ์จาก PAYI Brain
            </div>
            <p style={{ fontSize: 13, color: '#166534', lineHeight: 1.6, margin: 0 }}>
              จากการตรวจสอบข้อมูลระบบคลังและคำสั่งซื้อจริง สินค้าชิ้นนี้ทำผลงานได้เสถียรมาก แนะนำให้จัดแคมเปญกระตุ้นเพิ่มในช่องทางที่ทำรายได้หลัก พร้อมกับนำจุดขาย (Pain Point) ที่ลูกค้าชอบรีวิวไปดันบรีฟงานตัวใหม่ให้ทีมครีเอเตอร์ทำวิดีโอสั้นลง TikTok และ Facebook ทันทีเพื่อรับกระแสแอดครับบอส!
            </p>
          </div>

        </div>
      </div>
    </>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState(() => {
    try {
      return localStorage.getItem('payi-active-tab') || 'Executive'
    } catch {
      return 'Executive'
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem('payi-active-tab', activeTab)
    } catch {}
  }, [activeTab])
  
  // DATE FILTER STATES
  const [datePreset, setDatePreset] = useState('all') 
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  
  const [business, setBusiness] = useState('all')
  const [platform, setPlatform] = useState('all')
  const [chartMode, setChartMode] = useState('revenue')
  const [period, setPeriod] = useState('daily')
  const [searchQuery, setSearchQuery] = useState('')
  const [showSkuModal, setShowSkuModal] = useState(false)

  // DRAWER STATE
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedSkuData, setSelectedSkuData] = useState(null);

  const [dashData, setDashData] = useState(null)
  const [isFetching, setIsFetching] = useState(false)
  const [error, setError] = useState(null)

  const handleNavigate = (destination) => {
    if (destination === 'unmapped') {
      setActiveTab('Unmapped')
    } else if (destination === 'reports') {
      setActiveTab('Executive')
    }
  }

  const handlePresetChange = (preset) => {
    setDatePreset(preset)
    setBusiness('all')
    setPlatform('all')
    const today = new Date()
    const fmtISO = (d) => d.toISOString().slice(0, 10)
    
    if (preset === 'today') {
      const tStr = fmtISO(today)
      setStartDate(tStr); setEndDate(tStr)
    } else if (preset === '7d') {
      const s = new Date(today); s.setDate(today.getDate() - 6)
      setStartDate(fmtISO(s)); setEndDate(fmtISO(today))
    } else if (preset === '30d') {
      const s = new Date(today); s.setDate(today.getDate() - 29)
      setStartDate(fmtISO(s)); setEndDate(fmtISO(today))
    } else if (preset === 'all') {
      setStartDate(''); setEndDate('')
    }
  }

  const fetchDashboard = useCallback(async () => {
    setIsFetching(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (business !== 'all') params.set('business', business)
      if (platform !== 'all') params.set('platform', platform)
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)
      const url = `${API_BASE}/dashboard${params.toString() ? '?' + params.toString() : ''}`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'API error')
      setDashData(data)
    } catch (err) {
      console.error('[dashboard] fetch error:', err)
      setError(err.message)
    } finally {
      setIsFetching(false)
    }
  }, [business, platform, startDate, endDate])

  useEffect(() => {
    if (activeTab === 'Executive' || activeTab === 'Sales') {
      fetchDashboard()
    }
  }, [activeTab, fetchDashboard])

  // ─── Get data from commandCenter ──────────────────────────────────────
  const commandCenter = dashData?.commandCenter || {}
  const alerts = commandCenter.alerts || []
  const trendingUp = commandCenter.trendingUp || []
  const trendingDown = commandCenter.trendingDown || []
  const todayRevenue = commandCenter.todayRevenue || 0
  const revenueGrowth = commandCenter.revenueGrowth

  // ─── Original KPI data ────────────────────────────────────────────────
  const totalRevenue = dashData?.revenue ?? 0
  const totalOrders  = dashData?.orders ?? 0
  const totalQty     = dashData?.units ?? 0
  const avgOrder     = dashData?.aov ?? 0

  // ─── KPI Trends จาก server ────────────────────────────────────────────
  const revenueTrend = dashData?.revenueTrend ?? null
  const ordersTrend  = dashData?.ordersTrend  ?? null
  const unitsTrend   = dashData?.unitsTrend   ?? null
  const aovTrend     = dashData?.aovTrend     ?? null

  const chartData = useMemo(() => {
    if (!dashData) return []
    const sourceByDay = chartMode === 'orders'
      ? (dashData.ordersByDay || []).map(d => ({ date: d.date, value: d.count }))
      : (dashData.revenueByDay || []).map(d => ({ date: d.date, value: d.amount }))

    if (period === 'daily') {
      return sourceByDay.map(d => ({ label: d.date, [chartMode === 'orders' ? 'orders' : 'revenue']: d.value }))
    }

    const buckets = {}
    for (const d of sourceByDay) {
      let key
      if (period === 'weekly') {
        const dt = new Date(d.date)
        const day = dt.getDay() || 7
        dt.setDate(dt.getDate() + 4 - day)
        const yearStart = new Date(dt.getFullYear(), 0, 1)
        const week = Math.ceil((((dt - yearStart) / 86400000) + 1) / 7)
        key = `${dt.getFullYear()}-W${String(week).padStart(2, '0')}`
      } else if (period === 'monthly') {
        key = d.date.slice(0, 7)
      } else {
        key = d.date.slice(0, 4)
      }
      buckets[key] = (buckets[key] || 0) + d.value
    }
    const dataKey = chartMode === 'orders' ? 'orders' : 'revenue'
    return Object.entries(buckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, v]) => ({ label, [dataKey]: v }))
  }, [dashData, period, chartMode])

  const businesses = useMemo(() => {
    if (!dashData?.businessBreakdown) return []
    return dashData.businessBreakdown.map(b => b.name).sort()
  }, [dashData])

  const platforms = useMemo(() => {
    if (!dashData?.platformBreakdown) return []
    return dashData.platformBreakdown.map(p => p.name).sort()
  }, [dashData])

  const byPlatform = useMemo(() => {
    return (dashData?.platformBreakdown || []).map(p => ({ name: p.name, revenue: p.amount }))
  }, [dashData])

  const topSkus = useMemo(() => {
    const raw = dashData?.topSkus || []
    return raw.map(s => ({
      sku: s.sku ?? s.master_sku ?? s.masterSku ?? s.SKU ?? '',
      display_name: s.display_name ?? s.product_name ?? s.name ?? '',
      orders: Number(s.orders ?? s.count ?? 0),
      qty: Number(s.qty ?? s.quantity ?? s.units ?? 0),
      revenue: Number(s.amount ?? s.revenue ?? 0),
      platforms: s.platforms || {},
      platformUnits: s.platformUnits || {}
    })).sort((a, b) => b.revenue - a.revenue).slice(0, 20)
  }, [dashData])

  const filteredSkus = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return topSkus
    return topSkus.filter(s =>
      s.sku.toLowerCase().includes(q) || s.display_name.toLowerCase().includes(q)
    )
  }, [topSkus, searchQuery])

  const visibleSkus = useMemo(() => {
  return filteredSkus.slice(0, 10)
  }, [filteredSkus])

  const activeChart = chartMode === 'orders' 
    ? { title: 'Orders Trend', label: 'Orders', dataKey: 'orders', formatter: (value) => [fmt(value), 'Orders'], gradientFrom: '#7c3aed' }
    : { title: 'Revenue Trend', label: 'Revenue', dataKey: 'revenue', formatter: (value) => [`฿${fmt(value)}`, 'Revenue'], gradientFrom: 'var(--payi-mint)' };

  const pageMeta = {
    Executive: {
      title: 'Executive',
      eyebrow: 'Overview',
      subtitle: 'Daily command view for sales, stock signals, tasks, and alerts.'
    },
    Sales: {
      title: 'Off-Platform Sales',
      eyebrow: 'Sales',
      subtitle: 'Manual and non-marketplace sales tracking.'
    },
    'Import Orders': {
      title: 'Import Orders',
      eyebrow: 'Sales',
      subtitle: 'Upload marketplace orders and prepare them for reconciliation.'
    },
    Products: {
      title: 'Dashboard สินค้า',
      eyebrow: 'Overview',
      subtitle: 'ผลงานสินค้ารายกลุ่ม (รวมไซส์/รุ่นย่อยเป็นตัวเดียว) · สินค้าขายดี แนวโน้ม และ SKU ในกลุ่ม'
    },
    ProductTrends: {
      title: '% เปลี่ยนแปลงสินค้า',
      eyebrow: 'Overview',
      subtitle: 'จำนวนชิ้น & ยอดขายรายเดือน + % เปลี่ยนแปลง MoM · แยกแพลตฟอร์ม · กดดู SKU แยกในกลุ่ม'
    },
    MarketingRadar: {
      title: 'เรดาร์การตลาด',
      eyebrow: 'Marketing',
      subtitle: 'ติดตามงานแก้รูป ลงสินค้าใหม่ ลงคลิป และดูผลยอดขายหลังเปลี่ยนแบบสั้น ๆ'
    }
  }[activeTab] || {
    title: activeTab,
    eyebrow: menuGroups.find(group => group.items.some(item => item.id === activeTab))?.title || 'Workspace',
    subtitle: 'PAYI Ops workspace'
  }

  const rangeLabel = datePreset === 'today'
    ? 'Today'
    : datePreset === '7d'
      ? 'Last 7 days'
      : datePreset === '30d'
        ? 'Last 30 days'
        : startDate || endDate
          ? `${startDate || 'Start'} to ${endDate || 'End'}`
          : 'All time'

  const fmtTrend = (v) => {
    if (v === null || v === undefined) return null
    return `${v >= 0 ? '+' : ''}${v}%`
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'transparent', fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif', color: 'var(--payi-text-strong)' }}>
      
      {/* SIDEBAR NAVIGATION */}
      <div style={{ width: 256, height: '100vh', position: 'sticky', top: 0, background: 'var(--payi-surface-dark)', borderRight: '1px solid var(--payi-deep)', display: 'flex', flexDirection: 'column', padding: '18px 0 16px 16px', boxSizing: 'border-box', flexShrink: 0 }}>
        <div style={{ marginBottom: 18, paddingLeft: 4, display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src={payiLogo} alt="PAYI" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', boxShadow: '0 0 0 1px rgba(255,255,255,0.12)' }} />
          <div>
            <div style={{ fontSize: '16px', fontWeight: '800', color: 'var(--payi-surface)' }}>PAYI Ops</div>
            <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--payi-text-faint)', letterSpacing: '0.08em', marginTop: '4px' }}>RETAIL CONTROL ROOM</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11, flex: 1, overflowY: 'auto', paddingRight: 4 }}>
          {menuGroups.map((group) => (
            <div key={group.title} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ fontSize: '10px', fontWeight: '800', color: 'var(--payi-text-muted)', letterSpacing: '0.08em', padding: '4px 8px' }}>{group.title}</div>
              {group.items.map((item) => {
                const isActive = activeTab === item.id
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: item.helper ? '7px 12px 7px 10px' : '6.5px 12px 6.5px 10px', border: 'none', borderRadius: 8,
                      backgroundColor: isActive ? 'var(--payi-surface)' : 'transparent', color: isActive ? 'var(--payi-surface-dark)' : 'var(--payi-text-on-dark-muted)', cursor: 'pointer', fontSize: '12.5px', fontWeight: isActive ? '800' : '600', textAlign: 'left', transition: 'background 140ms ease, color 140ms ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <span style={{ color: isActive ? 'var(--payi-surface-dark)' : 'var(--payi-text-faint)', display: 'flex', alignItems: 'center', flexShrink: 0 }}>{item.renderIcon()}</span>
                      <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
                        {item.helper && (
                          <span style={{ fontSize: 9.5, lineHeight: 1.05, color: isActive ? 'var(--payi-text-muted)' : 'var(--payi-text-muted)', whiteSpace: 'nowrap' }}>{item.helper}</span>
                        )}
                      </span>
                    </div>
                    {item.dotColor && <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: item.dotColor, marginRight: '6px' }} />}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div style={{ flex: 1, minHeight: '100vh', overflow: 'auto', padding: '24px 32px 40px', boxSizing: 'border-box', width: '100%' }}>
        
        {/* HEADER TOP ROW */}
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 18, marginBottom: 18, alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--payi-text-muted)', marginBottom: 6 }}>{pageMeta.eyebrow}</div>
            <div style={{ fontSize: 28, fontWeight: 850, letterSpacing: 0, color: 'var(--payi-surface-dark)', marginBottom: 4 }}>{pageMeta.title}</div>
            <div style={{ fontSize: 13, color: 'var(--payi-text-muted)' }}>{pageMeta.subtitle}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: 280, background: 'var(--payi-surface)', border: '1px solid var(--payi-border)', borderRadius: 8, padding: '10px 12px', boxShadow: '0 8px 20px rgba(16,24,40,0.04)' }}>
              <Search size={16} color="var(--payi-text-muted)" />
              <input
                placeholder="ค้นหา SKU หรือแคมเปญ"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', fontSize: 13, color: 'var(--payi-surface-dark)', background: 'transparent' }}
              />
            </div>
            <button title="Notifications" style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--payi-surface)', border: '1px solid var(--payi-border)', display: 'grid', placeItems: 'center', boxShadow: '0 8px 20px rgba(16,24,40,0.04)' }}><Bell size={18} color="var(--payi-text-muted)" /></button>
            <button style={{ display: 'flex', alignItems: 'center', gap: 9, border: '1px solid var(--payi-border)', borderRadius: 8, padding: '9px 12px', background: 'var(--payi-surface)', boxShadow: '0 8px 20px rgba(16,24,40,0.04)', color: 'var(--payi-surface-dark)' }}>
              <UserCircle2 size={20} color="var(--payi-text-muted)" />
              <span style={{ fontSize: 13, fontWeight: 700 }}>Nook</span>
            </button>
          </div>
        </div>

        {(activeTab === 'Executive') ? (
          <div style={{ width: '100%' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(320px, 0.65fr)', gap: 16, marginBottom: 16 }}>
              <div style={{ background: 'var(--payi-surface-dark)', color: 'var(--payi-surface)', borderRadius: 8, padding: 22, border: '1px solid var(--payi-deep)', boxShadow: '0 16px 40px rgba(16,24,40,0.12)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', marginBottom: 26 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--payi-text-faint)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Command Snapshot</div>
                    <div style={{ fontSize: 34, lineHeight: 1.05, fontWeight: 850, letterSpacing: 0 }}>THB {fmt(totalRevenue)}</div>
                    <div style={{ fontSize: 13, color: 'var(--payi-text-on-dark-muted)', marginTop: 8 }}>Revenue / {rangeLabel}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: revenueTrend === null || revenueTrend >= 0 ? '#053321' : '#55160c', border: revenueTrend === null || revenueTrend >= 0 ? '1px solid #067647' : '1px solid var(--payi-danger)', color: revenueTrend === null || revenueTrend >= 0 ? '#75e0a7' : '#fda29b', borderRadius: 999, padding: '7px 10px', fontSize: 12, fontWeight: 800 }}>
                    {revenueTrend === null || revenueTrend >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                    {fmtTrend(revenueTrend) || 'Live'}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
                  {[
                    { label: 'Orders', value: fmt(totalOrders) },
                    { label: 'Units', value: fmt(totalQty) },
                    { label: 'AOV', value: 'THB ' + fmt(avgOrder) }
                  ].map(item => (
                    <div key={item.label} style={{ background: 'var(--payi-deep)', border: '1px solid #344054', borderRadius: 8, padding: '12px 14px' }}>
                      <div style={{ fontSize: 11, color: 'var(--payi-text-faint)', fontWeight: 700 }}>{item.label}</div>
                      <div style={{ fontSize: 20, color: 'var(--payi-surface)', fontWeight: 850, marginTop: 5 }}>{item.value}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ background: 'var(--payi-surface)', border: '1px solid var(--payi-border)', borderRadius: 8, padding: 18, boxShadow: '0 12px 30px rgba(16,24,40,0.06)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 850, color: 'var(--payi-surface-dark)' }}>Today Focus</div>
                  <span style={{ fontSize: 11, fontWeight: 800, color: alerts.length ? 'var(--payi-danger)' : '#027a48', background: alerts.length ? '#fef3f2' : '#ecfdf3', borderRadius: 999, padding: '4px 8px' }}>{alerts.length} alerts</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { label: 'Revenue today', value: 'THB ' + fmt(todayRevenue) },
                    { label: 'Top movers', value: trendingUp.length + ' up / ' + trendingDown.length + ' down' },
                    { label: 'Data scope', value: rangeLabel }
                  ].map(row => (
                    <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 14, borderBottom: '1px solid #eef2f6', paddingBottom: 10 }}>
                      <span style={{ fontSize: 12, color: 'var(--payi-text-muted)', fontWeight: 650 }}>{row.label}</span>
                      <span style={{ fontSize: 12.5, color: 'var(--payi-surface-dark)', fontWeight: 850, textAlign: 'right' }}>{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {error && (
              <div style={{ background: 'var(--payi-danger-bg)', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 16px', marginBottom: 16, color: 'var(--payi-danger)', fontSize: 13 }}>
                ⚠️ โหลดไม่สำเร็จ: {error} — <button onClick={fetchDashboard} style={{ border: 'none', background: 'none', color: 'var(--payi-mint)', cursor: 'pointer', fontWeight: 600 }}>ลองใหม่</button>
              </div>
            )}

            {/* CONTROL PANEL */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
              background: 'var(--payi-surface)', border: '1px solid var(--payi-border)', padding: '12px 14px', borderRadius: 8, marginBottom: 18,
              boxShadow: '0 8px 20px rgba(16,24,40,0.04)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => { setStartDate(e.target.value); setDatePreset('custom'); setBusiness('all'); setPlatform('all'); }}
                  style={{ border: '1px solid var(--payi-border)', borderRadius: 8, padding: '7px 10px', fontSize: 13, color: 'var(--payi-text)', outline: 'none', background: 'var(--payi-surface-muted)' }}
                />
                <span style={{ color: 'var(--payi-text-faint)', fontSize: 13, fontWeight: 500 }}>ถึง</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => { setEndDate(e.target.value); setDatePreset('custom'); setBusiness('all'); setPlatform('all'); }}
                  style={{ border: '1px solid var(--payi-border)', borderRadius: 8, padding: '7px 10px', fontSize: 13, color: 'var(--payi-text)', outline: 'none', background: 'var(--payi-surface-muted)' }}
                />
                {(startDate || endDate) && (
                  <button
                    onClick={() => { setStartDate(''); setEndDate(''); setDatePreset('all'); setBusiness('all'); setPlatform('all'); }}
                    style={{ background: 'none', border: 'none', color: 'var(--payi-danger)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '4px 8px' }}
                  >
                    ล้างวันที่
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', background: 'var(--payi-border)', padding: 3, borderRadius: 8, border: '1px solid var(--payi-border)' }}>
                  {[
                    { id: 'today', label: 'วันนี้' },
                    { id: '7d', label: '7 วัน' },
                    { id: '30d', label: '30 วัน' },
                    { id: 'all', label: 'ทั้งหมด' }
                  ].map(p => {
                    const isSel = datePreset === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => handlePresetChange(p.id)}
                        style={{
                          padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 6, border: 'none', cursor: 'pointer', transition: 'all 150ms ease',
                          background: isSel ? 'var(--payi-surface)' : 'transparent',
                          color: isSel ? 'var(--payi-mint)' : 'var(--payi-text)',
                          boxShadow: isSel ? '0 2px 8px rgba(15,23,42,0.05)' : 'none'
                        }}
                      >
                        {p.label}
                      </button>
                    )
                  })}
                </div>

                <select value={business} onChange={e => setBusiness(e.target.value)} style={{ border: '1px solid var(--payi-border)', borderRadius: 8, padding: '7px 10px', fontSize: 13, color: 'var(--payi-text)', fontWeight: 500, outline: 'none', background: 'var(--payi-surface-muted)' }}>
                  <option value="all">ทุกธุรกิจ</option>
                  {businesses.map(b => <option key={b} value={b}>{b}</option>)}
                </select>

                <select value={platform} onChange={e => setPlatform(e.target.value)} style={{ border: '1px solid var(--payi-border)', borderRadius: 8, padding: '7px 10px', fontSize: 13, color: 'var(--payi-text)', fontWeight: 500, outline: 'none', background: 'var(--payi-surface-muted)' }}>
                  <option value="all">ทุกแพลตฟอร์ม</option>
                  {platforms.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>

            {/* LOADING SKELETON */}
            {isFetching && !dashData && (
              <div style={{ position: 'relative', pointerEvents: 'none' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 18, marginBottom: 24 }}>
                  {[1,2,3,4].map(i => <div key={i} className="payi-skeleton" style={{ height: 170 }} />)}
                </div>
                <div className="payi-skeleton" style={{ height: 290, marginBottom: 24 }} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 24 }}>
                  <div className="payi-skeleton" style={{ height: 120 }} />
                  <div className="payi-skeleton" style={{ height: 120 }} />
                </div>
                <div className="payi-skeleton" style={{ height: 260 }} />
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--payi-surface)', border: '1px solid var(--payi-border)', borderRadius: 99, padding: '10px 20px', boxShadow: '0 8px 24px rgba(15,23,42,0.08)', fontSize: 13, color: 'var(--payi-text)', fontWeight: 500 }}>
                    <Loader2 size={16} className="payi-spin" />
                    กำลังโหลดข้อมูล...
                  </div>
                </div>
              </div>
            )}

            {/* CONTENT */}
            {dashData && (<>

            {/* REFRESHING INDICATOR */}
            {isFetching && (
              <div style={{ position: 'fixed', top: 18, right: 24, zIndex: 50, display: 'flex', alignItems: 'center', gap: 8, background: 'var(--payi-surface)', border: '1px solid var(--payi-border)', borderRadius: 99, padding: '8px 16px', boxShadow: '0 8px 24px rgba(15,23,42,0.08)', fontSize: 12, color: 'var(--payi-text)', fontWeight: 500 }}>
                <Loader2 size={14} className="payi-spin" />
                กำลังอัปเดตข้อมูล...
              </div>
            )}

            {/* 1. ALERT CENTER - Full Width */}
            <AlertsSection alerts={alerts} />

            {/* 2. REVENUE TODAY CARD + TRENDING ROW */}
            <div style={{ display: 'flex', gap: 18, marginBottom: 28 }}>
              {/* Revenue Today Card */}
              <div style={{ flex: '0 0 280px', background: 'var(--payi-surface)', border: '1px solid var(--payi-border)', borderRadius: 20, padding: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.01)' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--payi-text-muted)', marginBottom: 8 }}>รายได้วันนี้</div>
                <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--payi-text-strong)', marginBottom: 8 }}>฿{fmt(todayRevenue)}</div>
                {revenueGrowth !== null && revenueGrowth !== undefined && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {revenueGrowth >= 0 ? (
                      <TrendingUp size={16} color="var(--payi-success)" />
                    ) : (
                      <TrendingDown size={16} color="var(--payi-danger)" />
                    )}
                    <span style={{ fontSize: 13, fontWeight: 600, color: revenueGrowth >= 0 ? 'var(--payi-success)' : 'var(--payi-danger)' }}>
                      {revenueGrowth >= 0 ? '+' : ''}{revenueGrowth}%
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--payi-text-faint)' }}>vs เมื่อวาน</span>
                  </div>
                )}
              </div>

              {/* Trending Up Card */}
              <TrendingCard title="Trending Up 🔥" items={trendingUp} isUp={true} />

              {/* Trending Down Card */}
              <TrendingCard title="Trending Down ⚠️" items={trendingDown} isUp={false} />
            </div>

            {/* 3. ORIGINAL KPI SECTION */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--payi-text)', marginBottom: 12, paddingLeft: 4 }}>
                สรุปภาพรวมตามช่วงเวลาที่เลือก
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 18 }}>
                <KpiCard
                  title="Total Revenue"
                  value={`฿${fmt(totalRevenue)}`}
                  subtitle={revenueTrend !== null ? `เทียบช่วงก่อนหน้า` : 'รายได้ในช่วงเวลาที่เลือก'}
                  icon={DollarSign}
                  trend={fmtTrend(revenueTrend)}
                  isPositive={revenueTrend === null ? true : revenueTrend >= 0}
                />
                <KpiCard
                  title="Total Orders"
                  value={fmt(totalOrders)}
                  subtitle={ordersTrend !== null ? `เทียบช่วงก่อนหน้า` : 'ออเดอร์ในระบบ'}
                  icon={ShoppingBag}
                  trend={fmtTrend(ordersTrend)}
                  isPositive={ordersTrend === null ? true : ordersTrend >= 0}
                />
                <KpiCard
                  title="Avg. Order Value"
                  value={`฿${fmt(avgOrder)}`}
                  subtitle={aovTrend !== null ? `เทียบช่วงก่อนหน้า` : 'ต่อออเดอร์เฉลี่ย'}
                  icon={TrendingUp}
                  trend={fmtTrend(aovTrend)}
                  isPositive={aovTrend === null ? true : aovTrend >= 0}
                />
                <KpiCard
                  title="Units Sold"
                  value={`${fmt(totalQty)} pcs`}
                  subtitle={unitsTrend !== null ? `เทียบช่วงก่อนหน้า` : 'ชิ้นรวมที่ถูกระบายคลัง'}
                  icon={BarChart3}
                  trend={fmtTrend(unitsTrend)}
                  isPositive={unitsTrend === null ? true : unitsTrend >= 0}
                />
              </div>
            </div>

            {/* GRAPH METRIC AREA */}
            <div style={{ background: 'var(--payi-surface)', border: '1px solid var(--payi-border)', borderRadius: 20, padding: '22px', marginBottom: 24, boxShadow: '0 10px 40px rgba(15,23,42,0.01)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--payi-text-strong)' }}>{activeChart.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--payi-text-faint)', marginTop: 4 }}>สถิติวิเคราะห์แนวโน้มการเติบโตแบบ Dynamic</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', background: 'var(--payi-border)', padding: 3, borderRadius: 8, border: '1px solid var(--payi-border)' }}>
                    {[
                      { id: 'daily',   label: 'รายวัน' },
                      { id: 'weekly',  label: 'สัปดาห์' },
                      { id: 'monthly', label: 'เดือน' },
                    ].map(p => (
                      <button key={p.id} onClick={() => setPeriod(p.id)} style={{
                        padding: '5px 12px', fontSize: 11, fontWeight: 600, borderRadius: 8, border: 'none', cursor: 'pointer',
                        background: period === p.id ? 'var(--payi-surface)' : 'transparent',
                        color: period === p.id ? 'var(--payi-mint)' : 'var(--payi-text)',
                        boxShadow: period === p.id ? '0 2px 8px rgba(15,23,42,0.05)' : 'none',
                        transition: 'all 150ms ease'
                      }}>{p.label}</button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 6, background: 'var(--payi-border)', padding: 3, borderRadius: 8 }}>
                    {['revenue', 'orders'].map((mode) => (
                      <button key={mode} onClick={() => setChartMode(mode)} style={{ padding: '5px 12px', fontSize: 11, fontWeight: 600, borderRadius: 8, border: 'none', cursor: 'pointer', background: chartMode === mode ? 'var(--payi-mint)' : 'transparent', color: chartMode === mode ? 'var(--payi-surface)' : 'var(--payi-text)' }}>
                        {mode === 'revenue' ? 'Revenue' : 'Orders'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ width: '100%', height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <defs>
                      <linearGradient id={`${chartMode}Gradient`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={activeChart.gradientFrom} stopOpacity={0.9} />
                        <stop offset="100%" stopColor={activeChart.gradientFrom} stopOpacity={0.1} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--payi-text-muted)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--payi-text-muted)' }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: 'rgba(56,189,248,0.04)' }} contentStyle={{ borderRadius: 12 }} formatter={activeChart.formatter} />
                    <Bar dataKey={chartMode} fill={`url(#${chartMode}Gradient)`} radius={[10, 10, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* PLATFORM BREAKDOWN */}
            <div style={{ background: 'var(--payi-surface)', border: '1px solid var(--payi-border)', borderRadius: 16, padding: '20px', marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--payi-text)' }}>สัดส่วนยอดขายตามแพลตฟอร์มรวม</div>
                {byPlatform.length > 0 && (
                  <button
                    onClick={() => exportToCsv('platform-breakdown.csv', byPlatform.map(p => ({
                      platform: p.name,
                      revenue: p.revenue,
                      percent: totalRevenue > 0 ? Math.round(p.revenue / totalRevenue * 100) : 0,
                    })))}
                    style={{ fontSize: 12, fontWeight: 600, color: 'var(--payi-text)', background: 'var(--payi-surface-muted)', border: '1px solid var(--payi-border)', borderRadius: 999, padding: '6px 14px', cursor: 'pointer' }}
                  >
                    ⬇ Export CSV
                  </button>
                )}
              </div>
              {byPlatform.map((p, i) => {
                const pct = totalRevenue > 0 ? Math.round(p.revenue / totalRevenue * 100) : 0
                const isActive = platform === p.name
                return (
                  <div
                    key={p.name}
                    onClick={() => setPlatform(isActive ? 'all' : p.name)}
                    title={isActive ? 'คลิกเพื่อยกเลิกกรอง' : `คลิกเพื่อกรองเฉพาะ ${p.name}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 8px', margin: '0 -8px',
                      borderBottom: i < byPlatform.length - 1 ? '1px solid var(--payi-border)' : 'none',
                      cursor: 'pointer', borderRadius: 8,
                      background: isActive ? 'var(--payi-mint-soft)' : 'transparent',
                      transition: 'background-color 150ms ease'
                    }}
                  >
                    <div style={{ width: 100, fontSize: 12, fontWeight: isActive ? 700 : 500, color: isActive ? 'var(--payi-mint)' : 'var(--payi-text-strong)' }}>{p.name}</div>
                    <div style={{ flex: 1, height: 7, background: 'var(--payi-border)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', background: PLATFORM_COLORS[p.name] || '#888', width: `${pct}%`, transition: 'width 0.4s ease' }} />
                    </div>
                    <div style={{ width: 36, fontSize: 11, textAlign: 'right', color: 'var(--payi-text-faint)', fontWeight: 500 }}>{pct}%</div>
                    <div style={{ width: 110, fontSize: 12, textAlign: 'right', fontWeight: 600 }}>฿{fmt(p.revenue)}</div>
                  </div>
                )
              })}
            </div>

            {/* TOP SKUs HEADER */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--payi-text-muted)' }}>
                  สินค้าขายดีติดอันดับ (Top 10 SKUs by Revenue)
                </span>
                <span style={{ fontSize: 11, color: 'var(--payi-mint)', background: 'var(--payi-mint-soft)', padding: '2px 8px', borderRadius: 999, fontWeight: 500 }}>✨ กดที่แถวเพื่อดูสัดส่วนยอดขายจริงช่องทางย่อย</span>
                {searchQuery && (
                  <span style={{ fontSize: 11, color: 'var(--payi-text-faint)' }}>ผลการค้นหา "{searchQuery}": {filteredSkus.length} รายการ</span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {filteredSkus.length > 0 && (
                  <button
                    onClick={() => exportToCsv('top-skus.csv', filteredSkus.map(s => ({
                      master_sku: s.sku,
                      display_name: s.display_name,
                      orders: s.orders,
                      qty: s.qty,
                      revenue: s.revenue,
                    })))}
                    style={{ fontSize: 12, fontWeight: 600, color: 'var(--payi-text)', background: 'var(--payi-surface-muted)', border: '1px solid var(--payi-border)', borderRadius: 999, padding: '6px 14px', cursor: 'pointer' }}
                  >
                    ⬇ Export CSV
                  </button>
                )}
                {filteredSkus.length > 0 && (
                  <button
                    onClick={() => setShowSkuModal(true)}
                    style={{ fontSize: 12, fontWeight: 600, color: 'var(--payi-mint)', background: 'var(--payi-mint-soft)', border: '1px solid var(--payi-line)', borderRadius: 999, padding: '6px 14px', cursor: 'pointer' }}
                  >
                    {`ดูทั้งหมด (${filteredSkus.length})`}
                  </button>
                )}
              </div>
            </div>

            {/* TOP PERFORMANCE SKUs TABLE */}
            <div style={{ background: 'var(--payi-surface)', border: '1px solid var(--payi-border)', borderRadius: 16, overflow: 'hidden', marginBottom: 40, boxShadow: '0 4px 20px rgba(0,0,0,0.01)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: 'var(--payi-surface-muted)', borderBottom: '1px solid var(--payi-border)' }}>
                    <th style={{ padding: '14px 16px', fontWeight: 600, color: 'var(--payi-text)', fontSize: 11 }}>MASTER SKU</th>
                    <th style={{ padding: '14px 16px', fontWeight: 600, color: 'var(--payi-text)', fontSize: 11 }}>ชื่อสินค้า</th>
                    <th style={{ padding: '14px 16px', fontWeight: 600, color: 'var(--payi-text)', fontSize: 11, textAlign: 'right' }}>จำนวนออเดอร์</th>
                    <th style={{ padding: '14px 16px', fontWeight: 600, color: 'var(--payi-text)', fontSize: 11, textAlign: 'right' }}>จำนวนชิ้น</th>
                    <th style={{ padding: '14px 16px', fontWeight: 600, color: 'var(--payi-text)', fontSize: 11, textAlign: 'right' }}>ยอดขายรวม</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleSkus.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--payi-text-faint)', fontSize: 13 }}>
                        ไม่พบสินค้าที่ตรงกับ "{searchQuery}"
                      </td>
                    </tr>
                  )}
                  {visibleSkus.map((s) => (
                    <tr
                      key={s.sku}
                      onClick={() => { setSelectedSkuData(s); setIsDrawerOpen(true); }}
                      className="payi-interactive-row"
                      style={{ borderBottom: '1px solid var(--payi-border)', cursor: 'pointer', transition: 'background-color 150ms ease' }}
                    >
                      <td style={{ padding: '14px 16px', fontFamily: 'monospace', color: 'var(--payi-mint)', fontWeight: 700 }}>{s.sku}</td>
                      <td style={{ padding: '14px 16px', color: 'var(--payi-text-strong)', fontWeight: 500 }}>{s.display_name}</td>
                      <td style={{ padding: '14px 16px', color: 'var(--payi-text)', textAlign: 'right' }}>{fmt(s.orders)}</td>
                      <td style={{ padding: '14px 16px', color: 'var(--payi-text)', textAlign: 'right' }}>{fmt(s.qty)}</td>
                      <td style={{ padding: '14px 16px', color: 'var(--payi-text-strong)', fontWeight: 600, textAlign: 'right' }}>฿{fmt(s.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

          </>)}
          </div>
        ) : activeTab === 'Monthly' ? (
            <MonthlyDashboard />
        ) : activeTab === 'Products' ? (
            <ProductDashboard />
        ) : activeTab === 'ProductTrends' ? (
            <ProductTrends />
        ) : activeTab === 'MarketingRadar' ? (
            <MarketingRadar />
        ) : activeTab === 'Sales' ? ( // <--- เพิ่มตรงนี้
            <SalesView />
        ) : activeTab === 'Packing' ? (
            <PackingView />
        ) : activeTab === 'Claims' ? (
            <ClaimView />
        ) : activeTab === 'Import Orders' ? (
            <Upload onNavigate={handleNavigate} />
        ) : activeTab === 'Links Hub' ? (
            <LinksHub />
        ) : activeTab === 'Dev Hub' ? (
          <DevHub />
        ) : activeTab === 'AI Assistant' ? (
            <AIAssistantView />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--payi-text-faint)' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: 16, color: 'var(--payi-line)' }}>
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <div style={{ fontSize: '15px', fontWeight: '500', color: 'var(--payi-text)' }}>โมดูล {activeTab} กำลังจัดเตรียมโครงสร้างคลังข้อมูล</div>
          </div>
        )}
      </div>

      {/* PRODUCT INSIGHT SIDE DRAWER */}
      <ProductInsightDrawer 
        isOpen={isDrawerOpen} 
        onClose={() => {
          setIsDrawerOpen(false);
          setSelectedSkuData(null);
        }} 
        selectedSku={selectedSkuData}
      />

    </div>
  )
}
