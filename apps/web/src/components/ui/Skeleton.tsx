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

// Скелетон содержимого экрана (без обёртки .main-content — для Suspense-фолбэка
// внутри шелла). Заголовок + крупная карта + сетка карточек — форма среднего
// экрана, плавно сменяется контентом.
export function ScreenSkeleton() {
  return (
    <div className="dash-skeleton" aria-busy="true" aria-label="Загрузка">
      <Skeleton width={190} height={28} radius={10} />

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
  )
}

// Скелетон списка карты стресса: те же .stress-item-«коробки», что и у готового
// списка, поэтому подмена контентом не двигает вёрстку. Отдельный от
// ScreenSkeleton — тот нарисован под дашборд (карточка готовности + сетка
// метрик) и на этом экране показывал бы форму, которой здесь не будет.
export function StressListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="stress-list" aria-busy="true" aria-label="Загрузка">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="stress-item sk-card">
          <Skeleton width="45%" height={14} />
          <Skeleton width="70%" height={12} style={{ marginTop: 10 }} />
        </div>
      ))}
    </div>
  )
}

// Полноэкранный скелетон (обёрнут в .main-content) — для загрузок вне шелла:
// начальная проверка сессии и загрузка данных дашборда.
export function DashboardSkeleton() {
  return (
    <main className="main-content" aria-busy="true">
      <ScreenSkeleton />
    </main>
  )
}
