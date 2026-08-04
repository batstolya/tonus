import { describe, it, expect } from 'vitest'
import { mergeDaily } from './mergeDaily'
import type { DailyMetrics } from '../types'

const d = (date: string, extra: Partial<DailyMetrics> = {}): DailyMetrics => ({ date, ...extra })

// The dashboard paints from a recent window, then the rest of the history
// arrives and is folded in. Order and uniqueness by date are what every screen
// relies on — they all do `daily.slice(-N)`.
describe('mergeDaily', () => {
  it('puts older days before newer ones', () => {
    const merged = mergeDaily([d('2026-08-01'), d('2026-08-02')], [d('2019-02-08')])
    expect(merged.map(x => x.date)).toEqual(['2019-02-08', '2026-08-01', '2026-08-02'])
  })

  it('keeps one entry per date', () => {
    const merged = mergeDaily([d('2026-08-01')], [d('2026-08-01')])
    expect(merged).toHaveLength(1)
  })

  // The window is loaded second-hand and later; where both have a date, the
  // fresher copy is the window's.
  it('prefers the window copy on a collision', () => {
    const merged = mergeDaily([d('2026-08-01', { steps: 9000 })], [d('2026-08-01', { steps: 10 })])
    expect(merged[0].steps).toBe(9000)
  })

  it('sorts an unordered input', () => {
    const merged = mergeDaily([d('2026-08-03'), d('2026-08-01')], [d('2026-07-01')])
    expect(merged.map(x => x.date)).toEqual(['2026-07-01', '2026-08-01', '2026-08-03'])
  })

  it('handles either side being empty', () => {
    expect(mergeDaily([], [d('2026-01-01')]).map(x => x.date)).toEqual(['2026-01-01'])
    expect(mergeDaily([d('2026-01-01')], []).map(x => x.date)).toEqual(['2026-01-01'])
    expect(mergeDaily([], [])).toEqual([])
  })
})
