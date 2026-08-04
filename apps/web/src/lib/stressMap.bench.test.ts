import { describe, it, expect } from 'vitest'
import { buildStressMap } from './stressMap'
import type { CalendarEvent, HeartRateSample } from '../types'

// Not a timing assertion — machines differ. This pins the shape of the work so
// the nested scan cannot come back unnoticed: it walks the production-sized
// input and only has to finish.
describe('buildStressMap at production scale', () => {
  it('handles 297 events over 38k samples', () => {
    const t0 = Date.now()
    const samples: HeartRateSample[] = Array.from({ length: 38262 }, (_, i) => ({
      time: new Date(t0 - i * 200000), value: 60 + (i % 40), sourceName: '',
    }))
    const events = Array.from({ length: 297 }, (_, i) => ({
      uid: `e${i}`, title: 'meeting',
      start: new Date(t0 - i * 600000), end: new Date(t0 - i * 600000 + 3600000),
    })) as CalendarEvent[]

    const started = Date.now()
    const out = buildStressMap(events, samples)
    const ms = Date.now() - started
    expect(out).toHaveLength(297)
    expect(out.some(e => e.sampleCount > 0)).toBe(true)
    console.log(`buildStressMap: ${ms}ms`)
  })
})
