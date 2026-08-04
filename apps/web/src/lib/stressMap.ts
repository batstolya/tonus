import type { CalendarEvent, HeartRateSample, StressMapEntry } from '../types'

// ru + uk + en keywords: real calendars come in the user's language, and demo
// event titles are translated to the active locale before they reach here.
const PHYSICAL_KEYWORDS = /тренировк|тренуванн|бег|біг|спорт|gym|workout|run|yoga|йога|плавани|плаванн|велосипед|cycling|swim|walk|ходьба|вправ/i

function isPhysical(event: CalendarEvent): boolean {
  return PHYSICAL_KEYWORDS.test(event.title) || PHYSICAL_KEYWORDS.test(event.description ?? '')
}

// Baseline: median HR samples in same hour-of-day across all days
function buildHourBaseline(samples: HeartRateSample[]): Map<number, number> {
  const byHour = new Map<number, number[]>()
  for (const s of samples) {
    const h = s.time.getHours()
    const arr = byHour.get(h) ?? []
    arr.push(s.value)
    byHour.set(h, arr)
  }
  const baseline = new Map<number, number>()
  for (const [h, vals] of byHour) {
    const sorted = [...vals].sort((a, b) => a - b)
    baseline.set(h, sorted[Math.floor(sorted.length * 0.1)]) // 10th percentile = resting
  }
  return baseline
}

// First index whose timestamp is >= t, over an ascending array of timestamps.
function lowerBound(times: number[], t: number): number {
  let lo = 0, hi = times.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (times[mid] < t) lo = mid + 1
    else hi = mid
  }
  return lo
}

export function buildStressMap(
  events: CalendarEvent[],
  samples: HeartRateSample[],
): StressMapEntry[] {
  const baseline = buildHourBaseline(samples)

  // Sort once and binary-search per event, instead of scanning every sample
  // for every event. On real data — 297 events over 38k samples — that was
  // 11.4 million comparisons and about 100ms on a laptop, several times that
  // on a phone, all on the main thread while the screen sat there. The values
  // below are unchanged; only how the range is found is different.
  const ordered = [...samples].sort((a, b) => a.time.getTime() - b.time.getTime())
  const times = ordered.map(s => s.time.getTime())

  return events.map((event): StressMapEntry => {
    const start = event.start.getTime()
    const end = event.end.getTime()
    // end is inclusive, as it was with `t <= end`.
    const from = lowerBound(times, start)
    const to = lowerBound(times, end + 1)

    const values: number[] = []
    for (let i = from; i < to; i++) values.push(ordered[i].value)
    const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
    const peak = values.length ? Math.max(...values) : null

    const hour = event.start.getHours()
    const base = baseline.get(hour) ?? null

    return {
      event,
      avgHeartRate: avg ? Math.round(avg) : null,
      peakHeartRate: peak,
      baselineHeartRate: base,
      heartRateDelta: avg !== null && base !== null ? Math.round(avg - base) : null,
      sampleCount: values.length,
      isPhysicalActivity: isPhysical(event),
    }
  }).sort((a, b) => {
    const da = a.heartRateDelta ?? -Infinity
    const db = b.heartRateDelta ?? -Infinity
    return db - da
  })
}
