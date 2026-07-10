import type { DailyMetrics } from '../types'
import { isActiveDay } from './streak'

export interface MonthlyStats {
  activeDays: number
  totalDays: number
}

export interface StreakRecord {
  days: number
  startDate: string
  endDate: string
  isCurrent: boolean
}

export interface MilestoneProgress {
  nextMilestone: number
  daysToGo: number
  percent: number
}

const MILESTONES = [10, 30, 50, 100, 365, 730, 1000]

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

function ymd(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function getAllStreakRecords(daily: DailyMetrics[], today: Date = new Date()): StreakRecord[] {
  const active = new Set<string>()
  for (const d of daily) if (isActiveDay(d)) active.add(d.date)
  if (active.size === 0) return []

  const sorted = [...active].sort()
  const todayStr = ymd(today)
  const records: StreakRecord[] = []

  let streakStart = sorted[0]
  let streakDays = 1

  for (let i = 1; i <= sorted.length; i++) {
    const current = sorted[i - 1]
    const next = i < sorted.length ? sorted[i] : null

    // Check if next is consecutive (within 1 day)
    const currentDate = new Date(current + 'T12:00:00')
    const isConsecutive = next && (new Date(next + 'T12:00:00').getTime() - currentDate.getTime()) === 86400000

    if (!isConsecutive) {
      // Streak ends
      const isCurrent = current === todayStr && streakDays > 0
      records.push({
        days: streakDays,
        startDate: streakStart,
        endDate: current,
        isCurrent,
      })
      if (next) {
        streakStart = next
        streakDays = 1
      }
    } else {
      streakDays++
    }
  }

  return records
}

export function getMilestoneProgress(currentDays: number): MilestoneProgress | null {
  // If at or beyond a milestone, don't show progress
  if (MILESTONES.includes(currentDays)) return null
  const next = MILESTONES.find(m => m > currentDays)
  if (!next) return null
  const daysToGo = next - currentDays
  const percent = Math.round(((next - daysToGo) / next) * 100)
  return { nextMilestone: next, daysToGo, percent }
}
