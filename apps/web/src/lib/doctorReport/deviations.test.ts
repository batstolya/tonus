import { describe, it, expect } from 'vitest'
import { median, mad, detectDeviations } from './deviations'
import { addDays, periodFrame } from './metrics'
import type { DailyMetrics } from '../../types'

const today = '2026-07-31'

// 12 flat weeks ending today, then a caller-supplied override for one week.
function fixture(sick: (i: number) => Partial<DailyMetrics> | null): DailyMetrics[] {
  return Array.from({ length: 84 }, (_, i) => {
    const date = addDays(today, -83 + i)
    return { date, restingHeartRate: 58, sleepHours: 7, steps: 9000, ...(sick(i) ?? {}) }
  })
}

describe('median and mad', () => {
  it('mad is not inflated by the outlier it must find', () => {
    const flat = [10, 10, 10, 10, 10, 10, 10, 10, 10, 40]
    expect(median(flat)).toBe(10)
    expect(mad(flat)).toBe(0)
    // the mean-and-sigma pair would have hidden it: sigma here is ~9
  })
})

describe('detectDeviations', () => {
  it('surfaces a week where several metrics move together', () => {
    // days 58..64 are the Monday week of 2026-07-06: resting HR up, sleep and
    // steps down. The window has to start on a Monday, or the shift is split
    // across two calendar weeks and each half falls under its own threshold.
    const daily = fixture(i => (i >= 58 && i < 65
      ? { restingHeartRate: 69, sleepHours: 5, steps: 3000 }
      : null))
    const weeks = detectDeviations(daily, periodFrame(daily, 90, today))
    expect(weeks).toHaveLength(1)
    expect(weeks[0].items.map(x => x.key).sort()).toEqual(['rhr', 'sleep', 'steps'])
  })

  it('stays silent on flat data', () => {
    const daily = fixture(() => null)
    expect(detectDeviations(daily, periodFrame(daily, 90, today))).toEqual([])
  })

  it('ignores a shift smaller than the metric threshold', () => {
    // steps 8% down: statistically lonely, practically nothing (minRel 25)
    const daily = fixture(i => (i >= 58 && i < 65 ? { steps: 8280 } : null))
    expect(detectDeviations(daily, periodFrame(daily, 90, today))).toEqual([])
  })

  it('ignores weeks with fewer than five days of data', () => {
    const daily = fixture(i => (i >= 58 && i < 65 ? { restingHeartRate: 69 } : null))
      .filter(d => !(d.date >= addDays(today, -27) && d.date <= addDays(today, -24)))
    for (const w of detectDeviations(daily, periodFrame(daily, 90, today))) expect(w.days).toBeGreaterThanOrEqual(5)
  })
})
