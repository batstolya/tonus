// Summary of Apple Watch heart events for the Pulse screen, over the whole
// history (spec 2026-11-25-heart-events-on-pulse-screen). Facts only.
import type { HeartEvent } from '../../lib/doctorReport/heartEvents'

export interface HeartEventsSummary {
  lowCount: number
  /** Lowest heart rate recorded inside a low-HR notification window. */
  lowestHr: number | null
  /** Share of low-HR notifications that started at local 00:00–06:59. */
  nightShare: number | null
  ecgCount: number
  /** Notifications per local month, first event's month → current month, zero-filled. */
  monthly: { month: string; count: number }[]
  /** Heart-rate notifications (any kind but ECG), newest first. */
  notifications: HeartEvent[]
  /** ECG recordings, newest first. */
  ecgs: HeartEvent[]
}

const pad = (n: number) => String(n).padStart(2, '0')
const localMonth = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
const newestFirst = (a: HeartEvent, b: HeartEvent) => b.start_ts.localeCompare(a.start_ts)

export function summarizeHeartEvents(events: HeartEvent[], now: Date = new Date()): HeartEventsSummary {
  const notifications = events.filter(e => e.kind !== 'ecg').sort(newestFirst)
  const ecgs = events.filter(e => e.kind === 'ecg').sort(newestFirst)
  const lows = notifications.filter(e => e.kind === 'low_hr')

  const mins = lows.map(e => e.hr_min).filter((v): v is number => v != null)
  const night = lows.filter(e => new Date(e.start_ts).getHours() < 7).length

  const counts = new Map<string, number>()
  for (const e of notifications) {
    const m = localMonth(new Date(e.start_ts))
    counts.set(m, (counts.get(m) ?? 0) + 1)
  }
  const monthly: { month: string; count: number }[] = []
  if (notifications.length) {
    const first = new Date(notifications[notifications.length - 1].start_ts)
    const cursor = new Date(first.getFullYear(), first.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth(), 1)
    while (cursor <= end) {
      const m = localMonth(cursor)
      monthly.push({ month: m, count: counts.get(m) ?? 0 })
      cursor.setMonth(cursor.getMonth() + 1)
    }
  }

  return {
    lowCount: lows.length,
    lowestHr: mins.length ? Math.min(...mins) : null,
    nightShare: lows.length ? night / lows.length : null,
    ecgCount: ecgs.length,
    monthly,
    notifications,
    ecgs,
  }
}
