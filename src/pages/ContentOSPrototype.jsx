import { useMemo, useState } from 'react'
import {
  BarChart3, CalendarDays, ClipboardList, FileSpreadsheet,
  Film, LineChart, Play, Rocket, Sparkles, UploadCloud,
} from 'lucide-react'

const fmt = (n) => Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 0 })
const baht = (n) => `฿${fmt(n)}`

const pages = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3, title: 'Content Dashboard', subtitle: 'ภาพรวม performance จากไฟล์ Video Performance List เดือน June 2026' },
  { id: 'intelligence', label: 'Intelligence', icon: Sparkles, title: 'Performance Intelligence', subtitle: 'ถอด pattern, score, hook และ action จากคลิปที่ชนะ' },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays, title: 'Content Calendar', subtitle: 'ปฏิทินคอนเทนต์รายเดือน 30 วัน จาก insight ที่ระบบแนะนำ' },
  { id: 'detail', label: 'Video Detail', icon: Film, title: 'Video Detail Page', subtitle: 'ดูคลิปชนะรายตัว แล้วแตก hook/script ต่อ' },
  { id: 'upload', label: 'Upload Flow', icon: UploadCloud, title: 'Upload Excel Flow', subtitle: 'mockup การนำเข้า Excel แล้วแปลงเป็น insight' },
  { id: 'brief', label: 'Brief Builder', icon: ClipboardList, title: 'AI Brief Builder', subtitle: 'สร้าง brief ให้ทีมถ่ายคลิปจากสินค้าและ pain point' },
  { id: 'report', label: 'Report', icon: LineChart, title: 'Monthly Report Summary', subtitle: 'สรุปสำหรับเจ้าของแบรนด์และผู้บริหาร' },
  { id: 'roadmap', label: 'Roadmap', icon: Rocket, title: 'MVP Roadmap', subtitle: 'แผนพัฒนาจาก prototype ไปเป็นระบบจริง' },
]

const kpis = [
  { label: 'ยอดวิวรวม', value: '1.93M', note: '209 videos', color: '#bb583c' },
  { label: 'GMV จากวิดีโอ', value: '฿669K', note: 'June 2026', color: '#1f8a83' },
  { label: 'ออเดอร์', value: '4,048', note: 'Attributed SKU orders', color: '#3864a8' },
  { label: 'คลิกสินค้า', value: '57.7K', note: 'CTR avg 3.98%', color: '#b98120' },
]

const patterns = [
  ['ปวดส้นเท้า', 153, 1308686, 530513, 3063, 'ทำเป็น pillar หลัก'],
  ['ปวดรองช้ำ', 108, 1215796, 496259, 2862, 'แตก hook เพิ่ม'],
  ['เดินเยอะ / ยืนนาน', 81, 1620831, 490737, 2660, 'ใช้เปิดคลิป 3 วิแรก'],
  ['ลูกกลิ้งนวดเท้า', 7, 760809, 226173, 1187, 'ทำ sequel'],
  ['ถุงเท้าเจล', 113, 593969, 292946, 1883, 'ทำ comparison'],
]

const topVideos = [
  ['ใครที่เดินเยอะ ยืนนาน หรือปวดรองช้ำ...', 641545, 182844, 965, 'ทำภาคต่อ'],
  ['ถุงเท้าเจลซัพพอร์ตส้นเท้า...', 69936, 68081, 470, 'ทำ A/B hook'],
  ['ปวดเท้า เท้าแบน หรืออุ้งเท้าสูง...', 258526, 33139, 229, 'ปรับ CTA'],
]

const ideas = [
  ['ภาคต่อ: เดินเยอะ ยืนนาน ปวดรองช้ำ ใช้อะไรก่อนดี?', 'Reel'],
  ['เปรียบเทียบ: ลูกกลิ้งนวดเท้า vs ถุงเท้าเจล เหมาะกับใคร', 'Compare'],
  ['ตอบคำถาม: ปวดส้นเท้าตอนเช้าใช่รองช้ำไหม', 'Q&A'],
  ['รีวิวสั้น: ลูกค้าที่ต้องยืนขายของทั้งวัน', 'UGC'],
  ['A/B Hook: ปวดเท้าอย่าปล่อยไว้ vs เดินเยอะต้องมีตัวช่วย', 'Test'],
  ['How-to: วิธีใช้ลูกกลิ้งนวดเท้า 30 วินาทีก่อนนอน', 'Demo'],
  ['Before/After: ใส่ถุงเท้าเจลแล้วเดินสบายขึ้นยังไง', 'Proof'],
]

