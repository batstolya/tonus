import { describe, it, expect } from 'vitest'
import { computeDailyScores } from './scores.ts'

// Зеркало src/lib/scores.ts — golden-значения посчитаны вручную по формулам.
const day = (date: string, hrv: number, rhr: number, sleep: number, steps: number) =>
  ({ date, hrv, restingHeartRate: rhr, sleepHours: sleep, steps })

describe('computeDailyScores', () => {
  it('skips days with fewer than 5 prior days of history', () => {
    const input = ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05']
      .map(d => day(d, 50, 60, 8, 10000))
    expect(computeDailyScores(input)).toEqual([])
  })

  it('scores a steady baseline day as perfect (readiness/recovery/sleep=100, stress=0)', () => {
    const dates = ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06', '2026-06-07']
    const out = computeDailyScores(dates.map(d => day(d, 50, 60, 8, 10000)))
    expect(out).toHaveLength(2) // только i=5 и i=6 имеют ≥5 prior-дней
    expect(out[out.length - 1]).toMatchObject({
      date: '2026-06-07', readiness: 100, recovery_score: 100, sleep_score: 100, stress_score: 0,
      hrv_baseline: 50, rhr_baseline: 60, sleep_baseline: 8, steps_baseline: 10000,
    })
  })

  it('drops readiness when HRV falls below personal baseline', () => {
    const base = ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05'].map(d => day(d, 80, 55, 8, 9000))
    const out = computeDailyScores([...base, day('2026-06-06', 40, 55, 8, 9000)])
    const r = out.find(s => s.date === '2026-06-06')!
    // hrvS=clamp(40*40/80)=20, rhrS=30, slS=30 → 80/100; recovery: 50*0.6+100*0.4=70
    expect(r.readiness).toBe(80)
    expect(r.recovery_score).toBe(70)
    expect(r.stress_score).toBe(30)
  })
})
