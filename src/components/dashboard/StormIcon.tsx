// Line-style "field disturbance" waves for the geo-storm badge and banner,
// matching the topbar stroke icons (picked over magnet/aurora variants).
export function StormIcon({ size = 16 }: { size?: number }) {
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
      <path d="M8 12a4 4 0 0 1 8 0" />
      <path d="M5 12a7 7 0 0 1 14 0" />
      <circle cx="12" cy="15" r="1.5" />
      <path d="M12 16.5V21" />
    </svg>
  )
}
