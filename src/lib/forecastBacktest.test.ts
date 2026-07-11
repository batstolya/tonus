import { describe, it, expect } from 'vitest'
import { makeDemoDaily } from './demoFixture'
import { computeDailyScores } from './scores'
import { backtestForecast } from './forecastBacktest'

describe('backtestForecast', () => {
  it('на демо-истории даёт метрики качества и печатает их', () => {
    const daily = makeDemoDaily(90)
    const scores = computeDailyScores(daily)
    const result = backtestForecast(daily, scores)
    expect(result).not.toBeNull()
    expect(result!.n).toBeGreaterThan(10)
    expect(result!.mae).toBeGreaterThanOrEqual(0)
    expect(result!.within10).toBeGreaterThanOrEqual(0)
    expect(result!.within10).toBeLessThanOrEqual(1)
    // калибровочный вывод — смотреть при прогоне
    console.log(`forecast backtest: n=${result!.n} MAE=${result!.mae.toFixed(1)} within10=${(result!.within10 * 100).toFixed(0)}%`)
  })

  it('пустая история → null', () => {
    expect(backtestForecast([], [])).toBeNull()
  })
})
