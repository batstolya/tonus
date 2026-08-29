// Month grid helpers for calendar cards. Days are YYYY-MM-DD strings and the
// week starts on Monday, matching the supplement calendar the habits card
// mirrors.

export interface MonthGrid {
  /** YYYY-MM-DD for every day of the month, in order. */
  days: string[]
  /** Blank cells before the first day, so the first row is a full week. */
  leadingBlanks: number
  /** First day of the month, as YYYY-MM. */
  key: string
}

export function monthGrid(year: number, month: number): MonthGrid {
  const first = new Date(Date.UTC(year, month, 1))
  const count = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const days: string[] = []
  for (let d = 1; d <= count; d++) {
    days.push(new Date(Date.UTC(year, month, d)).toISOString().slice(0, 10))
  }
  return {
    days,
    leadingBlanks: (first.getUTCDay() + 6) % 7,
    key: `${year}-${String(month + 1).padStart(2, '0')}`,
  }
}

export function shiftMonth(year: number, month: number, delta: number) {
  const d = new Date(Date.UTC(year, month + delta, 1))
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() }
}
