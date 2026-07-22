import { useMemo, useState } from 'react'
import {
  ArrowRight,
  Banknote,
  Bell,
  BookOpen,
  Boxes,
  CalendarDays,
  ChevronDown,
  FileText,
  FolderOpen,
  Grid3X3,
  Link2,
  List,
  Megaphone,
  Pencil,
  Plus,
  Search,
  Settings,
  ShoppingCart,
  Trash2,
  Users,
} from 'lucide-react'

const STORE_KEY = 'payi-links-hub'

const DEFAULTS = [
  { id: 1, category: 'Marketplace', title: 'Shopee Seller Center', url: 'https://seller.shopee.co.th', desc: 'จัดการร้านค้า Shopee', accent: '#f05a28' },
  { id: 2, category: 'Marketplace', title: 'Lazada Seller Center', url: 'https://sellercenter.lazada.co.th', desc: 'จัดการร้านค้า Lazada', accent: '#7c3aed' },
  { id: 3, category: 'Marketplace', title: 'TikTok Shop Seller Center', url: 'https://seller-th.tiktok.com', desc: 'จัดการร้านค้า TikTok Shop', accent: '#111827' },
  { id: 4, category: 'Marketing', title: 'Meta Business Suite', url: 'https://business.facebook.com', desc: 'จัดการเพจและโฆษณา', accent: '#0b84ee' },
  { id: 5, category: 'Marketing', title: 'TikTok Ads Manager', url: 'https://ads.tiktok.com', desc: 'สร้างและจัดการโฆษณา', accent: '#111827' },
  { id: 6, category: 'Marketing', title: 'LINE Official Account', url: 'https://manager.line.biz', desc: 'จัดการแชทและบรอดแคสต์', accent: '#06c755' },
  { id: 7, category: 'Operations', title: 'Google Sheets (Orders)', url: 'https://docs.google.com/spreadsheets', desc: 'ออร์เดอร์รวม', accent: '#16a34a' },
  { id: 8, category: 'Operations', title: 'Inventory Sheet', url: 'https://docs.google.com/spreadsheets', desc: 'สต็อกสินค้า', accent: '#22c55e' },
  { id: 9, category: 'Operations', title: 'SOP & Process Docs', url: 'https://docs.google.com/document', desc: 'คู่มือการทำงาน', accent: '#0ea5e9' },
  { id: 10, category: 'Finance', title: 'FlowAccount', url: 'https://flowaccount.com', desc: 'บัญชีและภาษี', accent: '#0ea5e9' },
  { id: 11, category: 'Finance', title: 'SCB Business', url: 'https://business.scb', desc: 'ธนาคารไทยพาณิชย์', accent: '#4c1d95' },
  { id: 12, category: 'Finance', title: 'Krungthai Business', url: 'https://krungthai.com', desc: 'ธนาคารกรุงไทย', accent: '#0ea5e9' },
  { id: 13, category: 'Tools & Productivity', title: 'Google Drive', url: 'https://drive.google.com', desc: 'ไฟล์งานทั้งหมด', accent: '#22c55e' },
  { id: 14, category: 'Tools & Productivity', title: 'Notion Workspace', url: 'https://notion.so', desc: 'วางแผนงาน / Docs', accent: '#111827' },
  { id: 15, category: 'Tools & Productivity', title: 'Slack', url: 'https://slack.com', desc: 'สื่อสารทีม', accent: '#e11d48' },
  { id: 16, category: 'Documents', title: 'Brand Guidelines', url: 'https://docs.google.com/document', desc: 'แนวทางแบรนด์', accent: '#f59e0b' },
  { id: 17, category: 'Documents', title: 'Marketing Plan 2025', url: 'https://docs.google.com/document', desc: 'แผนการตลาด', accent: '#f97316' },
  { id: 18, category: 'Documents', title: 'Product Catalog', url: 'https://docs.google.com/spreadsheets', desc: 'แคตตาล็อกสินค้า', accent: '#eab308' },
  { id: 19, category: 'Important Links', title: 'บริษัท & ทะเบียน', url: '#', desc: 'เอกสารบริษัท', accent: '#0369a1' },
  { id: 20, category: 'Important Links', title: 'ภาษี & รายงาน', url: '#', desc: 'เอกสารภาษี', accent: '#0284c7' },
  { id: 21, category: 'Important Links', title: 'ติดต่อพาร์ทเนอร์', url: '#', desc: 'รายชื่อซัพพลายเออร์', accent: '#0f766e' },
]

