import { describe, it, expect } from 'vitest'
import { generateInsights } from './insights'
import { translations } from './translations'
import type { DailyMetrics } from '../types'

// The insight texts used to be hardcoded Russian sentences, so uk/en users read
// Russian observations. They are translation keys now — every key must resolve.
function days(n: number, make: (i: number) => Partial<DailyMetrics>): DailyMetrics[] {
  return Array.from({ length: n }, (_, i) => ({
    date: `2026-07-${String(i + 1).padStart(2, '0')}`,
    ...make(i),
  })) as DailyMetrics[]
}

describe('generateInsights', () => {
  it('returns translation keys with placeholder values, not baked-in text', () => {
    const daily = days(14, i => ({ hrv: i < 7 ? 40 : 60, restingHeartRate: i < 7 ? 60 : 50 }))
    const insights = generateInsights(daily)

    expect(insights.length).toBeGreaterThan(0)
    for (const insight of insights) {
      expect(insight.key).toContain('{n}')
      expect(insight.vars.n).toBeDefined()
    }
  })

  it('has uk + en translations for every insight key and metric label', () => {
    const cases: DailyMetrics[][] = [
      days(14, i => ({ hrv: i < 7 ? 60 : 40, restingHeartRate: i < 7 ? 50 : 60 })),
      days(14, i => ({ hrv: i < 7 ? 40 : 60, restingHeartRate: i < 7 ? 60 : 50 })),
      days(14, () => ({ sleepHours: 5 })),
    ]
    const seen = new Set<string>()
    for (const daily of cases) {
      for (const insight of generateInsights(daily)) {
        seen.add(insight.key)
        seen.add(insight.metric)
      }
    }
    expect(seen.size).toBeGreaterThanOrEqual(4)
    for (const key of seen) {
      const entry = translations[key]
      expect(entry, `missing translation for "${key}"`).toBeDefined()
      expect(entry.uk).toBeTruthy()
      expect(entry.en).toBeTruthy()
    }
  })
})
