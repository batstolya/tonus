import { describe, it, expect } from 'vitest'
import { eventMarkers, groupMarkersByDate, markersByDate } from './chartEvents'
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
    expect(grouped[0].events.map(e => e.icon)).toEqual(['alcohol', 'stressAnxious'])
    expect(grouped[1].events.map(e => e.icon)).toEqual(['sportGym'])
  })

  it('carries the label of every event type so the tooltip can name them', () => {
    const markers = eventMarkers(
      [ev('2026-07-01T10:00:00Z', 'alcohol'), ev('2026-07-01T18:00:00Z', 'stress')],
      new Set(['07-01']),
      iso => iso.slice(5),
    )
    expect(groupMarkersByDate(markers)[0].events).toEqual([
      { type: 'alcohol', icon: 'alcohol', label: 'Алкоголь' },
      { type: 'stress', icon: 'stressAnxious', label: 'Стресс' },
    ])
  })

  it('keeps one entry per type per date (eventMarkers dedupes upstream)', () => {
    const markers = eventMarkers(
      [ev('2026-07-01T10:00:00Z', 'alcohol'), ev('2026-07-01T22:00:00Z', 'alcohol')],
      new Set(['07-01']),
      iso => iso.slice(5),
    )
    expect(groupMarkersByDate(markers)[0].events.map(e => e.icon)).toEqual(['alcohol'])
  })

  it('drops the types the filter has switched off', () => {
    const markers = eventMarkers(
      [ev('2026-07-01T10:00:00Z', 'alcohol'), ev('2026-07-01T18:00:00Z', 'stress')],
      new Set(['07-01']),
      iso => iso.slice(5),
      new Set(['stress']),
    )
    expect(markers.map(m => m.type)).toEqual(['stress'])
  })

  it('draws every type when no filter is given', () => {
    const markers = eventMarkers(
      [ev('2026-07-01T10:00:00Z', 'alcohol'), ev('2026-07-01T18:00:00Z', 'stress')],
      new Set(['07-01']),
      iso => iso.slice(5),
    )
    expect(markers.map(m => m.type)).toEqual(['alcohol', 'stress'])
  })

  it('draws nothing when the filter is empty', () => {
    const markers = eventMarkers(
      [ev('2026-07-01T10:00:00Z', 'alcohol')],
      new Set(['07-01']),
      iso => iso.slice(5),
      new Set(),
    )
    expect(markers).toEqual([])
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
