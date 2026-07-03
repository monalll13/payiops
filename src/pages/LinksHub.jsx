import { useEffect, useState } from 'react'
import { ExternalLink, Plus, Trash2 } from 'lucide-react'

// รวมลิงก์ทรัพยากรทั้งหมดไว้ที่เดียว — เก็บใน localStorage (แก้/เพิ่ม/ลบได้)
const DEFAULTS = [
  { id: 1, dept: 'Sales', title: 'Shopee Seller Center', url: 'https://seller.shopee.co.th', desc: 'จัดการร้าน Shopee' },
  { id: 2, dept: 'Sales', title: 'TikTok Shop Seller', url: 'https://seller-th.tiktok.com', desc: 'จัดการร้าน TikTok Shop' },
  { id: 3, dept: 'Sales', title: 'Lazada Seller Center', url: 'https://sellercenter.lazada.co.th', desc: 'จัดการร้าน Lazada' },
  { id: 4, dept: 'Inventory', title: 'Google Sheet ฐานข้อมูล', url: 'https://docs.google.com/spreadsheets', desc: 'mona-ops-db' },
  { id: 5, dept: 'Content', title: 'Google Drive คลิป', url: 'https://drive.google.com', desc: 'คลังวิดีโอ/ครีเอทีฟ' },
  { id: 6, dept: 'Ads', title: 'TikTok Ads Manager', url: 'https://ads.tiktok.com', desc: 'จัดการโฆษณา TikTok' },
  { id: 7, dept: 'HR', title: 'ฟอร์มขอลาหยุด (LINE)', url: '#', desc: 'ระบบลางาน' },
]
const STORE_KEY = 'payi-links-hub'

export default function LinksHub() {
  const [links, setLinks] = useState([])
  const [form, setForm] = useState({ dept: '', title: '', url: '', desc: '' })
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORE_KEY)
      setLinks(saved ? JSON.parse(saved) : DEFAULTS)
    } catch { setLinks(DEFAULTS) }
  }, [])

  const persist = (next) => { setLinks(next); try { localStorage.setItem(STORE_KEY, JSON.stringify(next)) } catch {} }
  const addLink = () => {
    if (!form.title || !form.url) return
    persist([...links, { ...form, id: Date.now(), dept: form.dept || 'อื่นๆ' }])
    setForm({ dept: '', title: '', url: '', desc: '' }); setAdding(false)
  }
  const removeLink = (id) => persist(links.filter((l) => l.id !== id))

  const depts = [...new Set(links.map((l) => l.dept))]

  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ fontSize: 13, color: 'var(--payi-text-muted)' }}>รวม resources ของทีมไว้ที่เดียว — เพิ่ม/ลบได้เอง (เก็บในเครื่อง)</div>
        <button onClick={() => setAdding((v) => !v)} className="payi-btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          <Plus size={15} /> เพิ่มลิงก์
        </button>
      </div>

      {adding && (
        <div className="payi-glass-card" style={{ padding: 16, marginBottom: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr)) auto', gap: 10, alignItems: 'end' }}>
          <input className="payi-input" placeholder="แผนก" value={form.dept} onChange={(e) => setForm({ ...form, dept: e.target.value })} style={{ padding: '9px 12px', fontSize: 13 }} />
          <input className="payi-input" placeholder="ชื่อลิงก์ *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} style={{ padding: '9px 12px', fontSize: 13 }} />
          <input className="payi-input" placeholder="URL *" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} style={{ padding: '9px 12px', fontSize: 13 }} />
          <input className="payi-input" placeholder="คำอธิบาย" value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} style={{ padding: '9px 12px', fontSize: 13 }} />
          <button onClick={addLink} className="payi-btn-primary" style={{ padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>บันทึก</button>
        </div>
      )}

      {depts.map((dept) => (
        <div key={dept} style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--payi-text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>{dept}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {links.filter((l) => l.dept === dept).map((l) => (
              <div key={l.id} className="payi-glass-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 6, position: 'relative' }}>
                <button onClick={() => removeLink(l.id)} title="ลบ" style={{ position: 'absolute', top: 10, right: 10, border: 'none', background: 'transparent', color: 'var(--payi-text-faint)', cursor: 'pointer' }}><Trash2 size={14} /></button>
                <a href={l.url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 700, color: 'var(--payi-mint-strong)', textDecoration: 'none' }}>
                  {l.title} <ExternalLink size={13} />
                </a>
                <div style={{ fontSize: 12, color: 'var(--payi-text-muted)' }}>{l.desc}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
