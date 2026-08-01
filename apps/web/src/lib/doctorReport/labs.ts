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

export type LabStatus = 'above' | 'below' | 'in-range' | 'unknown'

/**
 * Same dictionary in both renderers (markdown.ts and DoctorReport.tsx) — the
 * whole point of `status` is that it never states more than the data
 * supports, so both surfaces must say it in the same words.
 */
export const LAB_STATUS_TEXT: Record<LabStatus, string> = {
  above: 'выше диапазона лаборатории',
  below: 'ниже диапазона лаборатории',
  'in-range': 'в диапазоне лаборатории',
  unknown: 'статус не определён: лаборатория не указала референс',
}

/** Appended to the status cell when it came from the lab's own flag, not a parsed range. */
export const LAB_FLAG_SUFFIX = 'по флагу лаборатории'

/** Printed once under the labs tables in both renderers. */
export const LAB_UNIT_CAVEAT =
  'Показатели с одинаковым названием в разных единицах показаны отдельными строками и не сравниваются между собой.'
export const LAB_DATE_CAVEAT =
  'Дата берётся из формы загрузки файла, а не с бланка: результаты из разных лабораторий могут стоять одним днём, и порядок внутри этого дня неизвестен.'

export interface LabLine {
  marker: string
  value: number
  unit: string | null
  refRange: string | null
  status: LabStatus
  /** Where the status came from — never the app's own judgement. */
  statusSource: 'range' | 'lab-flag' | null
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
 * Grouping key: the same analyte reported in two different units is two
 * series, never one — a percentage and an absolute count of the same cell
 * type are not comparable and must not be merged into one delta. The unit
 * text itself is normalised (trim, case) so the same unit spelled two ways
 * still groups together; genuinely different units never do.
 */
const unitKey = (u: string | null | undefined): string =>
  (u ?? '').trim().toLowerCase().replace(/\s+/g, '')

// JSON-encoded pair, not a joined string — a marker name that happens to
// contain the separator must never collide with a different marker/unit pair.
const groupKey = (marker: string, unit: string | null | undefined): string =>
  JSON.stringify([marker, unitKey(unit)])

const byMarkerThenUnit = (a: { marker: string; unit: string | null }, b: { marker: string; unit: string | null }): number =>
  a.marker.localeCompare(b.marker, 'ru') || (a.unit ?? '').localeCompare(b.unit ?? '', 'ru')

/**
 * Two scopes on purpose: `lines` is the period-aware summary, `series` is the
 * complete history. A doctor reading a marker trend needs the whole series
 * regardless of the window chosen for wearable data.
 */
export function buildLabs(results: LabResult[], periodStartDate: string): LabsSection {
  const byKey = new Map<string, LabResult[]>()
  for (const r of results) {
    const key = groupKey(r.marker, r.unit)
    byKey.set(key, [...(byKey.get(key) ?? []), r])
  }

  const lines: LabLine[] = []
  const series: LabSeries[] = []
  const outOfPeriod: string[] = []
  const markerNames = new Set<string>()

  for (const rs of byKey.values()) {
    const sorted = [...rs].sort((a, b) => a.date.localeCompare(b.date))
    const cur = sorted[sorted.length - 1]
    const prev = sorted.length > 1 ? sorted[sorted.length - 2] : null

    markerNames.add(cur.marker)

    // A verdict needs a source outside the app's own judgement: either the
    // lab's reference range, parsed, or the flag the lab itself transcribed.
    // With neither, the status is unknown — never guessed as "in range".
    const range = parseRefRange(cur.ref_range)
    let status: LabStatus = 'unknown'
    let statusSource: LabLine['statusSource'] = null
    if (range) {
      status = cur.value > range.hi ? 'above' : cur.value < range.lo ? 'below' : 'in-range'
      statusSource = 'range'
    } else if (cur.flag) {
      const f = cur.flag.trim().toLowerCase()
      if (f === 'high' || f === 'h' || f === '↑') { status = 'above'; statusSource = 'lab-flag' }
      else if (f === 'low' || f === 'l' || f === '↓') { status = 'below'; statusSource = 'lab-flag' }
      else if (f === 'normal') { status = 'in-range'; statusSource = 'lab-flag' }
    }

    if (cur.date < periodStartDate) outOfPeriod.push(cur.marker)

    lines.push({
      marker: cur.marker, value: cur.value, unit: cur.unit, refRange: cur.ref_range ?? null,
      status, statusSource, date: cur.date,
      prevValue: prev?.value ?? null,
      prevDate: prev?.date ?? null,
      delta: prev ? +(cur.value - prev.value).toFixed(2) : null,
    })

    if (sorted.length > 1) {
      series.push({
        marker: cur.marker, unit: cur.unit, refRange: cur.ref_range ?? null,
        points: sorted.map(r => ({ date: r.date, value: r.value })),
      })
    }
  }

  return {
    lines: lines.sort(byMarkerThenUnit),
    series: series.sort(byMarkerThenUnit),
    outOfPeriod: [...new Set(outOfPeriod)].sort((a, b) => a.localeCompare(b, 'ru')),
    totalMeasurements: results.length,
    // "Markers" means distinct marker names, not distinct marker+unit rows —
    // a percentage and a count of the same analyte are still one marker.
    markerCount: markerNames.size,
  }
}
