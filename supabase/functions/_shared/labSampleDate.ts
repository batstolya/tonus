// Where a lab result's collection date comes from, and how much of it is known.
//
// The old rule was one line — `date || new Date().toISOString().slice(0, 10)` —
// so an upload with an empty date field stamped every result with today. Four
// files spanning 2024-09 to 2025-09 all landed on their upload day, which
// destroyed a year of lab trends.

export type SamplePrecision = 'day' | 'month' | 'unknown'

export interface SampleDate {
  /** First day of the month when only the month is known; null when nothing is. */
  date: string | null
  precision: SamplePrecision
}

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/
const MONTH = /^(\d{4})-(\d{2})$/

const plausible = (y: number, m: number): boolean =>
  y >= 1900 && y <= 2100 && m >= 1 && m <= 12

/** 'YYYY-MM-DD' or 'YYYY-MM', anywhere a caller found one. Nothing else. */
export function parseSampleDate(raw: string | null | undefined): SampleDate | null {
  const s = (raw ?? '').trim()
  const d = DAY.exec(s)
  if (d && plausible(+d[1], +d[2]) && +d[3] >= 1 && +d[3] <= 31) {
    return { date: s, precision: 'day' }
  }
  const m = MONTH.exec(s)
  if (m && plausible(+m[1], +m[2])) {
    return { date: `${m[1]}-${m[2]}-01`, precision: 'month' }
  }
  return null
}

/**
 * A leading date in the file name — `2025-09_Analisis_Poznan_1.pdf`. This is
 * the path that would have saved all four of the existing files, and it is the
 * only evidence left now that the PDFs themselves were never stored.
 */
export function sampleDateFromFileName(fileName: string | null | undefined): SampleDate | null {
  const m = /(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(fileName ?? '')
  if (!m) return null
  return parseSampleDate(m[3] ? `${m[1]}-${m[2]}-${m[3]}` : `${m[1]}-${m[2]}`)
}

/**
 * The form wins, then the file name, then whatever the person typed in the
 * upload field. There is deliberately no fallback to today: a wrong date is
 * worse than an absent one, because only the absent one is visible.
 */
export function resolveSampleDate(
  fromForm: string | null | undefined,
  fileName: string | null | undefined,
  fromUpload: string | null | undefined,
): SampleDate {
  return parseSampleDate(fromForm)
    ?? sampleDateFromFileName(fileName)
    ?? parseSampleDate(fromUpload)
    ?? { date: null, precision: 'unknown' }
}