const CATEGORIES = ['ทั้งหมด', 'Marketplace', 'Marketing', 'Operations', 'Finance', 'Team', 'Tools', 'Documents']

const GROUP_STYLES = {
  Marketplace: { gradient: 'linear-gradient(90deg, #fff1df, #ffffff)', icon: ShoppingCart },
  Marketing: { gradient: 'linear-gradient(90deg, #ffe5ef, #ffffff)', icon: Megaphone },
  Operations: { gradient: 'linear-gradient(90deg, #dcfce7, #ffffff)', icon: Settings },
  Finance: { gradient: 'linear-gradient(90deg, #f0e7ff, #ffffff)', icon: Banknote },
  'Tools & Productivity': { gradient: 'linear-gradient(90deg, #dbeafe, #ffffff)', icon: FolderOpen },
  Documents: { gradient: 'linear-gradient(90deg, #fef3c7, #ffffff)', icon: FileText },
  'Important Links': { gradient: 'linear-gradient(90deg, #cffafe, #ffffff)', icon: BookOpen },
}

const CORE_MODULES = [
  { title: 'Orders', desc: 'จัดการคำสั่งซื้อ', icon: ShoppingCart, color: '#2563eb', bg: '#dbeafe' },
  { title: 'Inventory', desc: 'คลังสินค้า', icon: Boxes, color: '#059669', bg: '#d1fae5' },
  { title: 'Calendar', desc: 'ตารางงานและกิจกรรม', icon: CalendarDays, color: '#7c3aed', bg: '#ede9fe' },
  { title: 'Team', desc: 'พนักงานและงาน', icon: Users, color: '#f97316', bg: '#ffedd5' },
  { title: 'Marketing', desc: 'Social & Ads', icon: Megaphone, color: '#db2777', bg: '#fce7f3' },
  { title: 'Reports', desc: 'สรุปผลธุรกิจ', icon: Bell, color: '#0f766e', bg: '#ccfbf1' },
]

const RECENT = [
  ['Shopee Seller Center', '2 นาทีที่แล้ว', '#f05a28'],
  ['Google Sheets (Orders)', '10 นาทีที่แล้ว', '#16a34a'],
  ['Meta Business Suite', '25 นาทีที่แล้ว', '#0b84ee'],
  ['Inventory Sheet', '1 ชั่วโมงที่แล้ว', '#22c55e'],
  ['FlowAccount', '2 ชั่วโมงที่แล้ว', '#0ea5e9'],
]

function readStoredLinks() {
  try {
    const saved = localStorage.getItem(STORE_KEY)
    return saved ? JSON.parse(saved) : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

function AppIcon({ item, size = 36 }) {
  const letter = item.title?.trim()?.[0] || 'L'
  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: 8,
      background: `${item.accent || '#2563eb'}18`,
      color: item.accent || '#2563eb',
      display: 'grid',
      placeItems: 'center',
      fontWeight: 900,
      fontSize: size > 32 ? 15 : 12,
      flexShrink: 0,
    }}>
      {letter}
    </div>
  )
}

function LinkRow({ item, compact = false, editMode, onRemove }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: compact ? '8px 0' : '10px 0' }}>
      <AppIcon item={item} size={compact ? 26 : 34} />
      <a href={item.url} target="_blank" rel="noreferrer" style={{ flex: 1, minWidth: 0, textDecoration: 'none' }}>
        <div style={{ fontSize: 13.5, fontWeight: 850, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</div>
        <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.desc}</div>
      </a>
      {editMode ? (
        <button onClick={() => onRemove(item.id)} title="ลบลิงก์" style={iconButtonStyle}>
          <Trash2 size={14} />
        </button>
      ) : null}
    </div>
  )
}

const iconButtonStyle = {
  width: 32,
  height: 32,
  borderRadius: 8,
  border: '1px solid #dbe3ef',
  background: '#ffffff',
  color: '#475569',
  display: 'grid',
  placeItems: 'center',
  cursor: 'pointer',
  flexShrink: 0,
}

