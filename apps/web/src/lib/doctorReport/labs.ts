import type { LabResult } from '../labs'

// «3.5-5.5», «10 – 20», «3,9 - 6,2», «< 5», «> 1.2» → numeric range.
export function parseRefRange(s: string | null | undefined): { lo: number; hi: number } | null {
  if (!s) return null
  const norm = s.replace(/,/g, '.').replace(/\s+/g, ' ').trim()
  const lt = norm.match(/^<\s*(\d+(?:\.\d+)?)$/)
  if (lt) return { lo: -Infinity, hi: Number(lt[1]) }
  const gt = norm.match(/^>\s*(\d+(?:\.\d+)?)$/)
  if (gt) return { lo: Number(gt[1]), hi: Infinity }
  const range = norm.match(/^(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)$/)
  if (range) return { lo: Number(range[1]), hi: Number(range[2]) }
  return null
}

export interface LabLine {
  marker: string
  value: number
  unit: string | null
  refRange: string | null
  flag: '↑' | '↓' | null
  date: string
  prevValue: number | null
  prevDate: string | null
  delta: number | null
}

export interface LabSeries {
  marker: string
  unit: string | null
  refRange: string | null
  points: { date: string; value: number }[]
}

export interface LabsSection {
  lines: LabLine[]
  series: LabSeries[]
  /** Markers whose latest measurement predates the report period. */
  outOfPeriod: string[]
  totalMeasurements: number
  markerCount: number
}

/**
 * Two scopes on purpose: `lines` is the period-aware summary, `series` is the
 * complete history. A doctor reading a marker trend needs the whole series
 * regardless of the window chosen for wearable data.
 */
export function buildLabs(results: LabResult[], periodStartDate: string): LabsSection {
  const byMarker = new Map<string, LabResult[]>()
  for (const r of results) byMarker.set(r.marker, [...(byMarker.get(r.marker) ?? []), r])

  const lines: LabLine[] = []
  const series: LabSeries[] = []
  const outOfPeriod: string[] = []

  for (const [marker, rs] of byMarker) {
    const sorted = [...rs].sort((a, b) => a.date.localeCompare(b.date))
    const cur = sorted[sorted.length - 1]
    const prev = sorted.length > 1 ? sorted[sorted.length - 2] : null

    const range = parseRefRange(cur.ref_range)
    let flag: LabLine['flag'] = null
    if (range) {
      if (cur.value > range.hi) flag = '↑'
      else if (cur.value < range.lo) flag = '↓'
    } else if (cur.flag) {
      // Range did not parse — trust the flag transcribed from the lab report.
      const f = cur.flag.trim().toUpperCase()
      flag = f === 'H' || f === '↑' ? '↑' : f === 'L' || f === '↓' ? '↓' : null
    }

    if (cur.date < periodStartDate) outOfPeriod.push(marker)

    lines.push({
      marker, value: cur.value, unit: cur.unit, refRange: cur.ref_range ?? null,
      flag, date: cur.date,
      prevValue: prev?.value ?? null,
      prevDate: prev?.date ?? null,
      delta: prev ? +(cur.value - prev.value).toFixed(2) : null,
    })

    if (sorted.length > 1) {
      series.push({
        marker, unit: cur.unit, refRange: cur.ref_range ?? null,
        points: sorted.map(r => ({ date: r.date, value: r.value })),
      })
    }
  }

  const byName = (a: { marker: string }, b: { marker: string }) => a.marker.localeCompare(b.marker, 'ru')
  return {
    lines: lines.sort(byName),
    series: series.sort(byName),
    outOfPeriod: outOfPeriod.sort((a, b) => a.localeCompare(b, 'ru')),
    totalMeasurements: results.length,
    markerCount: byMarker.size,
  }
}
