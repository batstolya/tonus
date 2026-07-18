import { describe, it, expect } from 'vitest'
import { makeDemoDaily, makeDemoHRSamples, makeDemoEvents } from './demoFixture'
import { computeDailyScores } from './scores'
import { buildStressMap } from './stressMap'

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

  it('kp_index в фикстуре среды: диапазон 0–9 и есть дни с бурей (Kp >= 5)', async () => {
    const { makeDemoEnvironment } = await import('./demoFixture')
    const env = makeDemoEnvironment(90)
    for (const d of env) {
      expect(d.kp_index).toBeGreaterThanOrEqual(0)
      expect(d.kp_index).toBeLessThanOrEqual(9)
    }
    expect(env.some(d => d.kp_index >= 5)).toBe(true)
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

describe('makeDemoEvents', () => {
  const events = makeDemoEvents()
  const samples = makeDemoHRSamples()

  it('generates a non-trivial set of events', () => {
    expect(events.length).toBeGreaterThanOrEqual(10)
  })

  it('gives every event a unique uid and end after start', () => {
    const uids = new Set(events.map(e => e.uid))
    expect(uids.size).toBe(events.length)
    for (const e of events) {
      expect(e.end.getTime()).toBeGreaterThan(e.start.getTime())
    }
  })

  it('places all events inside the 7-day HR sample window', () => {
    const now = Date.now()
    const weekAgo = now - 7 * 24 * 3600 * 1000
    for (const e of events) {
      expect(e.start.getTime(), e.title).toBeGreaterThanOrEqual(weekAgo)
      expect(e.start.getTime(), e.title).toBeLessThanOrEqual(now)
    }
  })

  it('includes at least one physical-activity event', () => {
    const map = buildStressMap(events, samples)
    expect(map.some(m => m.isPhysicalActivity)).toBe(true)
  })

  it('yields non-null heart-rate deltas against demo HR samples', () => {
    const map = buildStressMap(events, samples)
    expect(map.every(m => m.heartRateDelta !== null)).toBe(true)
  })

  it('is deterministic', () => {
    const a = makeDemoEvents()
    const b = makeDemoEvents()
    expect(a.map(e => e.uid + e.start.toISOString())).toEqual(
      b.map(e => e.uid + e.start.toISOString()),
    )
  })
})
