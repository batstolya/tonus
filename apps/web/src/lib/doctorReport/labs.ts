import type { LabResult } from '../labs'
import { seriesKeyFor } from '../../../../../supabase/functions/_shared/analytes'

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

export type LabStatus = 'above' | 'below' | 'in-range' | 'unknown' | 'unparsed'

/**
 * Same dictionary in both renderers (markdown.ts and DoctorReport.tsx) — the
 * whole point of `status` is that it never states more than the data
 * supports, so both surfaces must say it in the same words. `unknown` and
 * `unparsed` must stay separate texts: the report can see whether the lab
 * sent no reference at all versus sent one it could not read, and must never
 * claim the former when it was actually the latter.
 */
export const LAB_STATUS_TEXT: Record<LabStatus, string> = {
  above: 'выше диапазона лаборатории',
  below: 'ниже диапазона лаборатории',
  'in-range': 'в диапазоне лаборатории',
  unknown: 'статус не определён: лаборатория не указала референс',
  unparsed: 'статус не определён: референс лаборатории не распознан',
}

/** Appended to the status cell when it came from the lab's own flag, not a parsed range. */
export const LAB_FLAG_SUFFIX = 'по флагу лаборатории'

/** Printed once under the labs tables in both renderers. */
export const LAB_UNIT_CAVEAT =
  'Показатели с одинаковым названием в разных единицах показаны отдельными строками и не сравниваются между собой.'
export const LAB_DATE_CAVEAT =
  'Дата — это дата забора материала, а не загрузки файла. Там, где на бланке был виден только месяц, показан месяц; двум результатам одного месяца порядок не приписывается.'

/** Printed for a row whose source never recorded when the sample was taken. */
export const LAB_DATE_UNKNOWN = 'дата сдачи неизвестна'
export const LAB_ORDER_UNKNOWN = 'порядок внутри месяца неизвестен'
export const LAB_UNIDENTIFIED = 'Показателей без распознанного названия'

/**
 * Same cell in both renderers. Month precision prints the month and nothing
 * finer: the stored date anchors to the first, and printing "2024-09-01" would
 * claim a day the bланк never gave.
 */
export function labDateCell(date: string | null, precision: DatePrecision, t: (s: string) => string): string {
  if (date === null) return t(LAB_DATE_UNKNOWN)
  if (precision === 'month') return `${date.slice(5, 7)}.${date.slice(0, 4)}`
  return date
}

export type DatePrecision = 'day' | 'month' | 'unknown'

export interface LabLine {
  marker: string
  value: number
  unit: string | null
  refRange: string | null
  status: LabStatus
  /** Where the status came from — never the app's own judgement. */
  statusSource: 'range' | 'lab-flag' | null
  /** Sample date. `null` when the source never told us when blood was drawn. */
  date: string | null
  datePrecision: DatePrecision
  prevValue: number | null
  prevDate: string | null
  /** Precision of `prevDate` — its own, never the current row's. */
  prevPrecision: DatePrecision | null
  /**
   * Whether the two results can be ordered at all. Two month-precision results
   * from the same month cannot: both anchor to the first of the month, and
   * which draw came first is unknown. The values still print; the delta does
   * not, because its sign would be invented.
   */
  orderKnown: boolean
  delta: number | null
}

export interface LabSeries {
  marker: string
  unit: string | null
  refRange: string | null
  points: { date: string | null; precision: DatePrecision; value: number }[]
}

export interface LabsSection {
  lines: LabLine[]
  series: LabSeries[]
  /** Markers whose latest measurement predates the report period. */
  outOfPeriod: string[]
  totalMeasurements: number
  markerCount: number
  /**
   * Series the analyte dictionary did not recognise, still printed under their
   * own names. Stated in the report so the gap is visible rather than silent.
   */
  unidentifiedMarkers: number
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

/**
 * Identity of a result's series. A stored `analyte_key` joins the same analyte
 * across the languages and laboratory codes it was printed under; without one
 * the marker name and unit stay the key, which is exactly the previous
 * behaviour for anything the dictionary does not recognise.
 *
 * Never the key alone: `seriesKeyFor` folds in the measurement and the unit
 * family, so a percentage and an absolute count of one analyte stay apart.
 */
const seriesIdOf = (r: LabResult): string =>
  r.analyte_key ? seriesKeyFor(r.analyte_key, r.unit) : groupKey(r.marker, r.unit)

/** Sample date, or null when the source never recorded when blood was drawn. */
const sampleDateOf = (r: LabResult): string | null => r.sample_date ?? null

const precisionOf = (r: LabResult): DatePrecision => r.sample_date_precision ?? 'unknown'

// Nulls sort last: a row with no sample date cannot be placed in the history.
const bySampleDate = (a: LabResult, b: LabResult): number => {
  const x = sampleDateOf(a), y = sampleDateOf(b)
  if (x === y) return 0
  if (x === null) return 1
  if (y === null) return -1
  return x.localeCompare(y)
}

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
    const key = seriesIdOf(r)
    byKey.set(key, [...(byKey.get(key) ?? []), r])
  }

  const lines: LabLine[] = []
  const series: LabSeries[] = []
  const outOfPeriod: string[] = []
  const markerNames = new Set<string>()

  let unidentifiedMarkers = 0
  for (const rs of byKey.values()) {
    if (!rs.some(r => r.analyte_key)) unidentifiedMarkers++
    const sorted = [...rs].sort(bySampleDate)
    const cur = sorted[sorted.length - 1]
    const prev = sorted.length > 1 ? sorted[sorted.length - 2] : null

    markerNames.add(cur.marker)

    // A verdict needs a source outside the app's own judgement: either the
    // lab's reference range, parsed, or the flag the lab itself transcribed.
    // With neither, the status is unknown — never guessed as "in range". The
    // wording still has to distinguish "the lab gave no reference" from "the
    // lab gave one this app couldn't parse" — printing the range next to a
    // claim that none was given would be its own kind of false statement.
    const range = parseRefRange(cur.ref_range)
    const hasRefRangeText = !!(cur.ref_range && cur.ref_range.trim())
    let status: LabStatus = hasRefRangeText ? 'unparsed' : 'unknown'
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

    const curDate = sampleDateOf(cur)
    const prevDate = prev ? sampleDateOf(prev) : null
    // Equal dates mean the order is unknown — either two draws in one month at
    // month precision, or two rows carrying no date at all.
    const orderKnown = !!prev && curDate !== null && prevDate !== null && curDate !== prevDate

    // Only a known date can be placed before the period; silence is not "old".
    if (curDate !== null && curDate < periodStartDate) outOfPeriod.push(cur.marker)

    lines.push({
      marker: cur.marker, value: cur.value, unit: cur.unit, refRange: cur.ref_range ?? null,
      status, statusSource, date: curDate, datePrecision: precisionOf(cur),
      prevValue: prev?.value ?? null,
      prevDate,
      prevPrecision: prev ? precisionOf(prev) : null,
      orderKnown,
      delta: orderKnown ? +(cur.value - prev!.value).toFixed(2) : null,
    })

    if (sorted.length > 1) {
      series.push({
        marker: cur.marker, unit: cur.unit, refRange: cur.ref_range ?? null,
        points: sorted.map(r => ({ date: sampleDateOf(r), precision: precisionOf(r), value: r.value })),
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
    unidentifiedMarkers,
  }
}
