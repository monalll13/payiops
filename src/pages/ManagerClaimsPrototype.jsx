// โหมดผู้จัดการ (มือถือ) — หน้างานเคลม · ธีม TREASURE ขาว-ฟ้า
// ต่อข้อมูลจริงแล้ว: ดึงจาก /api/manager-claims (เคลมรายกลุ่ม ÷ ยอดขาย = อัตราเคลม%)
// เปิดดูที่ /?manager · แยกจากแอปหลัก ไม่กระทบ control-room เดสก์ท็อป
import { useEffect, useState } from 'react'
import { Bell, FileText, AlertTriangle, Package, BarChart3, MoreHorizontal, Loader2 } from 'lucide-react'

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
const LEVEL = {
  red: { dot: C.red, text: C.red, label: 'สูงผิดปกติ' },
  amber: { dot: C.amber, text: C.amber, label: 'เฝ้าดู' },
  green: { dot: C.green, text: C.green, label: 'ปกติดี' },
  low: { dot: C.faint, text: C.faint, label: 'ข้อมูลน้อย' },
}
const fmt = (n) => Number(n || 0).toLocaleString('th-TH')
const THAI_MONTH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const monthLabel = (ym) => THAI_MONTH[parseInt(String(ym).slice(5, 7), 10) - 1] || ym
const reasonOf = (p) => {
  const arr = [['สินค้าเสีย / พัง', p.damaged], ['ส่งไม่ครบ', p.incomplete], ['ส่งผิดรายการ', p.wrong]].sort((a, b) => b[1] - a[1])
  return arr[0][1] > 0 ? `ส่วนใหญ่เป็น “${arr[0][0]}”` : 'ยังไม่ระบุสาเหตุชัดเจน'
}

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
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [open, setOpen] = useState(null)

  useEffect(() => {
    let alive = true
    setLoading(true); setError(null)
    fetch('/api/manager-claims')
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return
        if (!d.success) throw new Error(d.error)
        setData(d)
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [])

  const summary = data?.summary || {}
  const alertCount = summary.alertCount || 0
  // แสดงเฉพาะที่ "ต้องดูแล" (แดง/เหลือง) — เขียว/ข้อมูลน้อย ไม่กวนสายตา
  const watchList = (data?.products || []).filter((p) => p.level === 'red' || p.level === 'amber')
  const mood = alertCount > 0 ? 'worried' : 'happy'

  const total = summary.claimCount || 0
  const pct = (n) => (total > 0 ? Math.round((n / total) * 100) : 0)
  const typeRows = [
    { label: 'สินค้าเสีย / พัง', n: summary.damaged || 0, color: C.red },
    { label: 'ส่งไม่ครบชิ้น', n: summary.incomplete || 0, color: C.amber },
    { label: 'คลังส่งของผิด', n: summary.wrong || 0, color: C.blue },
  ]
  const monthly = data?.monthly || []
  const maxMonth = Math.max(1, ...monthly.map((m) => m.count))

  const speech = loading
    ? 'กำลังดูข้อมูลเคลมให้อยู่ครับ...'
    : error
      ? 'ขอโทษครับ ตอนนี้ดึงข้อมูลไม่ได้ ลองใหม่อีกครั้งนะครับ'
      : alertCount > 0
        ? <>หัวหน้าครับ ตอนนี้มี <b style={{ color: C.red }}>{alertCount} ตัว</b> ที่เคลมสูงผิดปกติ รีบดูหน่อยนะครับ</>
        : 'เยี่ยมเลยครับ ตอนนี้ไม่มีสินค้าตัวไหนน่าห่วงครับ'

  return (
    <div style={{ minHeight: '100vh', background: C.page, display: 'flex', justifyContent: 'center', fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Noto Sans Thai", sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 430, background: C.page, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ background: C.card, padding: '14px 16px', borderBottom: `1px solid ${C.blueLine}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <DiamondLogo />
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.text, letterSpacing: '0.02em' }}>Payi Ops</div>
              <div style={{ fontSize: 11, color: C.blue, fontWeight: 600 }}>งานเคลม · สำหรับหัวหน้า Teume</div>
            </div>
          </div>
          <Bell size={20} color={C.muted} />
        </div>

        <div style={{ padding: '14px 14px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* มาสคอตรุรุ รายงานเคลม */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: C.blueSoft, border: `1px solid ${C.blueLine}`, borderRadius: 16, padding: '12px 14px' }}>
            <div style={{ width: 50, height: 50, borderRadius: '50%', background: C.card, border: `2px solid ${C.blue}`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <RuRu mood={mood} size={40} />
            </div>
            <div>
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>“{speech}”</div>
              <div style={{ fontSize: 11, color: C.faint, marginTop: 4 }}>— รุรุ (RuRu) ผู้ช่วยรายงานเคลม</div>
            </div>
          </div>

          {/* สรุปเคลม 2 การ์ด */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11 }}>
            <div style={{ background: C.card, border: `1px solid ${C.blueLine}`, borderRadius: 16, padding: '13px 15px' }}>
              <div style={{ fontSize: 12, color: C.muted }}>เคลมทั้งหมด</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: C.text, marginTop: 3 }}>{loading ? '—' : fmt(summary.claimCount)} <span style={{ fontSize: 12, color: C.muted, fontWeight: 500 }}>ครั้ง</span></div>
            </div>
            <div style={{ background: C.card, border: `1px solid ${C.blueLine}`, borderRadius: 16, padding: '13px 15px' }}>
              <div style={{ fontSize: 12, color: C.muted }}>มูลค่าเสียหาย</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: C.blue, marginTop: 3 }}>{loading ? '—' : '฿' + fmt(summary.claimValue)}</div>
            </div>
          </div>

          {/* แยกประเภทเคลม (ทั้งหมด) */}
          {!loading && !error && (
            <div style={{ background: C.card, border: `1px solid ${C.blueLine}`, borderRadius: 16, padding: '14px 15px' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 12 }}>แยกตามประเภทเคลม</div>
              {typeRows.map((row) => (
                <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span style={{ flex: 1, fontSize: 13, color: C.text }}>{row.label}</span>
                  <div style={{ width: 84, height: 7, borderRadius: 999, background: C.blueSoft, overflow: 'hidden' }}>
                    <div style={{ width: `${pct(row.n)}%`, height: '100%', background: row.color }} />
                  </div>
                  <span style={{ width: 66, textAlign: 'right', fontSize: 13, color: C.text }}>
                    <b>{fmt(row.n)}</b> <span style={{ color: C.muted, fontSize: 11 }}>{pct(row.n)}%</span>
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* แนวโน้มเคลมรายเดือน */}
          {!loading && !error && monthly.length > 1 && (
            <div style={{ background: C.card, border: `1px solid ${C.blueLine}`, borderRadius: 16, padding: '14px 15px' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 14 }}>แนวโน้มเคลมรายเดือน</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, height: 96 }}>
                {monthly.map((m) => (
                  <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{m.count}</div>
                    <div style={{ width: '70%', height: `${Math.round((m.count / maxMonth) * 66)}px`, minHeight: 4, borderRadius: 6, background: C.blue }} />
                    <div style={{ fontSize: 10, color: C.muted }}>{monthLabel(m.month)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* สินค้าที่ต้องดูแล */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: C.text }}>สินค้าที่ต้องดูแล</span>
            <span style={{ fontSize: 11, color: C.muted }}>เรียงตามอัตราเคลม</span>
          </div>

          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '30px 0', color: C.muted, fontSize: 13 }}>
              <Loader2 size={18} className="payi-spin" /> กำลังโหลด...
            </div>
          )}

          {error && !loading && (
            <div style={{ background: C.redSoft, border: `1px solid ${C.red}44`, borderRadius: 14, padding: 16, fontSize: 13, color: C.red, textAlign: 'center' }}>
              โหลดข้อมูลไม่สำเร็จ: {error}
            </div>
          )}

          {!loading && !error && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {watchList.map((p) => {
                const lv = LEVEL[p.level]
                const isOpen = open === p.key
                return (
                  <div key={p.key} style={{ background: C.card, border: `1px solid ${lv.dot}55`, borderRadius: 16, padding: '13px 15px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: lv.dot, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{p.label}</div>
                        <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>เคลม {p.claims} · ขาย {fmt(p.units)} ชิ้น</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 16, fontWeight: 800, color: lv.text }}>{p.rate}%</div>
                        <div style={{ fontSize: 10, color: lv.text, opacity: 0.85 }}>{lv.label}</div>
                      </div>
                    </div>

                    <button
                      onClick={() => setOpen(isOpen ? null : p.key)}
                      style={{ width: '100%', marginTop: 11, fontSize: 13, fontWeight: 700, color: C.blue, background: C.blueSoft, border: `1px solid ${C.blueLine}`, borderRadius: 999, padding: '9px 0', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <FileText size={15} /> {isOpen ? 'ซ่อนรายละเอียด' : 'ดูรายละเอียด'}
                    </button>

                    {isOpen && (
                      <div style={{ marginTop: 12, background: C.blueSoft, borderRadius: 12, padding: 12 }}>
                        <div style={{ fontSize: 12, color: C.text, marginBottom: 10 }}>สาเหตุ: <span style={{ color: C.muted }}>{reasonOf(p)}</span></div>
                        {[
                          { label: 'สินค้าเสีย / พัง', n: p.damaged },
                          { label: 'ส่งไม่ครบ', n: p.incomplete },
                          { label: 'ส่งผิดรายการ', n: p.wrong },
                        ].map((row) => (
                          <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                            <span style={{ flex: 1, fontSize: 12, color: C.text }}>{row.label}</span>
                            <div style={{ width: 90, height: 6, borderRadius: 999, background: C.blueLine, overflow: 'hidden' }}>
                              <div style={{ width: `${p.claims ? Math.round((row.n / p.claims) * 100) : 0}%`, height: '100%', background: C.blue }} />
                            </div>
                            <span style={{ width: 44, textAlign: 'right', fontSize: 12, fontWeight: 700, color: C.text }}>{row.n} ครั้ง</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}

              {watchList.length === 0 && (
                <div style={{ background: C.greenSoft, border: `1px solid ${C.green}44`, borderRadius: 14, padding: 18, fontSize: 13, color: C.green, textAlign: 'center' }}>
                  ไม่มีสินค้าที่ต้องดูแลตอนนี้ 🎉
                </div>
              )}

              {summary.lowDataCount > 0 && (
                <div style={{ fontSize: 11, color: C.faint, textAlign: 'center', marginTop: 2 }}>
                  + อีก {summary.lowDataCount} รายการยอดขายยังน้อย (ข้อมูลไม่พอชี้ขาด) ไม่นับรวม
                </div>
              )}
            </div>
          )}
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
