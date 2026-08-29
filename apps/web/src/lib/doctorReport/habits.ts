import { habitDays, habitStats, type Habit, type HabitBreak } from '../habits'
import { daysBetween } from './dates'

export interface HabitLine {
  name: string
  startDate: string
  cleanDays: number
  windowDays: number
  /** Slip dates inside the reporting window, oldest first. */
  breakDates: string[]
}

/**
 * Active habits only: an archived habit is deliberately absent from the
 * report, the same as it is from the AI context.
 *
 * `periodStart` is the report's own window (frame.effectiveStart, same as
 * every other section) — otherwise a 30-day report would still count clean
 * days and list slips from the default 84-day grid.
 */
export function buildHabitsSection(
  habits: Habit[],
  breaks: HabitBreak[],
  today: string,
  periodStart: string,
): HabitLine[] {
  const windowDays = daysBetween(periodStart, today)
  return habits
    .filter(h => h.active)
    .map(h => {
      const days = habitDays(h, breaks, today, windowDays)
      const stats = habitStats(days)
      const breakDates = breaks
        .filter(b => b.habit_id === h.id && days.some(d => d.date === b.date))
        .map(b => b.date)
        .sort()
      return {
        name: h.name,
        startDate: h.start_date,
        cleanDays: stats.cleanDays,
        windowDays: stats.windowDays,
        breakDates,
      }
    })
}
