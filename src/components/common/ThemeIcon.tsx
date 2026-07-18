// Half-filled circle marking anything theme-related: the app topbar's ThemeMenu
// and the landing topbar share it so both entry points read as the same control.
export function ThemeIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2 A10 10 0 0 1 12 22 Z" fill="currentColor" stroke="none" />
    </svg>
  )
}
