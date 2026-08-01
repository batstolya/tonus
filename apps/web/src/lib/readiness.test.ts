import { describe, it, expect } from 'vitest'
import { computeReadiness, readinessVerdict, type ReadinessScore } from './readiness'
import type { DailyMetrics } from '../types'

// 20 days: baseline window slice(-37,-7) covers the first 13, recent slice(-3) the last 3.
function series(
  base: { hrv: number; rhr: number; sleep: number },
  recent: Partial<{ hrv: number; rhr: number; sleep: number }> = {},
  total = 20,
): DailyMetrics[] {
  const r = { ...base, ...recent }
  return Array.from({ length: total }, (_, i) => {
    const v = i >= total - 3 ? r : base
    return {
      date: `2026-06-${String(i + 1).padStart(2, '0')}`,
      hrv: v.hrv,
      restingHeartRate: v.rhr,
      sleepHours: v.sleep,
    }
  })
}

describe('computeReadiness', () => {
  const NORM = { hrv: 50, rhr: 50, sleep: 8 }

  it('returns null with fewer than 7 days of data', () => {
    expect(computeReadiness(series(NORM).slice(0, 6))).toBeNull()
  })

  it('a day exactly at personal baseline scores ~78 («Хорошая»), not 100', () => {
    const r = computeReadiness(series(NORM))!
    expect(r.score).toBe(78)
    expect(r.label).toBe('Хорошая')
  })

  it('HRV above baseline earns bonus points instead of hitting a cap', () => {
    // recent HRV +14% → 40×(0.75 + 0.5×0.14) = 32.8 → total 80.8 → 81
    const r = computeReadiness(series(NORM, { hrv: 57 }))!
    expect(r.score).toBe(81)
    expect(r.label).toBe('Отличная')
  })

  it('elevated resting HR costs noticeably more than the old ~1.7 points', () => {
    // recent RHR +6% → ratio 50/53 → 30×(0.75 − 2×0.0566) ≈ 19.1 → total ≈ 74.6 → 75
    const r = computeReadiness(series(NORM, { rhr: 53 }))!
    expect(r.score).toBe(75)
  })

  it('a genuinely excellent day reaches 100', () => {
    // HRV +50%, RHR −12%, 9h sleep: all components at their caps
    const r = computeReadiness(series(NORM, { hrv: 75, rhr: 44, sleep: 9 }))!
    expect(r.score).toBe(100)
    expect(r.label).toBe('Отличная')
  })

  it('a rough day drops into «Средняя»', () => {
    // HRV −50% → 20; RHR +15% → ≈14.7; sleep 5h → ≈15.9; total ≈ 50.6 → 51
    const r = computeReadiness(series(NORM, { hrv: 25, rhr: 57.5, sleep: 5 }))!
    expect(r.score).toBe(51)
    expect(r.label).toBe('Средняя')
  })

  it('sleep beyond 9h does not earn extra points', () => {
    const nine = computeReadiness(series(NORM, { sleep: 9 }))!
    const eleven = computeReadiness(series(NORM, { sleep: 11 }))!
    expect(eleven.components.sleep).toBe(nine.components.sleep)
    expect(nine.components.sleep).toBe(30)
  })

  it('falls back to absolute anchors when there is no baseline window', () => {
    // exactly 7 days → baseline slice is empty; anchors 50ms HRV / 55 bpm RHR = norm level
    const r = computeReadiness(series({ hrv: 50, rhr: 55, sleep: 8 }, {}, 7))!
    expect(r.score).toBe(78)
  })

  it('keeps components within their UI bar maxima (40/30/30)', () => {
    const r = computeReadiness(series(NORM, { hrv: 100, rhr: 30, sleep: 12 }))!
    expect(r.components.hrv).toBeLessThanOrEqual(40)
    expect(r.components.rhr).toBeLessThanOrEqual(30)
    expect(r.components.sleep).toBeLessThanOrEqual(30)
  })
})

function make(partial: Partial<ReadinessScore>): ReadinessScore {
  return {
    score: 0, label: 'Средняя', color: '', fill: '',
    components: { hrv: null, rhr: null, sleep: null },
    baseline: { hrv: null, rhr: null, sleep: null },
    today: { hrv: null, rhr: null, sleep: null },
    ...partial,
  }
}

describe('readinessVerdict', () => {
  it('maps each band to its sentence key', () => {
    expect(readinessVerdict(make({ label: 'Отличная', components: { hrv: 38, rhr: 20, sleep: 22 } })).bandKey)
      .toBe('Организм отлично восстановился — хороший день для нагрузки и важных дел.')
    expect(readinessVerdict(make({ label: 'Хорошая', components: { hrv: 30, rhr: 20, sleep: 20 } })).bandKey)
      .toBe('Ты в хорошей форме — можно работать в обычном ритме.')
    expect(readinessVerdict(make({ label: 'Средняя', components: { hrv: 20, rhr: 15, sleep: 15 } })).bandKey)
      .toBe('Восстановление неполное — лучше умеренная нагрузка и лечь пораньше.')
    expect(readinessVerdict(make({ label: 'Низкая', components: { hrv: 10, rhr: 8, sleep: 6 } })).bandKey)
      .toBe('Организм не восстановился — сегодня отдых, без перегрузок.')
  })

  it('good band: names the strongest component as a positive driver', () => {
    // hrv 38/40=.95 is the top contributor
    const v = readinessVerdict(make({ label: 'Отличная', components: { hrv: 38, rhr: 20, sleep: 22 } }))
    expect(v.driverKey).toBe('Главный плюс — высокое восстановление')
  })

  it('weak band: names the weakest component as a negative driver', () => {
    // sleep 6/30=.2 is the worst contributor
    const v = readinessVerdict(make({ label: 'Низкая', components: { hrv: 20, rhr: 18, sleep: 6 } }))
    expect(v.driverKey).toBe('Слабое место — нехватка сна')
  })

  it('good band with low resting-pulse score names resting pulse', () => {
    // rhr 28/30=.933 beats sleep 10/30=.333; hrv null is excluded
    const v = readinessVerdict(make({ label: 'Хорошая', components: { hrv: null, rhr: 28, sleep: 10 } }))
    expect(v.driverKey).toBe('Главный плюс — низкий пульс покоя')
  })

  it('omits the driver clause when no component scores exist', () => {
    const v = readinessVerdict(make({ label: 'Средняя', components: { hrv: null, rhr: null, sleep: null } }))
    expect(v.driverKey).toBeNull()
  })
})
