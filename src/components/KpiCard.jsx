import { TrendingUp, TrendingDown } from 'lucide-react'

// KPI การ์ดสำหรับหน้า Executive
// props: title, value, subtitle, icon (lucide component), trend (string เช่น "+12%" หรือ null), isPositive
export default function KpiCard({ title, value, subtitle, icon: Icon, trend, isPositive = true }) {
  return (
    <div
      className="payi-glass-card"
      style={{
        padding: '20px 22px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        minHeight: 150,
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--payi-text-muted)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          {title}
        </span>
        {Icon && (
          <span
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              display: 'grid',
              placeItems: 'center',
              background: 'var(--payi-mint-soft)',
              color: 'var(--payi-mint-strong)',
              flexShrink: 0,
            }}
          >
            <Icon size={17} />
          </span>
        )}
      </div>

      <div style={{ fontSize: 26, fontWeight: 850, color: 'var(--payi-text-strong)', letterSpacing: '-0.01em' }}>
        {value}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto' }}>
        {trend && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 12,
              fontWeight: 800,
              padding: '2px 8px',
              borderRadius: 999,
              color: isPositive ? 'var(--payi-success)' : 'var(--payi-danger)',
              background: isPositive ? 'var(--payi-success-bg)' : 'var(--payi-danger-bg)',
            }}
          >
            {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {trend}
          </span>
        )}
        <span style={{ fontSize: 12, color: 'var(--payi-text-faint)' }}>{subtitle}</span>
      </div>
    </div>
  )
}
