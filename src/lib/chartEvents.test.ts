import { describe, it, expect } from 'vitest'
import { eventMarkers, groupMarkersByDate, MAX_LABELED_MARKER_DATES } from './chartEvents'
import type { IntakeEvent } from './chat'

const ev = (ts: string, type: string): IntakeEvent =>
  ({ id: ts + type, ts, type, amount: null, unit: null, note: null }) as IntakeEvent

describe('groupMarkersByDate', () => {
  it('merges several events on the same date into one marker', () => {
    const markers = eventMarkers(
      [ev('2026-07-01T10:00:00Z', 'alcohol'), ev('2026-07-01T18:00:00Z', 'stress'), ev('2026-07-02T09:00:00Z', 'workout')],
      new Set(['07-01', '07-02']),
      iso => iso.slice(5),
    )
    const grouped = groupMarkersByDate(markers)
    expect(grouped).toHaveLength(2)
    expect(grouped[0]).toEqual({ x: '07-01', emojis: ['🍷', '😰'], color: '#f43f5e' })
    expect(grouped[1].emojis).toEqual(['🏋️'])
  })

  it('keeps one emoji per type per date (eventMarkers dedupes upstream)', () => {
    const markers = eventMarkers(
      [ev('2026-07-01T10:00:00Z', 'alcohol'), ev('2026-07-01T22:00:00Z', 'alcohol')],
      new Set(['07-01']),
      iso => iso.slice(5),
    )
    expect(groupMarkersByDate(markers)[0].emojis).toEqual(['🍷'])
  })

  it('exposes a sane label-density cap', () => {
    expect(MAX_LABELED_MARKER_DATES).toBeGreaterThan(0)
    expect(MAX_LABELED_MARKER_DATES).toBeLessThanOrEqual(15)
  })
})
