import { useEffect, useMemo, useState } from 'react'
import { Plus, Package, CheckCircle2, Circle, Trash2 } from 'lucide-react'

// กระดานงานแพ็กประจำวัน — เก็บในเครื่อง (local-first)
const STORE = 'payi-packing-board'

export default function PackingView() {
  const [tasks, setTasks] = useState([])
  const [text, setText] = useState('')

  useEffect(() => {
    try { setTasks(JSON.parse(localStorage.getItem(STORE) || '[]')) } catch { setTasks([]) }
  }, [])
  const persist = (next) => { setTasks(next); try { localStorage.setItem(STORE, JSON.stringify(next)) } catch {} }

  const add = () => {
    if (!text.trim()) return
    persist([{ id: Date.now(), label: text.trim(), done: false, at: new Date().toISOString() }, ...tasks])
    setText('')
  }
  const toggle = (id) => persist(tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)))
  const remove = (id) => persist(tasks.filter((t) => t.id !== id))
  const clearDone = () => persist(tasks.filter((t) => !t.done))

  const doneCount = useMemo(() => tasks.filter((t) => t.done).length, [tasks])
  const pct = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0

  return (
    <div style={{ width: '100%', maxWidth: 720 }}>
      {/* Progress */}
      <div className="payi-glass-card" style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Package size={20} style={{ color: 'var(--payi-mint-strong)' }} />
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--payi-text-strong)' }}>ความคืบหน้าการแพ็กวันนี้</span>
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--payi-text-muted)' }}>{doneCount}/{tasks.length} · {pct}%</span>
        </div>
        <div style={{ height: 10, borderRadius: 999, background: 'var(--payi-border)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: 'var(--payi-mint)', borderRadius: 999, transition: 'width .4s ease' }} />
        </div>
      </div>

      {/* Add */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <input
          className="payi-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="เพิ่มงานแพ็ก เช่น 'แพ็กออเดอร์ Shopee 20 กล่อง'"
          style={{ flex: 1, padding: '11px 14px', fontSize: 13 }}
        />
        <button onClick={add} className="payi-btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}><Plus size={16} /> เพิ่ม</button>
      </div>

      {/* List */}
      <div className="payi-glass-card" style={{ padding: 4 }}>
        {tasks.length === 0 ? (
          <div style={{ padding: 28, textAlign: 'center', color: 'var(--payi-text-faint)', fontSize: 13 }}>ยังไม่มีงานแพ็ก — เพิ่มด้านบน</div>
        ) : (
          tasks.map((t, i) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderTop: i > 0 ? '1px solid var(--payi-border)' : 'none' }}>
              <button onClick={() => toggle(t.id)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: t.done ? 'var(--payi-success)' : 'var(--payi-text-faint)', display: 'flex' }}>
                {t.done ? <CheckCircle2 size={20} /> : <Circle size={20} />}
              </button>
              <span style={{ flex: 1, fontSize: 13.5, color: t.done ? 'var(--payi-text-faint)' : 'var(--payi-text-strong)', textDecoration: t.done ? 'line-through' : 'none' }}>{t.label}</span>
              <button onClick={() => remove(t.id)} style={{ border: 'none', background: 'transparent', color: 'var(--payi-text-faint)', cursor: 'pointer' }}><Trash2 size={14} /></button>
            </div>
          ))
        )}
      </div>

      {doneCount > 0 && (
        <button onClick={clearDone} style={{ marginTop: 14, border: '1px solid var(--payi-border)', background: 'var(--payi-surface)', color: 'var(--payi-text-muted)', borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          ล้างงานที่แพ็กเสร็จแล้ว ({doneCount})
        </button>
      )}
    </div>
  )
}
