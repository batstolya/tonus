// Серверная копия прогноза readiness (SPEC-READINESS-FORECAST §2).
// ЗЕРКАЛО src/lib/forecast.ts — менять синхронно, parity-тест в src/lib/forecast.test.ts.
// Чистый модуль без Deno/браузерных зависимостей — тестируется vitest напрямую.

export type FactorId = 'sleep_debt' | 'alcohol' | 'late_coffee' | 'heavy_day' | 'storm' | 'uptrend'

export interface ForecastInput {
  readinessLast3: (number | null)[] // [позавчера, вчера, сегодня]
  sleepLast3: (number | null)[]     // часы сна, тот же порядок
  sleepBaseline: number | null
  alcoholToday: boolean
  lateCoffeeToday: boolean          // событие coffee после 18:00 локального
  exerciseMinutesToday: number | null
  kpToday: number | null            // сегодняшний Kp — прокси на завтра
}

export interface ForecastFactor { id: FactorId; delta: number }

export interface Forecast {
  score: number                     // 0–100
  factors: ForecastFactor[]
  adviceId: FactorId | null         // самый тяжёлый негативный фактор
}

export function forecastReadiness(input: ForecastInput): Forecast | null {
  const [r0, r1, r2] = input.readinessLast3
  if (r0 == null || r1 == null || r2 == null) return null

  const factors: ForecastFactor[] = []

  const sleeps = input.sleepLast3.filter((v): v is number => v != null)
  if (input.sleepBaseline != null && sleeps.length >= 2) {
    const avg = sleeps.reduce((a, b) => a + b, 0) / sleeps.length
    if (avg < input.sleepBaseline - 1) factors.push({ id: 'sleep_debt', delta: -10 })
  }
  if (input.alcoholToday) factors.push({ id: 'alcohol', delta: -15 })
  if (input.lateCoffeeToday) factors.push({ id: 'late_coffee', delta: -5 })
  if (input.exerciseMinutesToday != null && input.exerciseMinutesToday >= 60 && r2 < 70)
    factors.push({ id: 'heavy_day', delta: -8 })
  if (input.kpToday != null && input.kpToday >= 5) factors.push({ id: 'storm', delta: -5 })
  if (r0 < r1 && r1 < r2) factors.push({ id: 'uptrend', delta: 5 })

  const baseScore = 0.2 * r0 + 0.3 * r1 + 0.5 * r2
  const total = baseScore + factors.reduce((a, f) => a + f.delta, 0)
  const score = Math.max(0, Math.min(100, Math.round(total)))

  const negative = factors.filter(f => f.delta < 0).sort((a, b) => a.delta - b.delta)
  return { score, factors, adviceId: negative[0]?.id ?? null }
}
