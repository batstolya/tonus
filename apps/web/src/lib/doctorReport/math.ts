// Pure numeric helpers shared across the doctor report. Kept free of any
// dependency on the rest of the package, same as dates.ts — metrics.ts and
// reliability.ts both depend on this file, never on each other, for math.

export const avg = (v: number[]): number => v.reduce((a, b) => a + b, 0) / v.length

/** Linear-interpolated quantile; p is 0..1 over the sorted values. */
export function quantile(values: number[], p: number): number {
  const s = [...values].sort((a, b) => a - b)
  const i = (s.length - 1) * p
  const lo = Math.floor(i)
  const hi = Math.ceil(i)
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo)
}

const pad = (n: number): string => String(n).padStart(2, '0')

export interface TimeStat {
  median: string
  q1: string
  q3: string
  count: number
}

/**
 * Circular statistics for a clock time. A plain mean puts 23:50 and 00:10 at
 * noon, so times are mapped to minutes since `originMin` before ordering,
 * which keeps a cluster contiguous as long as the origin falls in a gap.
 *
 * `originMin` has no default on purpose. Sleep passes 18:00, safe because no
 * realistic bedtime sits near it once daytime episodes are excluded; intake
 * passes 04:00, because alcohol clusters exactly on 18:00 and would split
 * across the seam. A third caller has to choose its own empty hour rather than
 * inherit one that happens to be wrong for its data.
 */
export function timeOfDayStats(isoList: string[], originMin: number): TimeStat | null {
  const shifted = isoList
    .map(iso => new Date(iso))
    .filter(d => !isNaN(d.getTime()))
    .map(d => (d.getHours() * 60 + d.getMinutes() - originMin + 1440) % 1440)
  if (!shifted.length) return null
  const back = (m: number): string => {
    const t = Math.round(m + originMin) % 1440
    return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`
  }
  return {
    median: back(quantile(shifted, 0.5)),
    q1: back(quantile(shifted, 0.25)),
    q3: back(quantile(shifted, 0.75)),
    count: shifted.length,
  }
}
