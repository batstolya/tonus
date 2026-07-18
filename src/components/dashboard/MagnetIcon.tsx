// Line-style horseshoe magnet matching the topbar stroke icons
// (replaces the 🧲 emoji in the geo-storm badge and banner).
export function MagnetIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 13V5a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2v8a3 3 0 0 0 6 0V5a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2v8a8 8 0 0 1-16 0" />
      <path d="M4 8h5" />
      <path d="M15 8h5" />
    </svg>
  )
}
