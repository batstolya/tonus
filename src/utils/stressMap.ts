import type { CalendarEvent, HeartRateSample, StressMapEntry } from '../types'

const PHYSICAL_KEYWORDS = /тренировк|бег|спорт|gym|workout|run|yoga|йога|плавани|велосипед|cycling|swim|walk|ходьба/i

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

export function buildStressMap(
  events: CalendarEvent[],
  samples: HeartRateSample[],
): StressMapEntry[] {
  const baseline = buildHourBaseline(samples)

  return events.map((event): StressMapEntry => {
    const start = event.start.getTime()
    const end = event.end.getTime()
    const eventSamples = samples.filter(s => {
      const t = s.time.getTime()
      return t >= start && t <= end
    })

    const values = eventSamples.map(s => s.value)
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
