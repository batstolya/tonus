// Metric registry for the doctor report: one entry per numeric field the app
// stores, so adding a metric to DailyMetrics means adding one row here.
import type { DailyMetrics } from '../../types'
import { addDays, daysBetween, localDate } from './dates'
import { avg, quantile } from './math'
import {
  BASELINE_WINDOW_DAYS, baselineOf, reliabilityOf, supportsClaims, type Baseline, type Reliability,
} from './reliability'

export type MetricKey =
  | 'rhr' | 'hrv' | 'hrAvg' | 'hrMin' | 'hrMax' | 'walkHr' | 'spo2' | 'resp'
  | 'temp' | 'vo2' | 'sleep' | 'deep' | 'rem' | 'core' | 'steps' | 'dist'
  | 'kcal' | 'exer' | 'floors'

export interface MetricDef {
  key: MetricKey
  /** Russian dictionary key — rendered through rt() for the en report. */
  label: string
  get: (d: DailyMetrics) => number | undefined
  digits: number
  /** Minimum relative shift worth reporting as a deviation, in percent. */
  minRel: number
}

export const METRIC_DEFS: MetricDef[] = [
  { key: 'rhr', label: 'Пульс покоя, уд/мин', get: d => d.restingHeartRate, digits: 0, minRel: 5 },
  { key: 'hrv', label: 'HRV, мс', get: d => d.hrv, digits: 0, minRel: 12 },
  { key: 'hrAvg', label: 'Пульс средний, уд/мин', get: d => d.heartRate?.avg, digits: 0, minRel: 5 },
  { key: 'hrMin', label: 'Пульс минимальный, уд/мин', get: d => d.heartRate?.min, digits: 0, minRel: 6 },
  { key: 'hrMax', label: 'Пульс максимальный, уд/мин', get: d => d.heartRate?.max, digits: 0, minRel: 8 },
  { key: 'walkHr', label: 'Пульс при ходьбе, уд/мин', get: d => d.walkingHeartRate, digits: 0, minRel: 6 },
  { key: 'spo2', label: 'SpO₂, %', get: d => (d.oxygenSaturation != null ? d.oxygenSaturation * 100 : undefined), digits: 1, minRel: 2 },
  { key: 'resp', label: 'Частота дыхания, /мин', get: d => d.respiratoryRate, digits: 1, minRel: 8 },
  { key: 'temp', label: 'Температура запястья, °C', get: d => d.wristTemperature, digits: 2, minRel: 1 },
  { key: 'vo2', label: 'VO₂max, мл/кг/мин', get: d => d.vo2max, digits: 1, minRel: 8 },
  { key: 'sleep', label: 'Сон общий, ч', get: d => d.sleepHours, digits: 1, minRel: 10 },
  { key: 'deep', label: 'Глубокий сон, ч', get: d => d.sleepDeep, digits: 1, minRel: 20 },
  { key: 'rem', label: 'REM-сон, ч', get: d => d.sleepREM, digits: 1, minRel: 20 },
  { key: 'core', label: 'Лёгкий сон, ч', get: d => d.sleepCore, digits: 1, minRel: 15 },
  { key: 'steps', label: 'Шаги', get: d => d.steps, digits: 0, minRel: 25 },
  { key: 'dist', label: 'Дистанция, км', get: d => d.distance, digits: 1, minRel: 25 },
  { key: 'kcal', label: 'Активные ккал', get: d => d.activeEnergy, digits: 0, minRel: 25 },
  { key: 'exer', label: 'Минуты упражнений', get: d => d.exerciseMinutes, digits: 0, minRel: 40 },
  { key: 'floors', label: 'Этажи', get: d => d.flightsClimbed, digits: 0, minRel: 40 },
]

export interface MetricSummary {
  key: MetricKey
  label: string
  digits: number
  avg: number
  min: number
  max: number
  /** Median and usual range of the 28 days before the period, or null when
   *  either the period or that window is too thin to support the claim. */
  baseline: Baseline | null
  daysWithData: number
  daysInPeriod: number
  reliability: Reliability
}

export const periodStart = (periodDays: number, today: string = localDate()): string =>
  addDays(today, -periodDays + 1)

