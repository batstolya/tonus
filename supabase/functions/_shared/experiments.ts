// Серверная копия расчёта результатов экспериментов (SPEC-EXPERIMENT-LOOP §2.2).
// ЗЕРКАЛО src/lib/experiments.ts (computeResult, датовые хелперы, effectLabel) —
// менять синхронно, parity-тест в src/lib/experiments.test.ts.
// Чистый модуль без Deno/браузерных зависимостей — тестируется vitest напрямую.

export function localDate(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return localDate(new Date(y, m - 1, d + n))
}

export function computeBaselineStart(startDate: string, baselineDays: number): string {
  return addDays(startDate, -baselineDays)
}

// Меньше точек в любом из окон — результат недостоверен, не показываем цифры.
export const MIN_N = 5

// Минимальный дневной ряд для computeResult (структурно совместим с DailyMetrics клиента).
export interface ExpDaily {
  date: string
  hrv?: number | null
  restingHeartRate?: number | null
  sleepHours?: number | null
  sleepDeep?: number | null
  sleepREM?: number | null
  steps?: number | null
  activeEnergy?: number | null
  oxygenSaturation?: number | null
  heartRate?: { avg: number } | null
}

export interface ExperimentRow {
  id: string
  hypothesis: string
  change_rule: string
  target_metric: string
  baseline_days: number
  baseline_start: string | null
  start_date: string
  end_date: string
  status: 'active' | 'completed' | 'cancelled'
  result: ExperimentResult | null
  ai_explanation: string | null
  created_at: string
}

export interface ExperimentResult {
  baselineMean: number | null
  expMean: number | null
  delta: number | null
  deltaPct: number | null
  cohenD: number | null
  baselineN: number
  expN: number
  betterHigh: boolean
  insufficient: { window: 'baseline' | 'exp'; n: number; minN: number } | null
}

export const METRIC_OPTIONS: { key: string; label: string; betterHigh: boolean }[] = [
  { key: 'hrv', label: 'HRV', betterHigh: true },
  { key: 'restingHeartRate', label: 'Пульс покоя', betterHigh: false },
  { key: 'sleepHours', label: 'Длительность сна', betterHigh: true },
  { key: 'sleepDeep', label: 'Глубокий сон', betterHigh: true },
  { key: 'sleepREM', label: 'REM сон', betterHigh: true },
  { key: 'steps', label: 'Шаги', betterHigh: true },
  { key: 'activeEnergy', label: 'Активные калории', betterHigh: true },
  { key: 'oxygenSaturation', label: 'SpO₂', betterHigh: true },
  { key: 'heartRate', label: 'ЧСС средняя', betterHigh: false },
]

export const isValidMetric = (k: string) => METRIC_OPTIONS.some(m => m.key === k)
export const metricLabel = (k: string) => METRIC_OPTIONS.find(m => m.key === k)?.label ?? k

function metricValue(d: ExpDaily, metric: string): number | null {
  const v = d[metric as keyof ExpDaily]
  if (typeof v === 'number') return metric === 'oxygenSaturation' ? v * 100 : v
  if (typeof v === 'object' && v !== null && 'avg' in v) return (v as { avg: number }).avg
  return null
}

function std(vals: number[]): number {
  if (vals.length < 2) return 0
  const m = vals.reduce((a, b) => a + b, 0) / vals.length
  return Math.sqrt(vals.reduce((s, x) => s + (x - m) ** 2, 0) / (vals.length - 1))
}
const mean = (vals: number[]): number | null =>
  vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null

export function computeResult(daily: ExpDaily[], exp: ExperimentRow): ExperimentResult {
  const betterHigh = METRIC_OPTIONS.find(m => m.key === exp.target_metric)?.betterHigh ?? true
  const baseStart = exp.baseline_start ?? computeBaselineStart(exp.start_date, exp.baseline_days)

  const values = (filter: (d: ExpDaily) => boolean) => daily
    .filter(filter)
    .map(d => metricValue(d, exp.target_metric))
    .filter((v): v is number => v !== null)

  const baselineVals = values(d => d.date >= baseStart && d.date < exp.start_date)
  const expVals = values(d => d.date >= exp.start_date && d.date <= exp.end_date)

  const insufficient =
    baselineVals.length < MIN_N ? { window: 'baseline' as const, n: baselineVals.length, minN: MIN_N }
    : expVals.length < MIN_N ? { window: 'exp' as const, n: expVals.length, minN: MIN_N }
    : null

  const bm = mean(baselineVals)
  const em = mean(expVals)
  const base = {
    baselineMean: bm !== null ? +bm.toFixed(1) : null,
    expMean: em !== null ? +em.toFixed(1) : null,
    baselineN: baselineVals.length,
    expN: expVals.length,
    betterHigh,
    insufficient,
  }
  if (insufficient || bm === null || em === null) {
    return { ...base, delta: null, deltaPct: null, cohenD: null }
  }

  const delta = em - bm
  const deltaPct = bm !== 0 ? (delta / bm) * 100 : null
  const s1 = std(baselineVals), s2 = std(expVals)
  const n1 = baselineVals.length, n2 = expVals.length
  const pooled = Math.sqrt(((n1 - 1) * s1 ** 2 + (n2 - 1) * s2 ** 2) / (n1 + n2 - 2))
  const cohenD = pooled > 0 ? delta / pooled : null

  return {
    ...base,
    delta: +delta.toFixed(1),
    deltaPct: deltaPct !== null ? +deltaPct.toFixed(1) : null,
    cohenD: cohenD !== null ? +cohenD.toFixed(2) : null,
  }
}

export function effectLabel(d: number | null): string {
  if (d === null) return '—'
  const abs = Math.abs(d)
  if (abs >= 0.8) return 'сильный'
  if (abs >= 0.5) return 'средний'
  if (abs >= 0.2) return 'слабый'
  return 'нет эффекта'
}