export default function LinksHub() {
  const [links, setLinks] = useState(readStoredLinks)
  const [form, setForm] = useState({ category: 'Marketplace', title: '', url: '', desc: '' })
  const [adding, setAdding] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [activeCategory, setActiveCategory] = useState('ทั้งหมด')
  const [query, setQuery] = useState('')
  const [viewMode, setViewMode] = useState('grid')

  const persist = (next) => {
    setLinks(next)
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(next))
    } catch {
      // localStorage may be unavailable in private or restricted browser modes.
    }
  }

  const addLink = () => {
    if (!form.title || !form.url) return
    persist([...links, { ...form, id: Date.now(), accent: '#2563eb' }])
    setForm({ category: 'Marketplace', title: '', url: '', desc: '' })
    setAdding(false)
  }

  const removeLink = (id) => persist(links.filter((item) => item.id !== id))

  const filteredLinks = useMemo(() => {
    const q = query.trim().toLowerCase()
    return links.filter((item) => {
      const categoryMatch = activeCategory === 'ทั้งหมด'
        || item.category === activeCategory
        || (activeCategory === 'Tools' && item.category === 'Tools & Productivity')
      const textMatch = !q || `${item.title} ${item.desc} ${item.category}`.toLowerCase().includes(q)
      return categoryMatch && textMatch
    })
  }, [activeCategory, links, query])

  const grouped = useMemo(() => {
    return filteredLinks.reduce((acc, item) => {
      const group = item.category || 'Tools & Productivity'
      if (!acc[group]) acc[group] = []
      acc[group].push(item)
      return acc
    }, {})
  }, [filteredLinks])

  return (
    <div style={{ width: '100%', color: '#0f172a' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 22, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: 16, fontWeight: 800, letterSpacing: 0 }}>Links Hub</h1>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>ศูนย์รวมลิงก์งานสำคัญของธุรกิจ</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: '0 1 650px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 280, flex: '1 1 360px', maxWidth: 520, height: 44, display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #dbe3ef', background: '#ffffff', borderRadius: 10, padding: '0 14px', boxShadow: '0 10px 28px rgba(15, 23, 42, 0.05)' }}>
            <Search size={18} color="#334155" />
            <input
              placeholder="Search links..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              style={{ border: 0, outline: 0, background: 'transparent', width: '100%', fontSize: 13.5, color: '#0f172a' }}
            />
          </div>
          <button onClick={() => setAdding((value) => !value)} style={{ height: 42, border: 0, borderRadius: 8, background: '#2563eb', color: '#ffffff', display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', fontWeight: 850, cursor: 'pointer', boxShadow: '0 12px 26px rgba(37, 99, 235, 0.22)' }}>
            <Plus size={17} /> Add Link
          </button>
          <button onClick={() => setEditMode((value) => !value)} style={{ height: 42, border: '1px solid #dbe3ef', borderRadius: 8, background: editMode ? '#eff6ff' : '#ffffff', color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', fontWeight: 800, cursor: 'pointer' }}>
            <Pencil size={15} /> Edit Mode
          </button>
        </div>
      </div>

      {adding && (
        <div className="app-kpi-grid" style={{ background: '#ffffff', border: '1px solid #dbe3ef', borderRadius: 12, boxShadow: '0 18px 44px rgba(15, 23, 42, 0.08)', padding: 16, marginBottom: 20, display: 'grid', gridTemplateColumns: '150px repeat(3, minmax(150px, 1fr)) auto', gap: 10, alignItems: 'center' }}>
          <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} style={fieldStyle}>
            {Object.keys(GROUP_STYLES).map((category) => <option key={category}>{category}</option>)}
          </select>
          <input placeholder="ชื่อลิงก์ *" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} style={fieldStyle} />
          <input placeholder="URL *" value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} style={fieldStyle} />
          <input placeholder="คำอธิบาย" value={form.desc} onChange={(event) => setForm({ ...form, desc: event.target.value })} style={fieldStyle} />
          <button onClick={addLink} style={{ height: 38, border: 0, borderRadius: 8, background: '#2563eb', color: '#ffffff', fontSize: 13, fontWeight: 850, padding: '0 16px', cursor: 'pointer' }}>บันทึก</button>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, borderTop: '1px solid #e2e8f0', paddingTop: 16, marginBottom: 22, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {CATEGORIES.map((category) => {
            const active = activeCategory === category
            return (
              <button key={category} onClick={() => setActiveCategory(category)} style={{
                minWidth: 86,
                height: 34,
                borderRadius: 999,
                border: active ? '1px solid #2563eb' : '1px solid #dbe3ef',
                background: active ? '#2563eb' : '#ffffff',
                color: active ? '#ffffff' : '#0f172a',
                fontSize: 12.5,
                fontWeight: 850,
                cursor: 'pointer',
                boxShadow: active ? '0 10px 24px rgba(37, 99, 235, 0.22)' : '0 8px 20px rgba(15, 23, 42, 0.04)',
              }}>
                {category}
              </button>
            )
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button style={{ border: 0, background: 'transparent', color: '#0f172a', display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
            จัดเรียง: ล่าสุด <ChevronDown size={15} />
          </button>
          <button onClick={() => setViewMode('grid')} style={{ ...iconButtonStyle, background: viewMode === 'grid' ? '#dbeafe' : '#ffffff', color: '#2563eb' }}><Grid3X3 size={16} /></button>
          <button onClick={() => setViewMode('list')} style={{ ...iconButtonStyle, background: viewMode === 'list' ? '#dbeafe' : '#ffffff', color: '#334155' }}><List size={17} /></button>
        </div>
      </div>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 900 }}>Core Modules</h2>
        <div className="app-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(150px, 1fr))', gap: 14 }}>
          {CORE_MODULES.map((module) => {
            const Icon = module.icon
            return (
              <div key={module.title} style={{ minHeight: 148, background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 18, boxShadow: '0 16px 42px rgba(15, 23, 42, 0.06)' }}>
                <div style={{ width: 58, height: 58, borderRadius: 10, background: module.bg, color: module.color, display: 'grid', placeItems: 'center', marginBottom: 14 }}>
                  <Icon size={30} strokeWidth={2.4} />
                </div>
                <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 4 }}>{module.title}</div>
                <div style={{ fontSize: 13, color: '#475569', fontWeight: 650 }}>{module.desc}</div>
                <div style={{ marginTop: 20, fontSize: 13, color: '#172554', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 5 }}>ไปที่ระบบ <ArrowRight size={14} /></div>
              </div>
            )
          })}
        </div>
      </section>

      <div className="app-two-col-fixed" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 336px', gap: 16 }}>
        <div className="app-kpi-grid" style={{ display: 'grid', gridTemplateColumns: viewMode === 'grid' ? 'repeat(3, minmax(230px, 1fr))' : '1fr', gap: 14, alignContent: 'start' }}>
          {Object.entries(grouped).map(([group, items]) => {
            const groupStyle = GROUP_STYLES[group] || GROUP_STYLES['Tools & Productivity']
            const GroupIcon = groupStyle.icon
            return (
              <section key={group} style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', boxShadow: '0 16px 42px rgba(15, 23, 42, 0.06)' }}>
                <div style={{ height: 38, background: groupStyle.gradient, display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', fontSize: 13, fontWeight: 900, color: '#0f172a' }}>
                  <GroupIcon size={16} />
                  {group}
                </div>
                <div style={{ padding: '10px 16px 12px' }}>
                  {items.slice(0, 3).map((item) => <LinkRow key={item.id} item={item} editMode={editMode} onRemove={removeLink} />)}
                  {items.length > 3 && (
                    <button style={{ marginTop: 4, border: 0, background: 'transparent', color: '#2563eb', fontSize: 12.5, fontWeight: 850, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                      ดูทั้งหมด {items.length} ลิงก์ <ArrowRight size={13} />
                    </button>
                  )}
                </div>
              </section>
            )
          })}
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <section style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 18px', boxShadow: '0 16px 42px rgba(15, 23, 42, 0.06)' }}>
            <h2 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 900 }}>Recently Used</h2>
            {RECENT.map(([title, time, color]) => (
              <div key={title} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
                <div style={{ width: 22, height: 22, borderRadius: 6, background: `${color}18`, color, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 900 }}>{title[0]}</div>
                <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
                <div style={{ fontSize: 11.5, color: '#64748b' }}>{time}</div>
              </div>
            ))}
          </section>

          <section style={{ background: '#dbeafe', border: '1px solid #bfdbfe', borderRadius: 12, padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: '#bfdbfe', color: '#2563eb', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <Link2 size={22} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 900 }}>อยากเพิ่มลิงก์ใหม่ไหม?</div>
              <div style={{ fontSize: 12, color: '#334155', marginTop: 3 }}>จัดการลิงก์งานสำคัญให้ทีมเข้าถึงง่าย</div>
            </div>
            <button onClick={() => setAdding(true)} style={{ height: 36, border: 0, borderRadius: 8, background: '#ffffff', color: '#2563eb', fontSize: 12.5, fontWeight: 900, padding: '0 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={15} /> เพิ่มลิงก์
            </button>
          </section>
        </aside>
      </div>

      <div style={{ marginTop: 28, textAlign: 'center', color: '#475569', fontSize: 12 }}>© 2025 Payi Ops • All rights reserved</div>
    </div>
  )
}

const fieldStyle = {
  height: 38,
  border: '1px solid #dbe3ef',
  borderRadius: 8,
  padding: '0 12px',
  fontSize: 13,
  outline: 0,
  background: '#ffffff',
  color: '#0f172a',
}
