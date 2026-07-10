import type { DailyMetrics } from '../types'
import { isActiveDay } from './streak'

export interface MonthlyStats {
  activeDays: number
  totalDays: number
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

export function getMonthlyStats(daily: DailyMetrics[], year: number, month: number): MonthlyStats {
  const totalDays = daysInMonth(year, month)
  const activeDays = daily.filter(d => {
    const [y, m] = d.date.split('-').slice(0, 2)
    return parseInt(y) === year && parseInt(m) === month && isActiveDay(d)
  }).length
  return { activeDays, totalDays }
}
