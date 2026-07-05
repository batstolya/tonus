import type { CSSProperties } from 'react'

// Пульсирующий плейсхолдер-«кирпичик». Ширина/высота/радиус — inline-стилями,
// анимация и цвет — в .skeleton (index.css), работает в обеих темах.
export function Skeleton({ width, height = 16, radius = 8, className = '', style }: {
  width?: string | number
  height?: string | number
  radius?: string | number
  className?: string
  style?: CSSProperties
}) {
  return (
    <span
      className={`skeleton ${className}`.trim()}
      style={{ width, height, borderRadius: radius, ...style }}
      aria-hidden="true"
    />
  )
}

// Скелетон дашборда: повторяет форму реального экрана (приветствие, заголовок,
// карта готовности, сетка метрик), чтобы плавно сменяться контентом.
export function DashboardSkeleton() {
  return (
    <div className="main-content" aria-busy="true" aria-label="Загрузка">
      <div className="dashboard dash-skeleton">
        <Skeleton width={150} height={14} />
        <Skeleton width={210} height={30} radius={10} />

        <div className="readiness-card sk-card">
          <div className="sk-readiness">
            <Skeleton width={92} height={64} radius={14} />
            <div className="sk-bars">
              <Skeleton height={12} />
              <Skeleton height={12} width="88%" />
              <Skeleton height={12} width="72%" />
            </div>
          </div>
          <Skeleton height={14} />
          <Skeleton height={14} width="80%" />
        </div>

        <div className="cards-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="metric-card sk-card">
              <Skeleton width="55%" height={11} />
              <Skeleton width="42%" height={26} radius={8} style={{ marginTop: 12 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
