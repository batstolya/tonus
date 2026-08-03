import { describe, it, expect } from 'vitest'
import { eventMarkers, groupMarkersByDate, markersByDate, MAX_MARKER_DOTS } from './chartEvents'
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
    expect(grouped[0].x).toBe('07-01')
    expect(grouped[0].events.map(e => e.emoji)).toEqual(['🍷', '😰'])
    expect(grouped[0].color).toBe('var(--chart-axis)')
    expect(grouped[1].events.map(e => e.emoji)).toEqual(['🏋️'])
  })

  it('carries the label of every event type so the tooltip can name them', () => {
    const markers = eventMarkers(
      [ev('2026-07-01T10:00:00Z', 'alcohol'), ev('2026-07-01T18:00:00Z', 'stress')],
      new Set(['07-01']),
      iso => iso.slice(5),
    )
    expect(groupMarkersByDate(markers)[0].events).toEqual([
      { type: 'alcohol', emoji: '🍷', color: 'var(--chart-axis)', label: 'Алкоголь' },
      { type: 'stress', emoji: '😰', color: 'var(--chart-axis)', label: 'Стресс' },
    ])
  })

  it('keeps one entry per type per date (eventMarkers dedupes upstream)', () => {
    const markers = eventMarkers(
      [ev('2026-07-01T10:00:00Z', 'alcohol'), ev('2026-07-01T22:00:00Z', 'alcohol')],
      new Set(['07-01']),
      iso => iso.slice(5),
    )
    expect(groupMarkersByDate(markers)[0].events.map(e => e.emoji)).toEqual(['🍷'])
  })

  it('caps how many dots a single date draws', () => {
    expect(MAX_MARKER_DOTS).toBeGreaterThan(0)
    expect(MAX_MARKER_DOTS).toBeLessThanOrEqual(5)
  })
})

describe('markersByDate', () => {
  it('indexes grouped markers so a tooltip can look up its date in O(1)', () => {
    const markers = eventMarkers(
      [ev('2026-07-01T10:00:00Z', 'alcohol'), ev('2026-07-03T09:00:00Z', 'workout')],
      new Set(['07-01', '07-02', '07-03']),
      iso => iso.slice(5),
    )
    const index = markersByDate(groupMarkersByDate(markers))
    expect(index.get('07-01')?.events.map(e => e.type)).toEqual(['alcohol'])
    expect(index.get('07-03')?.events.map(e => e.type)).toEqual(['workout'])
    expect(index.get('07-02')).toBeUndefined()
  })
})
