import type { DailyMetrics } from '../types'
import type { FocusCheck, DayPredicate } from './coach'

export interface FocusData {
  daily: DailyMetrics[]
  intake: { ts: string; type: string }[]
  wellbeingByDate: Record<string, number>
}

export interface FocusProgress {
  daysMet: number
  denom: number
  mode: 'daily' | 'weekly'
  done: boolean
  perDay: { date: string; met: boolean; future: boolean }[]
}

function addDays(dateStr: string, n: number): string {
  const dt = new Date(`${dateStr}T00:00:00Z`); dt.setUTCDate(dt.getUTCDate() + n); return dt.toISOString().slice(0, 10)
}
// минуты от 00:00; eveningAnchor: время раньше 12:00 трактуем как «следующий день» (+1440)
function toMin(hhmm: string, eveningAnchor: boolean): number {
  const [h, m] = hhmm.split(':').map(Number); let min = h * 60 + m
  if (eveningAnchor && min < 720) min += 1440
  return min
}
function clockMin(iso: string, eveningAnchor: boolean): number {
  const d = new Date(iso); let min = d.getHours() * 60 + d.getMinutes()
  if (eveningAnchor && min < 720) min += 1440
  return min
}

function evalPredicate(p: DayPredicate, date: string, data: FocusData, byDate: Map<string, DailyMetrics>): boolean {
  const dm = byDate.get(date)
  const dayEvents = (ev: string) => data.intake.filter(e => e.type === ev && e.ts.slice(0, 10) === date)
  switch (p.kind) {
    case 'steps_gte': return dm?.steps != null && dm.steps >= p.value
    case 'sleep_hours_gte': return dm?.sleepHours != null && dm.sleepHours >= p.value
    case 'bedtime_before': return dm?.sleepBedtime != null && clockMin(dm.sleepBedtime, true) <= toMin(p.time, true)
    case 'meals_gte': return dayEvents('meal').length >= p.value
    case 'event_count_lte': return dayEvents(p.event).length <= p.value
    case 'event_absent_after': { const thr = toMin(p.time, false); return !dayEvents(p.event).some(e => clockMin(e.ts, false) > thr) }
    case 'event_present': return dayEvents(p.event).length >= 1
    case 'event_absent': return dayEvents(p.event).length === 0
    case 'wellbeing_gte': return data.wellbeingByDate[date] != null && data.wellbeingByDate[date] >= p.value
  }
}

export function evaluateFocus(check: FocusCheck, setAt: string, data: FocusData): FocusProgress {
  const start = setAt.slice(0, 10)
  const today = new Date().toISOString().slice(0, 10)
  const byDate = new Map(data.daily.map(d => [d.date, d]))
  const perDay = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i)
    const future = date > today
    return { date, future, met: future ? false : evalPredicate(check.predicate, date, data, byDate) }
  })
  const daysMet = perDay.filter(d => d.met).length
  const mode = check.target != null ? 'weekly' : 'daily'
  const denom = check.target != null ? check.target : 7
  const done = check.target != null ? daysMet >= check.target : false
  return { daysMet, denom, mode, done, perDay }
}
