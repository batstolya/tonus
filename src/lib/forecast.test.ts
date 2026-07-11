import { describe, it, expect } from 'vitest'
import { forecastReadiness, type ForecastInput } from './forecast'

const base = (over: Partial<ForecastInput> = {}): ForecastInput => ({
  readinessLast3: [70, 70, 70],
  sleepLast3: [7.5, 7.5, 7.5],
  sleepBaseline: 7.5,
  alcoholToday: false,
  lateCoffeeToday: false,
  exerciseMinutesToday: null,
  kpToday: null,
  ...over,
})

describe('forecastReadiness', () => {
  it('нет трёх дней readiness → null', () => {
    expect(forecastReadiness(base({ readinessLast3: [null, 70, 70] }))).toBeNull()
    expect(forecastReadiness(base({ readinessLast3: [70, 70, null] }))).toBeNull()
  })

  it('база — взвешенное среднее 0.2/0.3/0.5, без факторов', () => {
    const f = forecastReadiness(base({ readinessLast3: [60, 80, 70] }))!
    expect(f.score).toBe(71) // 0.2·60 + 0.3·80 + 0.5·70
    expect(f.factors).toEqual([])
    expect(f.adviceId).toBeNull()
  })

  it('долг сна: средний сон 3 дней < baseline − 1 → −10', () => {
    const f = forecastReadiness(base({ sleepLast3: [6, 6.2, 6.1] }))!
    expect(f.factors).toContainEqual({ id: 'sleep_debt', delta: -10 })
    expect(f.score).toBe(60)
  })

  it('долг сна не срабатывает без baseline или при < 2 известных ночах', () => {
    expect(forecastReadiness(base({ sleepLast3: [6, 6, 6], sleepBaseline: null }))!.factors).toEqual([])
    expect(forecastReadiness(base({ sleepLast3: [6, null, null] }))!.factors).toEqual([])
  })

  it('алкоголь −15, поздний кофе −5, буря (kp≥5) −5', () => {
    const f = forecastReadiness(base({ alcoholToday: true, lateCoffeeToday: true, kpToday: 5 }))!
    expect(f.factors).toContainEqual({ id: 'alcohol', delta: -15 })
    expect(f.factors).toContainEqual({ id: 'late_coffee', delta: -5 })
    expect(f.factors).toContainEqual({ id: 'storm', delta: -5 })
    expect(f.score).toBe(45)
  })

  it('тяжёлый день: нагрузка ≥60 мин при readiness сегодня <70 → −8', () => {
    const f = forecastReadiness(base({ readinessLast3: [70, 70, 65], exerciseMinutesToday: 75 }))!
    expect(f.factors).toContainEqual({ id: 'heavy_day', delta: -8 })
    // при readiness 70 — не срабатывает
    expect(forecastReadiness(base({ exerciseMinutesToday: 75 }))!.factors).toEqual([])
  })

  it('восходящий тренд 3 дня → +5', () => {
    const f = forecastReadiness(base({ readinessLast3: [60, 65, 70] }))!
    expect(f.factors).toContainEqual({ id: 'uptrend', delta: 5 })
  })

  it('итог зажат в 0–100', () => {
    const f = forecastReadiness(base({
      readinessLast3: [10, 10, 10], sleepLast3: [5, 5, 5],
      alcoholToday: true, lateCoffeeToday: true, kpToday: 7,
    }))!
    expect(f.score).toBe(0)
  })

  it('advice — самый тяжёлый негативный фактор', () => {
    const f = forecastReadiness(base({ alcoholToday: true, lateCoffeeToday: true }))!
    expect(f.adviceId).toBe('alcohol')
  })

  it('без негативных факторов advice отсутствует', () => {
    const f = forecastReadiness(base({ readinessLast3: [60, 65, 70] }))!
    expect(f.adviceId).toBeNull()
  })
})
