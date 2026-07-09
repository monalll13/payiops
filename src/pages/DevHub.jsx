import { Server, Database, Layers, GitBranch } from 'lucide-react'

// หน้าสำหรับ dev / คนใหม่ — อธิบายสถาปัตยกรรมและ endpoint ของระบบ
const sections = [
  {
    icon: Layers,
    title: 'สถาปัตยกรรม',
    items: [
      'Frontend: React 19 + Vite + Recharts (โฮสต์เป็น static บน Vercel)',
      'Backend: Vercel Serverless Functions ในโฟลเดอร์ /api',
      'Database: Google Sheets (mona-ops-db) ผ่าน service account',
      'ทุกอย่างใช้ free tier — ไม่มีค่าใช้จ่าย',
    ],
  },
  {
    icon: Database,
    title: 'โครงสร้างข้อมูล (Google Sheets)',
    items: [
      'raw_orders_YYYY_MM — ออเดอร์ดิบแยกรายเดือน (~190k แถว)',
      'claims — ข้อมูลเคลมสินค้า',
      'product_aliases — จับคู่ชื่อสินค้าจากแพลตฟอร์ม → master_sku',
      'import_log — ประวัติการนำเข้าไฟล์',
    ],
  },
  {
    icon: Server,
    title: 'API Endpoints',
    items: [
      'GET /api/dashboard — สรุป Executive (totals, trends, top SKUs)',
      'GET /api/claims?view=summary|monthly|sku — ข้อมูลเคลม',
      'POST /api/claims-import — นำเข้าไฟล์เคลม',
      'GET /api/sheet-tools?op=summary — สรุปยอดขายรวม',
      'GET /api/sheet-tools?op=sheet&name=... — อ่าน sheet ตรง ๆ',
    ],
  },
  {
    icon: GitBranch,
    title: 'เริ่มพัฒนา',
    items: [
      'npm install — ติดตั้ง dependencies',
      'npm run dev — รันทั้ง frontend + API (localhost:5173)',
      'ต้องมีไฟล์ .env (GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, SHEET_ID)',
      'npm run build — build สำหรับ production',
    ],
  },
]

export default function DevHub() {
  return (
    <div style={{ width: '100%' }}>
      <div style={{ fontSize: 13, color: 'var(--payi-text-muted)', marginBottom: 20 }}>
        คู่มือสำหรับ developer และคนใหม่ที่เข้ามาช่วยพัฒนาระบบ PAYI Ops
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        {sections.map((s) => (
          <div key={s.title} className="payi-glass-card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'var(--payi-mint-soft)', color: 'var(--payi-mint-strong)' }}>
                <s.icon size={17} />
              </span>
              <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--payi-text-strong)' }}>{s.title}</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {s.items.map((it, i) => (
                <li key={i} style={{ fontSize: 12.5, color: 'var(--payi-text)', lineHeight: 1.5 }}>{it}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
