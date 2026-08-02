import { describe, it, expect } from 'vitest'
import { translations } from '../../lib/translations'
import { computeGaps } from '../../lib/dataCompleteness'
import type { DailyMetrics } from '../../types'

// The badge rendered gap labels straight from dataCompleteness, so "Пульс покоя"
// stayed Russian inside an otherwise Ukrainian popup. Every tracked label must
// resolve — including the ones that never had a dictionary entry.
const STRINGS = [
  'Пробелы в данных за',
  'нет данных за',
  'Выводы ИИ менее точны при пробелах в данных.',
]

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function trackedLabels(): string[] {
  // Dates must sit inside the 14-day window computeGaps looks at, so they are
  // relative to today rather than fixed. One full day + one empty day makes
  // every tracked metric report a gap.
  const daily: DailyMetrics[] = [
    {
      date: daysAgo(2),
      hrv: 60, restingHeartRate: 50, sleepHours: 7, steps: 8000,
      activeEnergy: 400, oxygenSaturation: 97,
    },
    { date: daysAgo(1) },
  ] as DailyMetrics[]
  return computeGaps(daily, 14).map(g => g.label)
}

describe('DataGapsBadge strings', () => {
  it('has uk + en translations for every gap label', () => {
    const labels = trackedLabels()
    expect(labels.length).toBeGreaterThan(0)
    for (const label of labels) {
      const entry = translations[label]
      expect(entry, `missing translation for gap label "${label}"`).toBeDefined()
      expect(entry.uk).toBeTruthy()
      expect(entry.en).toBeTruthy()
    }
  })

  it('has uk + en translations for the popup chrome', () => {
    for (const key of STRINGS) {
      const entry = translations[key]
      expect(entry, `missing translation for "${key}"`).toBeDefined()
      expect(entry.uk).toBeTruthy()
      expect(entry.en).toBeTruthy()
    }
  })
})
