// Лаг-корреляции (F3, smart-tonus) — порт src/lib/correlations.ts для
// использования из чата (design doc, раздел 9.1, get_correlations).
// Детерминированная статистика без AI: Пирсон между фактором дня X и исходом
// дня X+lag (lag 0 — тот же день, 1 — следующий). Минимум 14 парных дней,
// показываем только |r| ≥ 0.3, топ-5. «Сильная» связь = |r| ≥ 0.5 и n ≥ 21.
// Лаг 2 не считаем сознательно: больше сравнений — больше ложных связей.

export type CorrFactor =
  | 'coffee' | 'alcohol' | 'exerciseMinutes' | 'steps' | 'bedtime'
  | 'pressure' | 'pressureDelta' | 'temp' | 'daylight'
export type CorrOutcome = 'sleepHours' | 'hrv' | 'restingHeartRate' | 'readiness'

export interface CorrDailyRow {
  date: string
  hrv?: number
  restingHeartRate?: number
  sleepHours?: number
  sleepBedtime?: string // ISO
  steps?: number
  exerciseMinutes?: number
}

export interface EnvDay {
  date: string
  temp_c: number | null
  pressure_hpa: number | null
  daylight_minutes: number | null
  precipitation_mm: number | null
}

export interface Correlation {
  factor: CorrFactor
  outcome: CorrOutcome
  lag: 0 | 1
  r: number
  n: number
  strength: 'strong' | 'notable'
  direction: 'up' | 'down'
}

export interface CorrelationsInput {
  daily: CorrDailyRow[]
  scores: { date: string; readiness: number | null }[]
  intake: { ts: string; type: string }[]
  environment?: EnvDay[]
}

export type CorrelationsResult =
  | { correlations: Correlation[] }
  | { needMoreDays: number }

const MIN_PAIRS = 14
const STRONG_R = 0.5
const STRONG_N = 21
const SHOW_R = 0.3
const TOP = 5

function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let cov = 0, vx = 0, vy = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my
    cov += dx * dy; vx += dx * dx; vy += dy * dy
  }
  if (vx === 0 || vy === 0) return null
  return cov / Math.sqrt(vx * vy)
}

function bedtimeMinutes(iso: string | undefined): number | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  let h = d.getUTCHours() + d.getUTCMinutes() / 60
  if (h < 12) h += 24
  return Math.round((h - 22) * 60)
}

export function computeLagCorrelations(input: CorrelationsInput): CorrelationsResult {
  const sorted = [...input.daily].sort((a, b) => a.date.localeCompare(b.date))
  const dates = sorted.map(d => d.date)
  const index = new Map(dates.map((d, i) => [d, i]))

  const countByDay = (type: string): Map<string, number> => {
    const m = new Map<string, number>()
    for (const e of input.intake) {
      if (e.type !== type) continue
      const day = e.ts.slice(0, 10)
      m.set(day, (m.get(day) ?? 0) + 1)
    }
    return m
  }
  const coffee = countByDay('coffee')
  const alcohol = countByDay('alcohol')
  const readinessByDay = new Map(input.scores.map(s => [s.date, s.readiness]))
  const envByDay = new Map((input.environment ?? []).map(e => [e.date, e]))
  const prevDate = (d: string): string => {
    const dt = new Date(d + 'T00:00:00Z')
    dt.setUTCDate(dt.getUTCDate() - 1)
    return dt.toISOString().slice(0, 10)
  }

  const factorValue = (f: CorrFactor, i: number): number | null => {
    const d = sorted[i]
    switch (f) {
      case 'coffee': return coffee.get(d.date) ?? 0
      case 'alcohol': return alcohol.get(d.date) ?? 0
      case 'exerciseMinutes': return d.exerciseMinutes ?? null
      case 'steps': return d.steps ?? null
      case 'bedtime': return bedtimeMinutes(d.sleepBedtime)
      case 'pressure': return envByDay.get(d.date)?.pressure_hpa ?? null
      case 'pressureDelta': {
        const cur = envByDay.get(d.date)?.pressure_hpa
        const prev = envByDay.get(prevDate(d.date))?.pressure_hpa
        return cur != null && prev != null ? cur - prev : null
      }
      case 'temp': return envByDay.get(d.date)?.temp_c ?? null
      case 'daylight': return envByDay.get(d.date)?.daylight_minutes ?? null
    }
  }
  const outcomeValue = (o: CorrOutcome, i: number): number | null => {
    const d = sorted[i]
    switch (o) {
      case 'sleepHours': return d.sleepHours ?? null
      case 'hrv': return d.hrv ?? null
      case 'restingHeartRate': return d.restingHeartRate ?? null
      case 'readiness': return readinessByDay.get(d.date) ?? null
    }
  }

  const factors: CorrFactor[] = [
    'coffee', 'alcohol', 'exerciseMinutes', 'steps', 'bedtime',
    'pressure', 'pressureDelta', 'temp', 'daylight',
  ]
  const outcomes: CorrOutcome[] = ['sleepHours', 'hrv', 'restingHeartRate', 'readiness']
  const lags: (0 | 1)[] = [0, 1]

  const out: Correlation[] = []
  let maxPairs = 0

  for (const factor of factors) {
    for (const outcome of outcomes) {
      for (const lag of lags) {
        const xs: number[] = [], ys: number[] = []
        for (let i = 0; i < sorted.length; i++) {
          const j = lag === 0 ? i : index.get(dates[i]) != null ? i + 1 : -1
          if (j < 0 || j >= sorted.length) continue
          if (lag === 1) {
            const next = new Date(dates[i] + 'T00:00:00Z')
            next.setUTCDate(next.getUTCDate() + 1)
            if (dates[j] !== next.toISOString().slice(0, 10)) continue
          }
          const x = factorValue(factor, i)
          const y = outcomeValue(outcome, j)
          if (x == null || y == null) continue
          xs.push(x); ys.push(y)
        }
        maxPairs = Math.max(maxPairs, xs.length)
        if (xs.length < MIN_PAIRS) continue
        const r = pearson(xs, ys)
        if (r == null || Math.abs(r) < SHOW_R) continue
        out.push({
          factor, outcome, lag,
          r, n: xs.length,
          strength: Math.abs(r) >= STRONG_R && xs.length >= STRONG_N ? 'strong' : 'notable',
          direction: r > 0 ? 'up' : 'down',
        })
      }
    }
  }

  if (!out.length && maxPairs < MIN_PAIRS) return { needMoreDays: MIN_PAIRS - maxPairs }
  out.sort((a, b) => Math.abs(b.r) - Math.abs(a.r))
  return { correlations: out.slice(0, TOP) }
}
