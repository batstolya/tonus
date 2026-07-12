// Агрегация данных для «Отчёта для врача» (SPEC-DOCTOR-REPORT §2.2).
// Чистая логика без запросов: вход — уже загруженные ряды, выход — строки
// печатных таблиц. Консервативно: только измеренные значения, никаких выводов.
import type { DailyMetrics } from '../types'
import type { LabResult } from './labs'
import { computeDailyScores } from './scores'
import { localDate, addDays } from './experiments'

export interface MetricSummary {
  key: 'restingHeartRate' | 'hrv' | 'sleepHours' | 'steps'
  avg: number | null
  min: number | null
  max: number | null
  baselinePct: number | null // отклонение среднего за период от личного базлайна, %
}

const round1 = (n: number) => +n.toFixed(1)

function periodSlice(daily: DailyMetrics[], periodDays: number): DailyMetrics[] {
  const from = addDays(localDate(), -periodDays)
  return daily.filter(d => d.date >= from).sort((a, b) => a.date.localeCompare(b.date))
}

export function summarizeMetrics(daily: DailyMetrics[], periodDays: number): MetricSummary[] {
  const slice = periodSlice(daily, periodDays)
  const scores = computeDailyScores(daily)
  const last = scores[scores.length - 1]
  const baselines: Record<MetricSummary['key'], number | null> = {
    restingHeartRate: last?.rhr_baseline ?? null,
    hrv: last?.hrv_baseline ?? null,
    sleepHours: last?.sleep_baseline ?? null,
    steps: last?.steps_baseline ?? null,
  }
  const keys: MetricSummary['key'][] = ['restingHeartRate', 'hrv', 'sleepHours', 'steps']
  return keys.map(key => {
    const vals = slice.map(d => d[key]).filter((v): v is number => typeof v === 'number')
    if (!vals.length) return { key, avg: null, min: null, max: null, baselinePct: null }
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length
    const base = baselines[key]
    return {
      key,
      avg: round1(avg),
      min: round1(Math.min(...vals)),
      max: round1(Math.max(...vals)),
      baselinePct: base != null && base > 0 ? Math.round(((avg - base) / base) * 100) : null,
    }
  })
}

export interface WeeklyRow {
  weekStart: string // понедельник, YYYY-MM-DD
  rhr: number | null
  hrv: number | null
  sleep: number | null
  steps: number | null
}

function mondayOf(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const shift = (dt.getDay() + 6) % 7 // Пн=0 … Вс=6
  return addDays(date, -shift)
}

export function weeklyRows(daily: DailyMetrics[], periodDays: number): WeeklyRow[] {
  const slice = periodSlice(daily, periodDays)
  const weeks = new Map<string, DailyMetrics[]>()
  for (const d of slice) {
    const wk = mondayOf(d.date)
    weeks.set(wk, [...(weeks.get(wk) ?? []), d])
  }
  const avgOf = (rows: DailyMetrics[], key: keyof DailyMetrics): number | null => {
    const vals = rows.map(r => r[key]).filter((v): v is number => typeof v === 'number')
    return vals.length ? round1(vals.reduce((a, b) => a + b, 0) / vals.length) : null
  }
  return [...weeks.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-13) // максимум квартал строк — печать не резиновая
    .map(([weekStart, rows]) => ({
      weekStart,
      rhr: avgOf(rows, 'restingHeartRate'),
      hrv: avgOf(rows, 'hrv'),
      sleep: avgOf(rows, 'sleepHours'),
      steps: avgOf(rows, 'steps'),
    }))
}

// «3.5-5.5», «10 – 20», «3,9 - 6,2», «< 5», «> 1.2» → числовой диапазон.
export function parseRefRange(s: string | null | undefined): { lo: number; hi: number } | null {
  if (!s) return null
  const norm = s.replace(/,/g, '.').replace(/\s+/g, ' ').trim()
  const lt = norm.match(/^<\s*(\d+(?:\.\d+)?)$/)
  if (lt) return { lo: -Infinity, hi: Number(lt[1]) }
  const gt = norm.match(/^>\s*(\d+(?:\.\d+)?)$/)
  if (gt) return { lo: Number(gt[1]), hi: Infinity }
  const range = norm.match(/^(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)$/)
  if (range) return { lo: Number(range[1]), hi: Number(range[2]) }
  return null
}

export interface LabLine {
  marker: string
  value: number
  unit: string | null
  refRange: string | null
  flag: '↑' | '↓' | null
  date: string
  prevValue: number | null
}

export function latestLabs(results: LabResult[]): LabLine[] {
  const byMarker = new Map<string, LabResult[]>()
  for (const r of results) byMarker.set(r.marker, [...(byMarker.get(r.marker) ?? []), r])
  const lines: LabLine[] = []
  for (const [marker, rs] of byMarker) {
    const sorted = [...rs].sort((a, b) => a.date.localeCompare(b.date))
    const cur = sorted[sorted.length - 1]
    const prev = sorted.length > 1 ? sorted[sorted.length - 2] : null
    const range = parseRefRange(cur.ref_range)
    let flag: LabLine['flag'] = null
    if (range) {
      if (cur.value > range.hi) flag = '↑'
      else if (cur.value < range.lo) flag = '↓'
    } else if (cur.flag) {
      // диапазон не распарсился — доверяем флагу из выписки (H/L/↑/↓)
      const f = cur.flag.trim().toUpperCase()
      flag = f === 'H' || f === '↑' ? '↑' : f === 'L' || f === '↓' ? '↓' : null
    }
    lines.push({
      marker, value: cur.value, unit: cur.unit, refRange: cur.ref_range ?? null,
      flag, date: cur.date, prevValue: prev?.value ?? null,
    })
  }
  return lines.sort((a, b) => a.marker.localeCompare(b.marker, 'ru'))
}