export function periodSlice(daily: DailyMetrics[], periodDays: number, today: string = localDate()): DailyMetrics[] {
  const from = periodStart(periodDays, today)
  return daily.filter(d => d.date >= from && d.date <= today).sort((a, b) => a.date.localeCompare(b.date))
}

export interface PeriodFrame {
  /** Nominal start: today − periodDays + 1. */
  start: string
  /** Where counting begins — clamped forward to the first day with any record. */
  effectiveStart: string
  end: string
  nominalDays: number
  /** The one denominator: days from effectiveStart to end, inclusive. */
  calendarDays: number
  clamped: boolean
  daysWithAnyRecord: number
  emptyDays: number
}

/**
 * The denominator every coverage figure divides by. Clamped to the first day
 * with a record: a three-month-old account asked for 365 days would otherwise
 * report ~25% coverage on everything and be unreadable. The header prints both
 * numbers, so the clamp is never silent.
 */
export function periodFrame(
  daily: DailyMetrics[],
  periodDays: number,
  today: string = localDate(),
): PeriodFrame {
  const start = periodStart(periodDays, today)
  const dates = daily.filter(d => d.date >= start && d.date <= today).map(d => d.date).sort()
  const effectiveStart = dates.length && dates[0] > start ? dates[0] : start
  const calendarDays = daysBetween(effectiveStart, today)
  const daysWithAnyRecord = new Set(dates.filter(d => d >= effectiveStart)).size
  return {
    start,
    effectiveStart,
    end: today,
    nominalDays: periodDays,
    calendarDays,
    clamped: effectiveStart !== start,
    daysWithAnyRecord,
    emptyDays: calendarDays - daysWithAnyRecord,
  }
}

export function frameSlice(daily: DailyMetrics[], frame: PeriodFrame): DailyMetrics[] {
  return daily
    .filter(d => d.date >= frame.effectiveStart && d.date <= frame.end)
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function summarizeMetrics(daily: DailyMetrics[], frame: PeriodFrame): MetricSummary[] {
  const slice = frameSlice(daily, frame)
  const out: MetricSummary[] = []
  for (const m of METRIC_DEFS) {
    const vals = slice.map(m.get).filter((v): v is number => typeof v === 'number')
    if (!vals.length) continue
    const a = avg(vals)
    const dates = new Set(slice.filter(d => typeof m.get(d) === 'number').map(d => d.date))
    const rel = reliabilityOf(dates, frame.effectiveStart, frame.end)

    const windowStart = addDays(frame.effectiveStart, -BASELINE_WINDOW_DAYS)
    const before = daily.filter(d => d.date >= windowStart && d.date < frame.effectiveStart)
    const baseValues = before.map(m.get).filter((v): v is number => typeof v === 'number')
    const baseline = supportsClaims(rel.band) ? baselineOf(baseValues, a, m.digits) : null

    out.push({
      key: m.key,
      label: m.label,
      digits: m.digits,
      avg: +a.toFixed(m.digits),
      min: +Math.min(...vals).toFixed(m.digits),
      max: +Math.max(...vals).toFixed(m.digits),
      baseline,
      daysWithData: rel.daysWithData,
      daysInPeriod: rel.daysInPeriod,
      reliability: rel,
    })
  }
  return out
}

/**
 * Circular statistics for a clock time. Times map to minutes since 18:00
 * before ordering, which keeps a cluster around midnight contiguous — with
 * daytime episodes excluded upstream, no realistic bedtime or wake time sits
 * near the 18:00 seam. A plain mean puts 23:50 and 00:10 at noon.
 */
const ORIGIN_MIN = 18 * 60

export interface TimeStat {
  median: string
  q1: string
  q3: string
  count: number
}

const pad = (n: number): string => String(n).padStart(2, '0')

export function timeOfDayStats(isoList: string[]): TimeStat | null {
  const shifted = isoList
    .map(iso => new Date(iso))
    .filter(d => !isNaN(d.getTime()))
    .map(d => (d.getHours() * 60 + d.getMinutes() - ORIGIN_MIN + 1440) % 1440)
  if (!shifted.length) return null
  const back = (m: number): string => {
    const t = Math.round(m + ORIGIN_MIN) % 1440
    return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`
  }
  return {
    median: back(quantile(shifted, 0.5)),
    q1: back(quantile(shifted, 0.25)),
    q3: back(quantile(shifted, 0.75)),
    count: shifted.length,
  }
}
