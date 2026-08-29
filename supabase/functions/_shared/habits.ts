// Habits: abstinence tracking where a closed day with no recorded break counts
// as clean. Spec: 2026-08-28-habits-design.md
//
// Inverted from adherence.ts: there a log row proves success, here a row in
// habit_breaks proves failure and the absence of rows is the good case. Today
// counts as clean like any other day: the user asked for the day to mark itself
// done and to be unchecked by hand, so a day is only ever clean or broken.
//
// Pure module: no supabase import, so the node test project and the edge
// functions can both use it. Dates are YYYY-MM-DD and step through UTC, which
// keeps DST out of the arithmetic; the caller resolves `today` in the user's
// timezone before calling in.

export type DayStatus = 'clean' | 'broken'

export interface Habit {
  id: string
  user_id: string
  name: string
  note: string | null
  start_date: string
  active: boolean
  sort_order: number | null
  created_at: string
}

export interface HabitBreak {
  id: string
  habit_id: string
  date: string
  note: string | null
}

export interface HabitDay {
  date: string
  status: DayStatus
}

export interface HabitStats {
  /** Consecutive clean days ending today. */
  currentStreak: number
  bestStreak: number
  breaks30: number
  cleanDays: number
  windowDays: number
}

/** Default grid: twelve weeks, enough to read continuity at a glance. */
export const HABIT_WINDOW_DAYS = 84

export function addDays(date: string, delta: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

export function habitDays(
  habit: Habit,
  breaks: HabitBreak[],
  today: string,
  windowDays: number = HABIT_WINDOW_DAYS,
): HabitDay[] {
  const windowStart = addDays(today, -(windowDays - 1))
  const from = habit.start_date > windowStart ? habit.start_date : windowStart
  if (from > today) return []

  const broken = new Set(
    breaks.filter(b => b.habit_id === habit.id).map(b => b.date),
  )

  const days: HabitDay[] = []
  for (let date = from; date <= today; date = addDays(date, 1)) {
    days.push({ date, status: broken.has(date) ? 'broken' : 'clean' })
  }
  return days
}

export function habitStats(days: HabitDay[]): HabitStats {
  let bestStreak = 0
  let run = 0
  let cleanDays = 0

  for (const day of days) {
    if (day.status === 'clean') {
      run += 1
      cleanDays += 1
      if (run > bestStreak) bestStreak = run
    } else {
      run = 0
    }
  }
  const currentStreak = run

  const last30 = days.slice(-30)
  return {
    currentStreak,
    bestStreak,
    breaks30: last30.filter(d => d.status === 'broken').length,
    cleanDays,
    windowDays: days.length,
  }
}
