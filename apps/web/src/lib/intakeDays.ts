/** Local calendar day of a date, as YYYY-MM-DD. */
export function dayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * The days the quick log can page through, newest first. Today always leads —
 * it is the day you write to, empty or not — and only days that actually carry
 * events follow, so stepping back never lands on a blank screen.
 */
export function logDays(events: Array<{ ts: string }>, today: string): string[] {
  const days = new Set([today])
  for (const e of events) {
    const key = dayKey(new Date(e.ts))
    if (key < today) days.add(key)
  }
  return [...days].sort().reverse()
}
