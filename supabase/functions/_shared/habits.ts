// Habits: abstinence tracking where a closed day with no recorded break counts
// as clean. Spec: 2026-08-28-habits-design.md
//
// Inverted from adherence.ts: there a log row proves success, here a row in
// habit_breaks proves failure and the absence of rows is the good case. Today is
// deliberately `pending` rather than `clean` -- a win at 10am would be a lie the
// user could still break by evening.
//
// Pure module: no supabase import, so the node test project and the edge
// functions can both use it. Dates are YYYY-MM-DD and step through UTC, which
// keeps DST out of the arithmetic; the caller resolves `today` in the user's
// timezone before calling in.

export type DayStatus = 'clean' | 'broken' | 'pending'

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
  /** Consecutive clean closed days ending yesterday; pending today never counts. */
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
    const status: DayStatus = broken.has(date)
      ? 'broken'
      : date === today
        ? 'pending'
        : 'clean'
    days.push({ date, status })
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
    } else if (day.status === 'broken') {
      run = 0
    }
    // `pending` neither extends nor breaks the run: the day is not decided yet.
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
