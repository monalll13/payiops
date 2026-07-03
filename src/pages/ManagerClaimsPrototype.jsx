// PROTOTYPE — โหมดผู้จัดการ (มือถือ) หน้างานเคลม · ธีม TREASURE ขาว-ฟ้า
// ยังไม่เชื่อมข้อมูลจริง (ใช้ข้อมูลสมมติด้านล่าง) — เปิดดูที่ /?manager
// ไฟล์นี้แยกจากแอปหลัก ไม่กระทบ control-room เดสก์ท็อป
import { useState } from 'react'
import { Bell, FileText, AlertTriangle, Package, BarChart3, MoreHorizontal } from 'lucide-react'

// ── ธีมสี (จากไลท์สติก TREASURE Ver.2 ขาว-ฟ้า) ──
const C = {
  blue: '#2F6FE0',
  blueDeep: '#1E4FB0',
  blueSoft: '#EAF2FF',
  blueLine: '#D6E4FB',
  page: '#F4F8FF',
  card: '#FFFFFF',
  text: '#16233F',
  muted: '#6B7A99',
  faint: '#98A6C0',
  red: '#E24B4A', redSoft: '#FDECEC',
  amber: '#E8930C', amberSoft: '#FDF3E2',
  green: '#1AA179', greenSoft: '#E4F6F0',
}

// ── ข้อมูลสมมติ (แทน /api/claims + /api/products) ──
const SUMMARY = { claimCount: 47, claimValue: 12400, alertCount: 2 }
const PRODUCTS = [
  { name: 'รองเท้าสลิปเปอร์ขาว', claims: 9, sold: 536, rate: 1.68, level: 'red', label: 'สูงผิดปกติ',
    reasons: 'ส่วนใหญ่ “พื้นลอก” และ “ขาดตอนใส่”', damaged: 6, incomplete: 2, wrong: 1 },
  { name: 'แผ่นกันรองเท้ากัด วงรี', claims: 12, sold: 4398, rate: 0.27, level: 'amber', label: 'เฝ้าดู',
    reasons: 'ส่วนใหญ่ “กาวไม่ค่อยติด”', damaged: 9, incomplete: 2, wrong: 1 },
  { name: 'ถุงเท้าเจล 2in1', claims: 18, sold: 70975, rate: 0.03, level: 'green', label: 'ปกติดี',
    reasons: 'เคลมกระจาย ไม่มีสาเหตุซ้ำ', damaged: 8, incomplete: 6, wrong: 4 },
]
const LEVEL = {
  red: { dot: C.red, soft: C.redSoft, text: C.red },
  amber: { dot: C.amber, soft: C.amberSoft, text: C.amber },
  green: { dot: C.green, soft: C.greenSoft, text: C.green },
}
const fmt = (n) => Number(n || 0).toLocaleString('th-TH')

// ── โลโก้เพชร 4 แฉก (แนว TREASURE Ver.2) ──
function DiamondLogo({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 3 L41 18 L24 45 L7 18 Z" fill={C.blueSoft} stroke={C.blue} strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M7 18 H41 M16 9 L20 18 M32 9 L28 18" stroke={C.blue} strokeWidth="1.4" opacity="0.55" fill="none" />
      <path d="M24 13 L26.4 22 L35 24 L26.4 26 L24 35 L21.6 26 L13 24 L21.6 22 Z" fill={C.blue} />
    </svg>
  )
}

// ── มาสคอต "รุรุ" (RuRu = Haruto + Ruka) การ์ตูนออริจินอล — ผู้ช่วยรายงานเคลม ──
function RuRu({ mood = 'worried', size = 44 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="21" r="12.5" fill="#FBE0C2" />
      <path d="M8 19 Q9 7 20 7 Q31 7 32 19 Q30 12 25.5 11.5 Q24 15 20 14 Q15.5 15 14.5 11.5 Q10 12 8 19 Z" fill="#4A3B2A" />
      <circle cx="15.5" cy="21" r="1.7" fill="#2B2B2B" />
      <circle cx="24.5" cy="21" r="1.7" fill="#2B2B2B" />
      {mood === 'worried'
        ? <path d="M16.5 27 Q20 25 23.5 27" stroke="#B5673A" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        : <path d="M16.5 26 Q20 29 23.5 26" stroke="#B5673A" strokeWidth="1.5" fill="none" strokeLinecap="round" />}
      <circle cx="12.8" cy="24.6" r="1.9" fill="#F6B0A0" opacity="0.6" />
      <circle cx="27.2" cy="24.6" r="1.9" fill="#F6B0A0" opacity="0.6" />
    </svg>
  )
}

