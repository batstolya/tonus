import { describe, it, expect } from 'vitest'
import { buildStressMap } from './stressMap'
import type { CalendarEvent, HeartRateSample } from '../types'

// Pins the behaviour before the lookup is rewritten from a per-event scan of
// every sample to a binary search over a sorted copy. The numbers must not
// move — this is a speed change, not a scoring change.

const ev = (uid: string, title: string, startISO: string, endISO: string): CalendarEvent =>
  ({ uid, title, start: new Date(startISO), end: new Date(endISO) }) as CalendarEvent

const hr = (iso: string, value: number): HeartRateSample =>
  ({ time: new Date(iso), value }) as HeartRateSample

// Local times on purpose: the baseline buckets by hour-of-day via getHours().
const day = (d: number, h: number, m = 0) =>
  new Date(2026, 6, d, h, m).toISOString()

describe('buildStressMap', () => {
  const samples: HeartRateSample[] = [
    // 10:00 across several days — the baseline bucket for hour 10
    hr(day(1, 10, 0), 60), hr(day(2, 10, 0), 62), hr(day(3, 10, 0), 64),
    hr(day(4, 10, 0), 66), hr(day(5, 10, 0), 68), hr(day(6, 10, 0), 70),
    hr(day(7, 10, 0), 72), hr(day(8, 10, 0), 74), hr(day(9, 10, 0), 76),
    hr(day(10, 10, 0), 78),
    // inside the meeting on day 10
    hr(day(10, 10, 15), 90), hr(day(10, 10, 30), 110), hr(day(10, 10, 45), 100),
    // outside every event
    hr(day(10, 15, 0), 55),
  ]

  const meeting = ev('m1', 'Планёрка', day(10, 10, 0), day(10, 11, 0))
  const gym = ev('g1', 'Тренировка в зале', day(11, 10, 0), day(11, 11, 0))

  it('averages and peaks only the samples inside the event', () => {
    const [entry] = buildStressMap([meeting], samples)
    // 78, 90, 110, 100 fall inside 10:00–11:00 on day 10
    expect(entry.sampleCount).toBe(4)
    expect(entry.avgHeartRate).toBe(95)
    expect(entry.peakHeartRate).toBe(110)
  })

  it('takes the baseline from the same hour of day across all days', () => {
    const [entry] = buildStressMap([meeting], samples)
    // Thirteen values land in the hour-10 bucket — the ten daily ones *and*
    // the three recorded during the meeting, since the baseline buckets by
    // hour without excluding event time. Sorted, the 10th percentile is
    // index floor(13 * 0.1) = 1, which is 62.
    expect(entry.baselineHeartRate).toBe(62)
    expect(entry.heartRateDelta).toBe(33)
  })

  it('reports an event with no samples rather than dropping it', () => {
    const [entry] = buildStressMap([gym], samples)
    expect(entry.sampleCount).toBe(0)
    expect(entry.avgHeartRate).toBeNull()
    expect(entry.peakHeartRate).toBeNull()
    expect(entry.heartRateDelta).toBeNull()
  })

  it('flags physical activity from the title', () => {
    expect(buildStressMap([gym], samples)[0].isPhysicalActivity).toBe(true)
    expect(buildStressMap([meeting], samples)[0].isPhysicalActivity).toBe(false)
  })

  it('sorts by delta, with unmeasured events last', () => {
    const order = buildStressMap([gym, meeting], samples).map(e => e.event.uid)
    expect(order).toEqual(['m1', 'g1'])
  })

  it('includes samples exactly on both boundaries', () => {
    const edge = ev('e1', 'Край', day(20, 9, 0), day(20, 10, 0))
    const s = [hr(day(20, 9, 0), 100), hr(day(20, 10, 0), 120), hr(day(20, 10, 1), 200)]
    expect(buildStressMap([edge], s)[0].sampleCount).toBe(2)
  })

  it('survives an empty sample set', () => {
    const [entry] = buildStressMap([meeting], [])
    expect(entry.sampleCount).toBe(0)
    expect(entry.baselineHeartRate).toBeNull()
  })

  it('does not depend on the samples arriving in time order', () => {
    const shuffled = [...samples].reverse()
    expect(buildStressMap([meeting], shuffled)).toEqual(buildStressMap([meeting], samples))
  })
})
