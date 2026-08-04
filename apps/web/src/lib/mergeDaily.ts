import type { DailyMetrics } from '../types'

/**
 * Folds a background load of older history into the recent window the screen
 * is already showing.
 *
 * Every screen reads `daily.slice(-N)`, so the result must stay sorted by date
 * and hold one entry per day. Where both sides have a date, the window wins:
 * it was fetched later.
 */
export function mergeDaily(window: DailyMetrics[], older: DailyMetrics[]): DailyMetrics[] {
  const byDate = new Map<string, DailyMetrics>()
  for (const day of older) byDate.set(day.date, day)
  for (const day of window) byDate.set(day.date, day)
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}