export default function ManagerClaimsPrototype() {
  const [openEvidence, setOpenEvidence] = useState(null)

  return (
    <div style={{ minHeight: '100vh', background: C.page, display: 'flex', justifyContent: 'center', fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Noto Sans Thai", sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 430, background: C.page, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ background: C.card, padding: '14px 16px', borderBottom: `1px solid ${C.blueLine}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <DiamondLogo />
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.text, letterSpacing: '0.02em' }}>PAYI Ops</div>
              <div style={{ fontSize: 11, color: C.blue, fontWeight: 600 }}>งานเคลม · สำหรับหัวหน้า Teume</div>
            </div>
          </div>
          <Bell size={20} color={C.muted} />
        </div>

        <div style={{ padding: '14px 14px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* มาสคอตฮารุ รายงานเคลม */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: C.blueSoft, border: `1px solid ${C.blueLine}`, borderRadius: 16, padding: '12px 14px' }}>
            <div style={{ width: 50, height: 50, borderRadius: '50%', background: C.card, border: `2px solid ${C.blue}`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <RuRu mood="worried" size={40} />
            </div>
            <div>
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>
                “หัวหน้าครับ เดือนนี้มี <b style={{ color: C.red }}>{SUMMARY.alertCount} ตัว</b> ที่เคลมสูงผิดปกติ รีบดูหน่อยนะครับ”
              </div>
              <div style={{ fontSize: 11, color: C.faint, marginTop: 4 }}>— รุรุ (RuRu) ผู้ช่วยรายงานเคลม</div>
            </div>
          </div>

          {/* สรุปเคลม 2 การ์ด */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11 }}>
            <div style={{ background: C.card, border: `1px solid ${C.blueLine}`, borderRadius: 16, padding: '13px 15px' }}>
              <div style={{ fontSize: 12, color: C.muted }}>เคลมเดือนนี้</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: C.text, marginTop: 3 }}>{SUMMARY.claimCount} <span style={{ fontSize: 12, color: C.muted, fontWeight: 500 }}>ครั้ง</span></div>
            </div>
            <div style={{ background: C.card, border: `1px solid ${C.blueLine}`, borderRadius: 16, padding: '13px 15px' }}>
              <div style={{ fontSize: 12, color: C.muted }}>มูลค่าเสียหาย</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: C.blue, marginTop: 3 }}>฿{fmt(SUMMARY.claimValue)}</div>
            </div>
          </div>

          {/* สินค้าที่ต้องดูแล */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: C.text }}>สินค้าที่ต้องดูแล</span>
            <span style={{ fontSize: 11, color: C.muted }}>เรียงตามอัตราเคลม</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            {PRODUCTS.map((p) => {
              const lv = LEVEL[p.level]
              const isOpen = openEvidence === p.name
              return (
                <div key={p.name} style={{ background: C.card, border: `1px solid ${p.level === 'green' ? C.blueLine : lv.dot + '55'}`, borderRadius: 16, padding: '13px 15px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: lv.dot, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>เคลม {p.claims} · ขาย {fmt(p.sold)} ชิ้น</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: lv.text }}>{p.rate}%</div>
                      <div style={{ fontSize: 10, color: lv.text, opacity: 0.85 }}>{p.label}</div>
                    </div>
                  </div>

                  <button
                    onClick={() => setOpenEvidence(isOpen ? null : p.name)}
                    style={{ width: '100%', marginTop: 11, fontSize: 13, fontWeight: 700, color: C.blue, background: C.blueSoft, border: `1px solid ${C.blueLine}`, borderRadius: 999, padding: '9px 0', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <FileText size={15} /> {isOpen ? 'ซ่อนรายละเอียด' : 'ดูรายละเอียด'}
                  </button>

                  {isOpen && (
                    <div style={{ marginTop: 12, background: C.blueSoft, borderRadius: 12, padding: 12 }}>
                      <div style={{ fontSize: 12, color: C.text, marginBottom: 10 }}>สาเหตุที่พบบ่อย: <span style={{ color: C.muted }}>{p.reasons}</span></div>
                      {[
                        { label: 'สินค้าเสีย / พัง', n: p.damaged },
                        { label: 'ส่งไม่ครบ', n: p.incomplete },
                        { label: 'ส่งผิดรายการ', n: p.wrong },
                      ].map((row) => (
                        <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                          <span style={{ flex: 1, fontSize: 12, color: C.text }}>{row.label}</span>
                          <div style={{ width: 90, height: 6, borderRadius: 999, background: C.blueLine, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.round((row.n / p.claims) * 100)}%`, height: '100%', background: C.blue }} />
                          </div>
                          <span style={{ width: 44, textAlign: 'right', fontSize: 12, fontWeight: 700, color: C.text }}>{row.n} ครั้ง</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div style={{ textAlign: 'center', fontSize: 11, color: C.faint, marginTop: 4 }}>
            แตะเพชรบนหัวจอรัวๆ มีเซอร์ไพรส์ให้ Teume
          </div>
        </div>

        <div style={{ flex: 1 }} />

        {/* Bottom nav */}
        <div style={{ position: 'sticky', bottom: 0, background: C.card, borderTop: `1px solid ${C.blueLine}`, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', padding: '8px 0 10px' }}>
          {[
            { icon: AlertTriangle, label: 'เคลม', active: true },
            { icon: Package, label: 'สินค้า' },
            { icon: BarChart3, label: 'ยอดขาย' },
            { icon: MoreHorizontal, label: 'เพิ่มเติม' },
          ].map((t) => (
            <div key={t.label} style={{ textAlign: 'center', color: t.active ? C.blue : C.faint }}>
              <t.icon size={21} />
              <div style={{ fontSize: 11, marginTop: 2, fontWeight: t.active ? 700 : 500 }}>{t.label}</div>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}
