import type { Supplement } from '../supplements'
import type { SupplementAdherenceLog } from '../api/settings'

export interface SupplementLine {
  id: string
  name: string
  dose: string | null
  unit: string | null
  active: boolean
  /** First taken day inside the period — the denominator starts here. */
  firstIntake: string | null
  taken: number
  windowDays: number
  pct: number | null
}

/**
 * Adherence counts from the first logged intake inside the period. Dividing by
 * the whole period reported ~27% for a supplement started a month in, when the
 * user had missed almost nothing.
 */
export function buildSupplements(
  supplements: Supplement[],
  logs: SupplementAdherenceLog[],
  periodStartDate: string,
  today: string,
): SupplementLine[] {
  return supplements.map(s => {
    const own = logs.filter(l => l.supplement_id === s.id && l.date >= periodStartDate && l.date <= today && l.taken)
    const firstIntake = own.map(l => l.date).sort()[0] ?? null
    const windowDays = firstIntake
      ? Math.round((Date.parse(today) - Date.parse(firstIntake)) / 86400000) + 1
      : 0
    return {
      id: s.id,
      name: s.name,
      dose: s.default_dose ?? null,
      unit: s.unit ?? null,
      active: s.active,
      firstIntake,
      taken: own.length,
      windowDays,
      pct: windowDays > 0 ? Math.round((own.length / windowDays) * 100) : null,
    }
  })
}