// แผนโพสต์ทั้งเดือน (mockup) — วันที่ → [ชื่อคอนเทนต์, ชนิด]
const TAG_COLOR = {
  Reel: '#bb583c', Compare: '#3864a8', 'Q&A': '#1f8a83', UGC: '#b98120',
  Test: '#7c3aed', Demo: '#0891b2', Proof: '#16a34a', Live: '#db2777',
  Ads: '#d64545', Restock: '#6b7280', Plan: '#347f75',
}
const calendarPlan = {
  2: [['Reel: เดินเยอะ ยืนนาน ปวดรองช้ำ ใช้อะไรก่อน', 'Reel']],
  3: [['Live: พาช้อปถุงเท้าเจล + โค้ดส่วนลด', 'Live']],
  5: [['Compare: ลูกกลิ้งนวดเท้า vs ถุงเท้าเจล', 'Compare']],
  6: [['Q&A: ปวดส้นเท้าตอนเช้าใช่รองช้ำไหม', 'Q&A']],
  9: [['UGC: แม่ค้ายืนขายทั้งวัน รีวิวจริง', 'UGC']],
  10: [['A/B Hook: ปวดเท้าอย่าปล่อยไว้', 'Test']],
  12: [['Demo: ใช้ลูกกลิ้ง 30 วิ ก่อนนอน', 'Demo']],
  13: [['Live: ศุกร์เย็นดันยอด', 'Live']],
  16: [['Before/After: ใส่ถุงเท้าเจลเดินสบายขึ้น', 'Proof']],
  17: [['Reel: 3 อาการที่ห้ามมองข้าม', 'Reel']],
  19: [['Ads: ดันคลิป Winner ต่อ', 'Ads']],
  20: [['Restock: แผ่นรองเท้าเข้าใหม่', 'Restock']],
  23: [['Compare: แผ่นรองเท้า M vs L เลือกยังไง', 'Compare']],
  24: [['Q&A: กรอบรูปมงคล ตั้งตรงไหนดี', 'Q&A']],
  26: [['Live: สิ้นเดือนเคลียร์สต็อก', 'Live']],
  27: [['UGC: รีวิวลูกค้ากรอบรูป', 'UGC']],
  30: [['สรุปเดือน + วางแผนเดือนหน้า', 'Plan']],
}

const scoreCards = [
  ['96', 'Winner', 'เดินเยอะ ยืนนาน ปวดรองช้ำ', 'GMV สูงสุด ฿182K · ควรทำ sequel 3 เวอร์ชัน'],
  ['88', 'High CTR', 'ถุงเท้าเจลซัพพอร์ตส้นเท้า', 'CTR 7.19% · เหมาะกับ A/B hook และ conversion ads'],
  ['76', 'Fix CTA', 'ปวดเท้า เท้าแบน อุ้งเท้าสูง', 'วิวสูง 258K แต่ขายต่อวิวยังต่ำ · ต้องปิดการขายชัดขึ้น'],
  ['72', 'Scale', 'ลูกกลิ้งนวดเท้า', 'มีแค่ 7 วิดีโอ แต่ GMV ฿226K · เพิ่มจำนวนคลิป'],
]

const hookFormulas = [
  ['Pain First', 'ใครที่ [พฤติกรรม] แล้ว [อาการ]...', 'ใครที่เดินเยอะ ยืนนาน แล้วปวดส้นเท้า ต้องดูตัวนี้'],
  ['Question', '[อาการ] ใช้ตัวไหนดี?', 'ปวดรองช้ำ ใช้ลูกกลิ้งหรือถุงเท้าเจลดีกว่า?'],
  ['Warning', 'อย่าปล่อยให้ [ปัญหา] ลามไปถึง [ผลเสีย]', 'อย่าปล่อยให้ปวดเท้าลามไปถึงเข่าและหลัง'],
  ['Proof', 'ลองตัวนี้แล้ว [ผลลัพธ์] ใน [สถานการณ์]', 'ใส่เดินทั้งวันแล้วสบายขึ้น เพราะมีเจลซัพพอร์ต'],
]

const roadmap = [
  ['Phase 1', 'Import & Dashboard', 'อัปโหลด Excel, อ่าน KPI, แสดง top video, keyword pattern และ monthly summary'],
  ['Phase 2', 'Score & Recommendation', 'คำนวณ content score แยก Winner, High CTR, Fix CTA และสร้าง next action'],
  ['Phase 3', 'AI Brief Builder', 'ให้ AI แตก hook, script, shooting brief และส่งเข้าปฏิทินงานของทีม'],
  ['Phase 4', 'Transcript & Assets', 'เพิ่ม transcript, thumbnail/frame และวิเคราะห์คำพูดจริงในคลิปที่ชนะ'],
]

