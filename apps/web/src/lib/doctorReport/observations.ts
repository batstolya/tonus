import { compareLogsAsc, formatLogTime } from '../concerns'
import type { Observation, ObservationTag } from '../observations'

export interface ObservationEntry {
  date: string
  /** `HH:MM`, or empty when the entry carries no time. */
  time: string
  tag: ObservationTag
  note: string
}

export interface ObservationsSection {
  total: number
  /** Entry counts per tag, busiest first; only tags actually used appear. */
  byTag: { tag: ObservationTag; count: number }[]
  /** Every entry of the period, oldest first. */
  entries: ObservationEntry[]
}

export function buildObservations(
  observations: Observation[],
  periodStartDate: string,
): ObservationsSection {
  const own = observations
    .filter(o => o.date >= periodStartDate)
    .slice()
    .sort(compareLogsAsc)

  const counts = new Map<ObservationTag, number>()
  for (const o of own) counts.set(o.tag, (counts.get(o.tag) ?? 0) + 1)

  return {
    total: own.length,
    byTag: [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)),
    entries: own.map(o => ({
      date: o.date,
      time: formatLogTime(o.at_time),
      tag: o.tag,
      note: o.note,
    })),
  }
}
