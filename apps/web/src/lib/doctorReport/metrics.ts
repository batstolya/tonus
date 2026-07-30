// Metric registry for the doctor report: one entry per numeric field the app
// stores, so adding a metric to DailyMetrics means adding one row here.
import type { DailyMetrics } from '../../types'

export type MetricKey =
  | 'rhr' | 'hrv' | 'hrAvg' | 'hrMin' | 'hrMax' | 'walkHr' | 'spo2' | 'resp'
  | 'temp' | 'vo2' | 'sleep' | 'deep' | 'rem' | 'core' | 'steps' | 'dist'
  | 'kcal' | 'exer' | 'floors'

export type BaselineKey = 'rhr' | 'hrv' | 'sleep' | 'steps'

export interface MetricDef {
  key: MetricKey
  /** Russian dictionary key — rendered through rt() for the en report. */
  label: string
  get: (d: DailyMetrics) => number | undefined
  digits: number
  /** Minimum relative shift worth reporting as a deviation, in percent. */
  minRel: number
  baseline?: BaselineKey
}

export const METRIC_DEFS: MetricDef[] = [
  { key: 'rhr', label: 'Пульс покоя, уд/мин', get: d => d.restingHeartRate, digits: 0, minRel: 5, baseline: 'rhr' },
  { key: 'hrv', label: 'HRV, мс', get: d => d.hrv, digits: 0, minRel: 12, baseline: 'hrv' },
  { key: 'hrAvg', label: 'Пульс средний, уд/мин', get: d => d.heartRate?.avg, digits: 0, minRel: 5 },
  { key: 'hrMin', label: 'Пульс минимальный, уд/мин', get: d => d.heartRate?.min, digits: 0, minRel: 6 },
  { key: 'hrMax', label: 'Пульс максимальный, уд/мин', get: d => d.heartRate?.max, digits: 0, minRel: 8 },
  { key: 'walkHr', label: 'Пульс при ходьбе, уд/мин', get: d => d.walkingHeartRate, digits: 0, minRel: 6 },
  { key: 'spo2', label: 'SpO₂, %', get: d => (d.oxygenSaturation != null ? d.oxygenSaturation * 100 : undefined), digits: 1, minRel: 2 },
  { key: 'resp', label: 'Частота дыхания, /мин', get: d => d.respiratoryRate, digits: 1, minRel: 8 },
  { key: 'temp', label: 'Температура запястья, °C', get: d => d.wristTemperature, digits: 2, minRel: 1 },
  { key: 'vo2', label: 'VO₂max, мл/кг/мин', get: d => d.vo2max, digits: 1, minRel: 8 },
  { key: 'sleep', label: 'Сон общий, ч', get: d => d.sleepHours, digits: 1, minRel: 10, baseline: 'sleep' },
  { key: 'deep', label: 'Глубокий сон, ч', get: d => d.sleepDeep, digits: 1, minRel: 20 },
  { key: 'rem', label: 'REM-сон, ч', get: d => d.sleepREM, digits: 1, minRel: 20 },
  { key: 'core', label: 'Лёгкий сон, ч', get: d => d.sleepCore, digits: 1, minRel: 15 },
  { key: 'steps', label: 'Шаги', get: d => d.steps, digits: 0, minRel: 25, baseline: 'steps' },
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
  /** Deviation of the period average from the personal baseline, percent. */
  baselinePct: number | null
  daysWithData: number
  daysInPeriod: number
}

export const avg = (v: number[]): number => v.reduce((a, b) => a + b, 0) / v.length

export function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export const localDate = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const periodStart = (periodDays: number, today: string = localDate()): string =>
  addDays(today, -periodDays + 1)

export function periodSlice(daily: DailyMetrics[], periodDays: number, today: string = localDate()): DailyMetrics[] {
  const from = periodStart(periodDays, today)
  return daily.filter(d => d.date >= from && d.date <= today).sort((a, b) => a.date.localeCompare(b.date))
}

export function summarizeMetrics(
  daily: DailyMetrics[],
  periodDays: number,
  today: string = localDate(),
  baselines: Partial<Record<BaselineKey, number | null>> = {},
): MetricSummary[] {
  const slice = periodSlice(daily, periodDays, today)
  const out: MetricSummary[] = []
  for (const m of METRIC_DEFS) {
    const vals = slice.map(m.get).filter((v): v is number => typeof v === 'number')
    if (!vals.length) continue
    const a = avg(vals)
    const base = m.baseline ? baselines[m.baseline] ?? null : null
    out.push({
      key: m.key,
      label: m.label,
      digits: m.digits,
      avg: +a.toFixed(m.digits),
      min: +Math.min(...vals).toFixed(m.digits),
      max: +Math.max(...vals).toFixed(m.digits),
      baselinePct: base != null && base > 0 ? Math.round(((a - base) / base) * 100) : null,
      daysWithData: vals.length,
      daysInPeriod: slice.length,
    })
  }
  return out
}

// Average time of day. Times straddling midnight are shifted past 24:00 before
// averaging, otherwise 23:40 and 00:20 average to noon instead of midnight.
export function avgTimeOfDay(isoList: string[]): string | null {
  if (!isoList.length) return null
  const mins = isoList.map(iso => {
    const d = new Date(iso)
    return d.getHours() * 60 + d.getMinutes()
  })
  const straddles = Math.max(...mins) - Math.min(...mins) > 720
  const use = straddles ? mins.map(m => (m < 720 ? m + 1440 : m)) : mins
  const m = Math.round(avg(use)) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
