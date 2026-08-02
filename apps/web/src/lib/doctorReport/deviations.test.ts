import { describe, it, expect } from 'vitest'
import { median, mad, detectDeviations } from './deviations'
import { addDays } from './dates'
import { METRIC_DEFS, periodFrame, type MetricKey } from './metrics'
import type { DailyMetrics } from '../../types'

const today = '2026-07-31'

// Every metric key, used where a test isn't exercising the gate itself.
const ALL_KEYS: Set<MetricKey> = new Set(METRIC_DEFS.map(m => m.key))

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
    const weeks = detectDeviations(daily, periodFrame(daily, 90, today), ALL_KEYS)
    expect(weeks).toHaveLength(1)
    expect(weeks[0].items.map(x => x.key).sort()).toEqual(['rhr', 'sleep', 'steps'])
  })

  it('stays silent on flat data', () => {
    const daily = fixture(() => null)
    expect(detectDeviations(daily, periodFrame(daily, 90, today), ALL_KEYS)).toEqual([])
  })

  it('ignores a shift smaller than the metric threshold', () => {
    // steps 8% down: statistically lonely, practically nothing (minRel 25)
    const daily = fixture(i => (i >= 58 && i < 65 ? { steps: 8280 } : null))
    expect(detectDeviations(daily, periodFrame(daily, 90, today), ALL_KEYS)).toEqual([])
  })

  it('ignores weeks with fewer than five days of data', () => {
    const daily = fixture(i => (i >= 58 && i < 65 ? { restingHeartRate: 69 } : null))
      .filter(d => !(d.date >= addDays(today, -27) && d.date <= addDays(today, -24)))
    for (const w of detectDeviations(daily, periodFrame(daily, 90, today), ALL_KEYS)) {
      expect(w.days).toBeGreaterThanOrEqual(5)
    }
  })

  it('never reports a metric whose coverage is too thin', () => {
    // 90 flat days, with a 7-day illness window (days -30..-24) shifting resting
    // HR, HRV and sleep together. hrv has full coverage here, so it clears the
    // band on its own; the allowed set is what decides whether it's reported.
    const daily = Array.from({ length: 90 }, (_, i) => {
      const date = addDays(today, -89 + i)
      const sick = date >= addDays(today, -30) && date <= addDays(today, -24)
      return sick
        ? { date, restingHeartRate: 66, hrv: 30, sleepHours: 5.5 }
        : { date, restingHeartRate: 55, hrv: 45, sleepHours: 7 }
    })
    const frame = periodFrame(daily, 90, today)
    const all = detectDeviations(daily, frame, new Set<MetricKey>(['rhr', 'hrv', 'sleep']))
    const gated = detectDeviations(daily, frame, new Set<MetricKey>(['rhr']))
    expect(all.some(w => w.items.some(i => i.key === 'hrv'))).toBe(true)
    expect(gated.some(w => w.items.some(i => i.key === 'hrv'))).toBe(false)
  })
})
