import { describe, it, expect } from 'vitest'
import { makeDemoDaily, makeDemoHRSamples } from './demoFixture'
import { computeDailyScores } from './scores'

// Смоук демо-режима: лендинг («Посмотреть демо» / VITE_DEMO=1) целиком живёт
// на этих фикстурах — сломанная генерация означает пустое/битое демо.
describe('makeDemoDaily', () => {
  const daily = makeDemoDaily(90)

  it('generates the requested number of days ending today', () => {
    expect(daily).toHaveLength(90)
    expect(daily[daily.length - 1].date).toBe(new Date().toISOString().slice(0, 10))
  })

  it('produces consecutive unique dates in ascending order', () => {
    for (let i = 1; i < daily.length; i++) {
      const prev = new Date(daily[i - 1].date + 'T00:00:00Z').getTime()
      const cur = new Date(daily[i].date + 'T00:00:00Z').getTime()
      expect(cur - prev, `${daily[i - 1].date} → ${daily[i].date}`).toBe(24 * 3600 * 1000)
    }
  })

  it('has no NaN and stays within sane physiological ranges', () => {
    for (const d of daily) {
      for (const [k, v] of Object.entries(d)) {
        if (typeof v === 'number') expect(Number.isNaN(v), `${d.date} ${k} is NaN`).toBe(false)
      }
      expect(d.restingHeartRate!).toBeGreaterThan(35)
      expect(d.restingHeartRate!).toBeLessThan(90)
      expect(d.hrv!).toBeGreaterThan(10)
      expect(d.hrv!).toBeLessThan(150)
      expect(d.sleepHours!).toBeGreaterThan(3)
      expect(d.sleepHours!).toBeLessThan(12)
      expect(d.oxygenSaturation!).toBeGreaterThan(0.9)
      expect(d.oxygenSaturation!).toBeLessThanOrEqual(1)
      expect(d.steps!).toBeGreaterThanOrEqual(0)
    }
  })

  it('feeds computeDailyScores: scores exist for every day after the 5-day warmup', () => {
    const scores = computeDailyScores(daily)
    expect(scores).toHaveLength(85) // 90 − 5 дней на разгон базовой линии
    const last = scores[scores.length - 1]
    expect(last.readiness).not.toBeNull()
    expect(last.recovery_score).not.toBeNull()
    expect(last.sleep_score).not.toBeNull()
  })
})

describe('demo correlations showcase', () => {
  it('fixtures produce at least 3 visible correlations (витрина «Связей»)', async () => {
    const { computeLagCorrelations } = await import('./correlations')
    const { makeDemoEnvironment } = await import('./demoFixture')
    const res = computeLagCorrelations({
      daily: makeDemoDaily(90),
      scores: [],
      intake: [],
      environment: makeDemoEnvironment(90),
    })
    if ('needMoreDays' in res) throw new Error('фикстур должно хватать')
    expect(res.correlations.length).toBeGreaterThanOrEqual(3)
    // погодная связь — часть витрины F5
    expect(res.correlations.some(c => c.factor === 'temp')).toBe(true)
  })
})

describe('makeDemoHRSamples', () => {
  it('generates 10-minute samples with sane values', () => {
    const samples = makeDemoHRSamples(2)
    expect(samples).toHaveLength(2 * 24 * 6)
    for (const s of samples) {
      expect(s.value).toBeGreaterThan(30)
      expect(s.value).toBeLessThan(220)
      expect(Number.isNaN(s.time.getTime())).toBe(false)
    }
  })
})