const dataEntities = [
  ['Video', ['video_id', 'caption', 'published_at', 'creator']],
  ['Performance', ['views', 'gmv', 'orders', 'ctr']],
  ['Product', ['product_name', 'category', 'pain_point', 'price']],
  ['Insight', ['score', 'pattern', 'reason', 'next_action']],
  ['Brief', ['hook', 'script', 'format', 'status']],
]

export default function ContentOSPrototype() {
  const [page, setPage] = useState('dashboard')
  const meta = useMemo(() => pages.find((item) => item.id === page) || pages[0], [page])

  return (
    <div style={styles.shell}>
      <aside style={styles.sidebar}>
        <div style={styles.brand}>
          <div style={styles.brandMark}>C</div>
          <div>
            <div style={styles.brandTitle}>Content OS</div>
            <div style={styles.brandSub}>PAYI performance prototype</div>
          </div>
        </div>
        <div style={styles.navLabel}>Prototype Pages</div>
        <nav style={styles.navList}>
          {pages.map((item) => {
            const Icon = item.icon
            const active = item.id === page
            return (
              <button key={item.id} onClick={() => setPage(item.id)} style={{ ...styles.navItem, ...(active ? styles.navItemActive : null) }}>
                <Icon size={16} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>
      </aside>

      <main style={styles.main}>
        <header style={styles.header}>
          <div>
            <div style={styles.eyebrow}>Content Intelligence Prototype</div>
            <h1 style={styles.title}>{meta.title}</h1>
            <p style={styles.subtitle}>{meta.subtitle}</p>
          </div>
          <div style={styles.headerActions}>
            <button style={styles.secondaryBtn}>Export Mockup</button>
            <button style={styles.primaryBtn}>Create Brief</button>
          </div>
        </header>

        {page === 'dashboard' && <DashboardPage />}
        {page === 'intelligence' && <IntelligencePage />}
        {page === 'calendar' && <CalendarPage />}
        {page === 'detail' && <VideoDetailPage />}
        {page === 'upload' && <UploadPage />}
        {page === 'brief' && <BriefPage />}
        {page === 'report' && <ReportPage />}
        {page === 'roadmap' && <RoadmapPage />}
      </main>
    </div>
  )
}

function DashboardPage() {
  return (
    <div style={styles.stack}>
      <section style={styles.kpiGrid}>
        {kpis.map((item) => <Kpi key={item.label} {...item} />)}
      </section>
      <section style={styles.twoCol}>
        <Card title="Content Workflow" subtitle="สถานะงานทั้งทีมจาก idea ไปถึง posted">
          <div style={styles.pipeline}>
            {['IDEA', 'SCRIPT', 'SHOOT', 'EDIT', 'POSTED'].map((stage, idx) => (
              <div key={stage} style={styles.stage}>
                <div style={styles.stageTitle}>{stage}<span>{[12, 7, 4, 5, 18][idx]}</span></div>
                <Task title={['5 ความเข้าใจผิดเรื่องยิงแอด', 'Hook: โพสต์ทุกวันแต่ยอดไม่ขึ้น', 'Behind the scenes ทีมแพ็กออเดอร์', 'Before / After หน้าเพจ', 'ทำไมโพสต์ขายตรงไม่เวิร์ก'][idx]} tag={['Idea', 'Claude', 'Reel', 'A/B', 'Win'][idx]} />
              </div>
            ))}
          </div>
        </Card>
        <Card title="AI Content Copilot" subtitle="mockup interaction สำหรับสร้าง hook/script">
          <div style={styles.darkBox}>
            <Sparkles size={18} />
            <strong>สร้างไอเดียจากข้อมูลแบรนด์</strong>
            <p>Hook: ใครที่เดินเยอะ ยืนนาน หรือปวดรองช้ำ ต้องลองตัวช่วยนี้ก่อนปวดลามไปถึงเข่า</p>
            <button style={styles.lightBtn}>Generate Hook</button>
          </div>
        </Card>
      </section>
    </div>
  )
}

function IntelligencePage() {
  return (
    <div style={styles.stack}>
      <Card title="Performance Intelligence" subtitle="สรุปจากไฟล์ Video Performance List · 2026-06-01 ถึง 2026-06-30">
        <DataTable columns={['Pattern / Keyword', 'Videos', 'Views', 'GMV', 'Orders', 'Action']} rows={patterns.map((p) => [p[0], p[1], fmt(p[2]), baht(p[3]), fmt(p[4]), p[5]])} />
      </Card>
      <section style={styles.cardGrid4}>{scoreCards.map((item) => <ScoreCard key={item[2]} item={item} />)}</section>
      <section style={styles.twoCol}>
        <Card title="Top Video Plays" subtitle="คลิปจริงที่ควรถอดสูตร">
          <DataTable columns={['Hook', 'Views', 'GMV', 'Orders', 'Action']} rows={topVideos.map((v) => [v[0], fmt(v[1]), baht(v[2]), fmt(v[3]), v[4]])} />
        </Card>
        <Card title="Hook Formula Library" subtitle="สูตรเปิดคลิปที่ AI ควรใช้สร้าง variation">
          <div style={styles.formulaGrid}>{hookFormulas.map((item) => <Formula key={item[0]} item={item} />)}</div>
        </Card>
      </section>
    </div>
  )
}

function CalendarPage() {
  const [mode, setMode] = useState('month')
  const days = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์', 'อาทิตย์']
  const total = Object.values(calendarPlan).reduce((s, arr) => s + arr.length, 0)
  return (
    <Card title="Content Calendar" subtitle={mode === 'month' ? `แผนโพสต์ทั้งเดือน · มิถุนายน 2026 · ${total} โพสต์` : 'ตัวอย่างตารางโพสต์ 7 วัน พร้อมชนิดคอนเทนต์และเป้าหมาย'}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px 0', flexWrap: 'wrap' }}>
        <div style={styles.calToggleWrap}>
          {[['month', 'เดือน (30 วัน)'], ['week', '7 วัน']].map(([id, label]) => (
            <button key={id} onClick={() => setMode(id)} style={{ ...styles.calToggle, ...(mode === id ? styles.calToggleOn : null) }}>{label}</button>
          ))}
        </div>
      </div>
      {mode === 'month' ? (
        <MonthCalendar />
      ) : (
        <div style={styles.calendar}>{days.map((day, idx) => <div key={day} style={styles.day}><strong>{day}<span>{String(idx + 6).padStart(2, '0')}</span></strong><p>{ideas[idx][0]}</p><span style={styles.chip}>{ideas[idx][1]}</span></div>)}</div>
      )}
    </Card>
  )
}

function MonthCalendar() {
  const weekdays = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา']
  const year = 2026, month = 5 // มิถุนายน (0-indexed)
  const firstDow = new Date(year, month, 1).getDay()       // 0 = อาทิตย์
  const lead = (firstDow + 6) % 7                            // ปรับให้เริ่มวันจันทร์
  const daysInMonth = new Date(year, month + 1, 0).getDate() // 30
  const cells = []
  for (let i = 0; i < lead; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7) cells.push(null)

  const legendTags = [...new Set(Object.values(calendarPlan).flat().map(([, tag]) => tag))]

  return (
    <div style={{ padding: 16 }}>
      <div style={styles.legend}>
        {legendTags.map((tag) => (
          <span key={tag} style={styles.legendItem}><i style={{ background: TAG_COLOR[tag] || '#94a3b8' }} />{tag}</span>
        ))}
      </div>
      <div style={styles.monthHead}>{weekdays.map((w) => <div key={w} style={styles.weekday}>{w}</div>)}</div>
      <div style={styles.monthGrid}>
        {cells.map((d, i) => (
          <div key={i} style={{ ...styles.monthCell, ...(d ? null : styles.monthCellEmpty) }}>
            {d && (
              <>
                <div style={styles.dateNum}>{d}</div>
                <div style={styles.postList}>
                  {(calendarPlan[d] || []).map(([text, tag], j) => (
                    <div key={j} style={styles.post} title={text}>
                      <span style={{ ...styles.postDot, background: TAG_COLOR[tag] || '#94a3b8' }} />
                      <span style={styles.postText}>{text}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function VideoDetailPage() {
  return (
    <div style={styles.stack}>
      <Card title="Video Detail Page" subtitle="ถอดสูตรจากคลิป Top GMV">
        <div style={styles.detailHero}>
          <div style={styles.videoPreview}><Play size={36} /><strong>ใครที่เดินเยอะ ยืนนาน หรือปวดรองช้ำ ต้องลองตัวนี้เลย “ลูกกลิ้งนวดเท้า”</strong></div>
          <div style={styles.stack}>
            <section style={styles.kpiGrid2}>
              <MiniMetric label="Views" value="641,545" />
              <MiniMetric label="GMV" value="฿182,844" />
              <MiniMetric label="Orders" value="965" />
              <MiniMetric label="Product Clicks" value="14,292" />
            </section>
            <InfoBox title="Why It Won" lines={['เปิดด้วย pain point ชัด: เดินเยอะ, ยืนนาน, ปวดรองช้ำ', 'สินค้าเข้าใจง่ายและเห็นวิธีใช้ได้ทันที', 'ปัญหากว้างพอสำหรับแม่ค้า พนักงานยืนทำงาน และคนเดินเยอะ']} />
            <InfoBox title="Next Action" lines={['ทำภาคต่อ 3 คลิป: อาการตอนเช้า, ยืนขายของทั้งวัน, วิธีใช้ก่อนนอน', 'ทดสอบ CTA ระหว่าง “กดตะกร้า” กับ “ทักแชทถามอาการ”']} />
          </div>
        </div>
      </Card>
      <section style={styles.threeCol}>
        <ScriptCard title="Hook Variation 1" text="ถ้าคุณตื่นมาแล้วเจ็บส้นเท้าก้าวแรก ลองเช็กอาการนี้ก่อน" />
        <ScriptCard title="Hook Variation 2" text="ยืนขายของทั้งวันแล้วปวดฝ่าเท้า อย่าเพิ่งทน ลองตัวช่วยนวดเท้าแบบนี้" />
        <ScriptCard title="Script Brief" text="เปิดปัญหา 3 วิแรก → โชว์จุดที่ปวด → สาธิตลูกกลิ้ง 2 ท่า → CTA" />
      </section>
    </div>
  )
}

function UploadPage() {
  return (
    <div style={styles.stack}>
      <Card title="Upload Excel Flow" subtitle="นำไฟล์ performance เข้า dashboard">
        <div style={styles.uploadZone}>
          <FileSpreadsheet size={34} />
          <strong>ลากไฟล์ Video Performance List มาวางตรงนี้</strong>
          <p>ระบบจะอ่านหัวตาราง อัปเดต KPI หา Top Video ดึง keyword ที่ชนะ และสร้าง recommendation ให้ทันที</p>
          <div style={styles.chips}><span>พบ 209 videos</span><span>30 columns</span><span>5 winning patterns</span><span>พร้อมวิเคราะห์</span></div>
        </div>
      </Card>
      <Card title="Data Pipeline Mockup" subtitle="ขั้นตอนถ้าพัฒนาต่อให้ระบบรับไฟล์เอง">
        <div style={styles.flow}>{['Upload', 'Clean Data', 'Score', 'Extract Pattern', 'Recommend'].map((step, idx) => <FlowStep key={step} index={idx + 1} title={step} />)}</div>
      </Card>
    </div>
  )
}

function BriefPage() {
  return (
    <Card title="AI Brief Builder" subtitle="เลือกสินค้า pain point และเป้าหมาย แล้วสร้าง brief">
      <div style={styles.briefGrid}>
        <div style={styles.formPanel}>
          {['สินค้า: ลูกกลิ้งนวดเท้า', 'Pain Point: เดินเยอะ / ยืนนาน / ปวดรองช้ำ', 'เป้าหมาย: เพิ่มออเดอร์', 'รูปแบบ: Reel / TikTok 25 วินาที'].map((item) => <div key={item} style={styles.field}>{item}</div>)}
        </div>
        <div style={styles.briefOutput}>
          <h3>Generated Shooting Brief</h3>
          <ol>
            <li>เปิดคลิป: “ใครที่เดินเยอะ ยืนนาน แล้วปวดรองช้ำ...”</li>
            <li>ช็อต 1: ถ่ายอาการเจ็บส้นเท้าหรือฝ่าเท้าหลังยืนทำงาน</li>
            <li>ช็อต 2: สาธิตการใช้ลูกกลิ้ง 2 ท่าง่าย ๆ</li>
            <li>CTA: “กดตะกร้าไว้ลอง หรือทักมาถามอาการก่อนได้”</li>
          </ol>
        </div>
      </div>
    </Card>
  )
}

function ReportPage() {
  return (
    <Card title="Monthly Report Summary" subtitle="สรุปสำหรับเจ้าของแบรนด์">
      <div style={styles.reportGrid}>
        <div style={styles.reportSummary}><span style={styles.chip}>June 2026</span><h2>คอนเทนต์เดือนนี้ทำยอดขายได้ ฿669K จาก 209 วิดีโอ</h2><p>สัญญาณชัดที่สุดคือ pain point ปวดส้นเท้า ปวดรองช้ำ เดินเยอะ และยืนนาน โดยคลิปลูกกลิ้งนวดเท้าเป็นตัวชนะหลัก</p></div>
        <ul style={styles.priorityList}>{['ทำ sequel ให้คลิปลูกกลิ้งนวดเท้า', 'ใช้ “เดินเยอะ / ยืนนาน / ปวดรองช้ำ” เป็น hook หลัก', 'ทำ A/B test สำหรับถุงเท้าเจล', 'ปรับ CTA ในคลิปวิวสูงแต่ขายต่ำ'].map((item, idx) => <li key={item}><b>{idx + 1}</b><span>{item}</span></li>)}</ul>
      </div>
    </Card>
  )
}

function RoadmapPage() {
  return (
    <div style={styles.stack}>
      <section style={styles.cardGrid4}>{roadmap.map((item) => <RoadmapCard key={item[0]} item={item} />)}</section>
      <Card title="Core Data Model" subtitle="ตารางข้อมูลหลักที่ระบบควรมี">
        <div style={styles.entityGrid}>{dataEntities.map((entity) => <div key={entity[0]} style={styles.entity}><strong>{entity[0]}</strong><ul>{entity[1].map((field) => <li key={field}>{field}</li>)}</ul></div>)}</div>
      </Card>
    </div>
  )
}

function Card({ title, subtitle, children }) {
  return <section style={styles.card}><div style={styles.cardHead}><div><h2>{title}</h2><p>{subtitle}</p></div></div>{children}</section>
}

function Kpi({ label, value, note, color }) {
  return <article style={styles.kpi}><div style={styles.metricHead}><span>{label}</span><span style={{ color }}>{note}</span></div><strong>{value}</strong><div style={styles.spark}>{[24, 36, 42, 58, 64, 78].map((h, idx) => <i key={idx} style={{ height: `${h}%`, background: color }} />)}</div></article>
}

function MiniMetric({ label, value }) { return <div style={styles.miniMetric}><small>{label}</small><strong>{value}</strong></div> }
function Task({ title, tag }) { return <div style={styles.task}><strong>{title}</strong><span style={styles.chip}>{tag}</span></div> }
function ScoreCard({ item }) { return <article style={styles.scoreCard}><div><b>{item[0]}</b><span style={styles.chip}>{item[1]}</span></div><strong>{item[2]}</strong><p>{item[3]}</p></article> }
function Formula({ item }) { return <article style={styles.formula}><span style={styles.chip}>{item[0]}</span><code>{item[1]}</code><p>{item[2]}</p></article> }
function ScriptCard({ title, text }) { return <article style={styles.script}><strong>{title}</strong><p>{text}</p></article> }
function FlowStep({ index, title }) { return <article style={styles.flowStep}><b>{index}</b><strong>{title}</strong><p>{['นำเข้าไฟล์ performance', 'อ่านคอลัมน์สำคัญ', 'คำนวณ content score', 'ดึง pain point/hook', 'เสนอ action ถัดไป'][index - 1]}</p></article> }
function RoadmapCard({ item }) { return <article style={styles.roadmap}><span>{item[0]}</span><strong>{item[1]}</strong><p>{item[2]}</p></article> }
function InfoBox({ title, lines }) { return <section style={styles.info}><strong>{title}</strong><ul>{lines.map((line) => <li key={line}>{line}</li>)}</ul></section> }
function DataTable({ columns, rows }) { return <div style={styles.tableWrap}><table style={styles.table}><thead><tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={`${i}-${j}`}>{cell}</td>)}</tr>)}</tbody></table></div> }

const styles = {
  shell: { display: 'grid', gridTemplateColumns: '238px minmax(0, 1fr)', minHeight: 'calc(100vh - 40px)', gap: 18 },
  sidebar: { background: 'rgba(255,255,255,.76)', border: '1px solid var(--payi-line)', borderRadius: 12, padding: 16, alignSelf: 'start', position: 'sticky', top: 18, boxShadow: 'var(--payi-shadow)' },
  brand: { display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 16, borderBottom: '1px solid var(--payi-line)', marginBottom: 14 },
  brandMark: { width: 38, height: 38, borderRadius: 10, display: 'grid', placeItems: 'center', background: '#f3dfd7', color: '#9c3f29', fontWeight: 900 },
  brandTitle: { fontWeight: 900, color: 'var(--payi-text-strong)' },
  brandSub: { fontSize: 11, color: 'var(--payi-text-muted)' },
  navLabel: { fontSize: 11, color: 'var(--payi-text-faint)', fontWeight: 800, textTransform: 'uppercase', marginBottom: 8 },
  navList: { display: 'grid', gap: 6 },
  navItem: { border: 0, background: 'transparent', color: 'var(--payi-text)', minHeight: 38, borderRadius: 8, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', textAlign: 'left', fontWeight: 700 },
  navItemActive: { background: 'var(--payi-mint-soft)', color: 'var(--payi-mint-strong)' },
  main: { minWidth: 0 },
  header: { display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', marginBottom: 16 },
  eyebrow: { fontSize: 11, fontWeight: 900, color: 'var(--payi-mint-strong)', textTransform: 'uppercase', marginBottom: 6 },
  title: { margin: 0, fontSize: 32, letterSpacing: 0, color: 'var(--payi-text-strong)' },
  subtitle: { margin: '7px 0 0', color: 'var(--payi-text-muted)', fontSize: 13 },
  headerActions: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  primaryBtn: { border: 0, background: 'var(--payi-mint)', color: '#fff', borderRadius: 8, minHeight: 38, padding: '9px 13px', fontWeight: 800 },
  secondaryBtn: { border: '1px solid var(--payi-border)', background: 'var(--payi-surface)', color: 'var(--payi-text)', borderRadius: 8, minHeight: 38, padding: '9px 13px', fontWeight: 800 },
  stack: { display: 'grid', gap: 16 },
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 },
  kpiGrid2: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 },
  kpi: { background: 'var(--payi-surface)', border: '1px solid var(--payi-border)', borderRadius: 8, padding: 15, minHeight: 126, boxShadow: '0 8px 28px rgba(38,63,61,.06)' },
  metricHead: { display: 'flex', justifyContent: 'space-between', gap: 10, color: 'var(--payi-text-muted)', fontSize: 12, marginBottom: 12 },
  spark: { height: 32, display: 'flex', alignItems: 'end', gap: 4, marginTop: 14 },
  card: { background: 'rgba(255,255,255,.82)', border: '1px solid var(--payi-border)', borderRadius: 12, boxShadow: 'var(--payi-shadow)', overflow: 'hidden' },
  cardHead: { padding: '14px 16px', borderBottom: '1px solid var(--payi-border)', background: 'var(--payi-surface-muted)' },
  twoCol: { display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(320px, .8fr)', gap: 16 },
  threeCol: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 },
  cardGrid4: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 },
  pipeline: { display: 'grid', gridTemplateColumns: 'repeat(5, minmax(130px, 1fr))', gap: 10, padding: 16, overflowX: 'auto' },
  stage: { background: 'var(--payi-surface-muted)', border: '1px solid var(--payi-border)', borderRadius: 8, padding: 10, minHeight: 190 },
  stageTitle: { display: 'flex', justifyContent: 'space-between', color: 'var(--payi-text-muted)', fontSize: 12, fontWeight: 900, marginBottom: 10 },
  task: { background: '#fff', border: '1px solid var(--payi-border)', borderRadius: 8, padding: 10, display: 'grid', gap: 8, fontSize: 12 },
  darkBox: { background: 'var(--payi-surface-dark)', color: '#fff', borderRadius: 8, padding: 16, margin: 16, display: 'grid', gap: 10 },
  lightBtn: { border: 0, borderRadius: 8, minHeight: 36, background: '#fff', color: 'var(--payi-text-strong)', fontWeight: 800 },
  chip: { display: 'inline-flex', width: 'fit-content', background: 'var(--payi-mint-soft)', color: 'var(--payi-mint-strong)', borderRadius: 999, padding: '4px 8px', fontSize: 11, fontWeight: 900 },
  tableWrap: { overflowX: 'auto', padding: 16 },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: 680, fontSize: 12 },
  scoreCard: { background: '#fff', border: '1px solid var(--payi-border)', borderRadius: 8, padding: 13, display: 'grid', gap: 8 },
  formulaGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, padding: 16 },
  formula: { border: '1px solid var(--payi-border)', borderRadius: 8, background: '#fff', padding: 12, display: 'grid', gap: 8 },
  calendar: { display: 'grid', gridTemplateColumns: 'repeat(7, minmax(120px, 1fr))', gap: 10, padding: 16, overflowX: 'auto' },
  day: { background: '#fff', border: '1px solid var(--payi-border)', borderRadius: 8, padding: 10, minHeight: 140 },
  detailHero: { display: 'grid', gridTemplateColumns: 'minmax(280px, .9fr) minmax(0, 1.1fr)', gap: 16, padding: 16 },
  videoPreview: { minHeight: 340, borderRadius: 8, background: 'linear-gradient(145deg, rgba(36,63,62,.78), rgba(95,191,175,.26)), linear-gradient(160deg, #d9b79e, #f5eee6 45%, #8ab0ad)', color: '#fff', display: 'grid', placeItems: 'center', textAlign: 'center', padding: 20 },
  miniMetric: { background: '#fff', border: '1px solid var(--payi-border)', borderRadius: 8, padding: 12 },
  info: { background: '#fff', border: '1px solid var(--payi-border)', borderRadius: 8, padding: 12 },
  script: { background: '#fff', border: '1px solid var(--payi-border)', borderRadius: 8, padding: 13 },
  uploadZone: { margin: 16, minHeight: 190, border: '1.5px dashed var(--payi-border)', borderRadius: 8, background: '#fff', display: 'grid', placeItems: 'center', textAlign: 'center', padding: 22, gap: 8 },
  chips: { display: 'flex', gap: 7, flexWrap: 'wrap', justifyContent: 'center' },
  flow: { display: 'grid', gridTemplateColumns: 'repeat(5, minmax(130px, 1fr))', gap: 10, padding: 16, overflowX: 'auto' },
  flowStep: { background: '#fff', border: '1px solid var(--payi-border)', borderRadius: 8, padding: 12 },
  briefGrid: { display: 'grid', gridTemplateColumns: 'minmax(260px, .82fr) minmax(0, 1.18fr)', gap: 16, padding: 16 },
  formPanel: { display: 'grid', gap: 10 },
  field: { background: '#fff', border: '1px solid var(--payi-border)', borderRadius: 8, padding: 12, fontSize: 13, fontWeight: 800 },
  briefOutput: { background: 'var(--payi-surface-dark)', color: '#fff', borderRadius: 8, padding: 16, lineHeight: 1.7 },
  reportGrid: { display: 'grid', gridTemplateColumns: 'minmax(0, .95fr) minmax(280px, 1.05fr)', gap: 16, padding: 16 },
  reportSummary: { background: '#fff', border: '1px solid var(--payi-border)', borderRadius: 8, padding: 16 },
  priorityList: { margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 10 },
  roadmap: { background: '#fff', border: '1px solid var(--payi-border)', borderRadius: 8, padding: 13, display: 'grid', gap: 8 },
  entityGrid: { display: 'grid', gridTemplateColumns: 'repeat(5, minmax(140px, 1fr))', gap: 10, padding: 16, overflowX: 'auto' },
  entity: { background: '#fff', border: '1px solid var(--payi-border)', borderRadius: 8, padding: 12 },
  calToggleWrap: { display: 'flex', gap: 4, background: 'var(--payi-surface-muted)', padding: 3, borderRadius: 9 },
  calToggle: { border: 0, background: 'transparent', color: 'var(--payi-text-muted)', borderRadius: 7, padding: '6px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' },
  calToggleOn: { background: '#fff', color: 'var(--payi-text-strong)', boxShadow: '0 1px 3px rgba(15,23,42,.08)' },
  legend: { display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 },
  legendItem: { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: 'var(--payi-text-muted)' },
  monthHead: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, marginBottom: 8 },
  weekday: { textAlign: 'center', fontSize: 12, fontWeight: 800, color: 'var(--payi-text-muted)' },
  monthGrid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 },
  monthCell: { background: '#fff', border: '1px solid var(--payi-border)', borderRadius: 8, minHeight: 108, padding: 8, display: 'flex', flexDirection: 'column', gap: 6, overflow: 'hidden' },
  monthCellEmpty: { background: 'transparent', border: '1px solid transparent' },
  dateNum: { fontSize: 12, fontWeight: 800, color: 'var(--payi-text-strong)' },
  postList: { display: 'grid', gap: 4 },
  post: { display: 'flex', alignItems: 'flex-start', gap: 5, background: 'var(--payi-surface-muted)', borderRadius: 6, padding: '3px 6px' },
  postDot: { width: 7, height: 7, borderRadius: 2, flexShrink: 0, marginTop: 3 },
  postText: { fontSize: 10, lineHeight: 1.3, color: 'var(--payi-text)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' },
}
