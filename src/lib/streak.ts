import type { DailyMetrics } from '../types'

// Named tuning constants (single source of truth — client-only mechanic).
export const FREEZE_EARN_EVERY = 7 // 1 freeze earned per this many streak days
export const MAX_FREEZES = 3        // cap on stored freezes
export const WEEKLY_MIN_DAYS = 5    // active days needed for a week to "count"

// Core metrics: a day is "active" if any of these is present.
const CORE_KEYS: (keyof DailyMetrics)[] = ['steps', 'sleepHours', 'restingHeartRate', 'hrv']

export interface StreakState {
  current: number          // consecutive active days
  freezesAvailable: number // 0..MAX_FREEZES
  freezesSpent: number     // spent bridging gaps in the current window
  weekly: number           // consecutive weeks with >= WEEKLY_MIN_DAYS active days
  todayPending: boolean    // today has no data yet, but the streak is alive
  frozenDates: string[]    // dates bridged by a freeze (for the calendar)
}

// Exported: ActivityCalendar reuses this predicate (no duplicated metric list).
export function isActiveDay(d: DailyMetrics): boolean {
  return CORE_KEYS.some(k => d[k] != null)
}

// Local-time YYYY-MM-DD (matches how DailyMetrics.date is stored).
function ymd(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function addDays(date: Date, n: number): Date {
  const c = new Date(date)
  c.setDate(c.getDate() + n)
  return c
}

// Monday of the week containing `date` (Mon=start).
function startOfWeek(date: Date): Date {
  const c = new Date(date)
  const day = (c.getDay() + 6) % 7 // Mon=0 … Sun=6
  return addDays(c, -day)
}

function countWeek(active: Set<string>, monday: Date): number {
  let n = 0
  for (let i = 0; i < 7; i++) if (active.has(ymd(addDays(monday, i)))) n++
  return n
}

// Consecutive weeks meeting the threshold. Completed weeks are counted from last
// week backwards; the current (partial) week only adds once it reaches the
// threshold itself — otherwise weekly would be 0 every Mon-Thu no matter what.
function computeWeekly(active: Set<string>, today: Date): number {
  const curMonday = startOfWeek(today)
  let weeks = countWeek(active, curMonday) >= WEEKLY_MIN_DAYS ? 1 : 0
  let monday = addDays(curMonday, -7)
  while (countWeek(active, monday) >= WEEKLY_MIN_DAYS) {
    weeks++
    monday = addDays(monday, -7)
  }
  return weeks
}

// Найдовша серія тижнів поспіль з >= WEEKLY_MIN_DAYS активними днями за всю
// історію. Поточний частковий тиждень рахується, лише якщо вже досяг порогу
// (його count природно < порогу до того) — та сама семантика, що в computeWeekly.
export function getWeeklyRecord(daily: DailyMetrics[], today: Date = new Date()): number {
  const active = new Set<string>()
  for (const d of daily) if (isActiveDay(d)) active.add(d.date)
  if (active.size === 0) return 0

  const first = [...active].sort()[0]
  let monday = startOfWeek(new Date(first + 'T12:00:00'))
  const lastMonday = startOfWeek(today)

  let best = 0
  let run = 0
  while (monday.getTime() <= lastMonday.getTime()) {
    if (countWeek(active, monday) >= WEEKLY_MIN_DAYS) {
      run++
      if (run > best) best = run
    } else {
      run = 0
    }
    monday = addDays(monday, 7)
  }
  return best
}

// Forward walk from the first active day. Freezes are earned by days BEFORE a
// gap, so a backward walk cannot work: by the time it reaches the gap it has
// only counted the days after it, and there is nothing to bridge with.
export function computeStreak(daily: DailyMetrics[], today: Date = new Date()): StreakState {
  const empty: StreakState = {
    current: 0, freezesAvailable: 0, freezesSpent: 0, weekly: 0, todayPending: false, frozenDates: [],
  }
  const active = new Set<string>()
  for (const d of daily) if (isActiveDay(d)) active.add(d.date)
  if (active.size === 0) return empty

  const todayStr = ymd(today)
  const first = [...active].sort()[0]

  let streak = 0
  let freezes = 0
  let spent = 0
  let frozenDates: string[] = []
  let cursor = new Date(first + 'T12:00:00') // noon dodges DST edges

  while (true) {
    const cur = ymd(cursor)
    if (cur > todayStr) break
    if (active.has(cur)) {
      streak++
      // Earn 1 freeze every FREEZE_EARN_EVERY consecutive days, inventory capped.
      if (streak % FREEZE_EARN_EVERY === 0) freezes = Math.min(MAX_FREEZES, freezes + 1)
    } else if (cur === todayStr) {
      // Today's sync may still arrive: no break, no freeze spent.
    } else if (freezes > 0) {
      freezes--
      spent++
      frozenDates.push(cur)
    } else {
      streak = 0; freezes = 0; spent = 0; frozenDates = []
    }
    cursor = addDays(cursor, 1)
  }

  return {
    current: streak,
    freezesAvailable: freezes,
    freezesSpent: spent,
    weekly: computeWeekly(active, today),
    todayPending: !active.has(todayStr) && streak > 0,
    frozenDates,
  }
}
