// Бэктест прогноза readiness (SPEC-READINESS-FORECAST §3.4).
// Инструмент калибровки констант движка, не продакшн-код: для каждого дня
// истории строит прогноз по данным «до вечера» и сравнивает с фактическим
// readiness следующего дня.
import { forecastReadiness } from './forecast'
import type { DailyScore } from './scores'
import type { DailyMetrics } from '../types'

export interface BacktestResult {
  n: number        // сколько дней удалось спрогнозировать и проверить
  mae: number      // средняя абсолютная ошибка, пункты readiness
  within10: number // доля прогнозов с ошибкой ≤ 10 пунктов (0..1)
}

// События (алкоголь/кофе) в бэктест по метрикам не попадают — прогноз
// консервативный, «событийные» факторы оцениваются отдельно на живых данных.
export function backtestForecast(daily: DailyMetrics[], scores: DailyScore[]): BacktestResult | null {
  const byDate = new Map(daily.map(d => [d.date, d]))
  const errors: number[] = []
  for (let i = 2; i < scores.length - 1; i++) {
    const last3 = scores.slice(i - 2, i + 1)
    const actual = scores[i + 1].readiness
    if (actual == null) continue
    const f = forecastReadiness({
      readinessLast3: last3.map(s => s.readiness),
      sleepLast3: last3.map(s => byDate.get(s.date)?.sleepHours ?? null),
      sleepBaseline: last3[2].sleep_baseline,
      alcoholToday: false,
      lateCoffeeToday: false,
      exerciseMinutesToday: byDate.get(last3[2].date)?.exerciseMinutes ?? null,
      kpToday: null,
    })
    if (f) errors.push(Math.abs(f.score - actual))
  }
  if (!errors.length) return null
  return {
    n: errors.length,
    mae: errors.reduce((a, b) => a + b, 0) / errors.length,
    within10: errors.filter(e => e <= 10).length / errors.length,
  }
}
