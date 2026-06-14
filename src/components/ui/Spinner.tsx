export function AppLoader({ label }: { label?: string }) {
  return (
    <div className="app-loader">
      <div className="app-loader-inner">
        <div className="app-loader-logo">T</div>
        <div className="app-loader-rings">
          <div className="app-loader-ring" />
          <div className="app-loader-ring app-loader-ring--2" />
        </div>
        {label && <p className="app-loader-label">{label}</p>}
      </div>
    </div>
  )
}
