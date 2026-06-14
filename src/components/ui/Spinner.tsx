export function Spinner({ size = 32, color = 'var(--accent)' }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      style={{ animation: 'spin 0.8s linear infinite' }}
    >
      <circle cx="16" cy="16" r="13" stroke={color} strokeOpacity="0.15" strokeWidth="3" />
      <path
        d="M16 3a13 13 0 0 1 13 13"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function AppLoader({ label }: { label?: string }) {
  return (
    <div className="app-loader">
      <div className="app-loader-inner">
        <span className="app-loader-logo">Tonus</span>
        <Spinner size={40} />
        {label && <p className="app-loader-label">{label}</p>}
      </div>
    </div>
  )
}

export function SkeletonLine({ width = '100%', height = 16 }: { width?: string | number; height?: number }) {
  return <div className="skeleton" style={{ width, height, borderRadius: height / 2 }} />
}

export function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <SkeletonLine width="40%" height={12} />
      <SkeletonLine width="60%" height={28} />
      <SkeletonLine width="30%" height={11} />
    </div>
  )
}

export function DashboardSkeleton() {
  return (
    <div className="dashboard-skeleton">
      <div className="skeleton-stats-row">
        {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
      </div>
      <div className="skeleton-chart">
        <SkeletonLine width="25%" height={14} />
        <div className="skeleton-chart-body" />
      </div>
      <div className="skeleton-chart">
        <SkeletonLine width="20%" height={14} />
        <div className="skeleton-chart-body" style={{ height: 160 }} />
      </div>
    </div>
  )
}
