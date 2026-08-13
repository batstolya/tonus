/**
 * Time in bed and sleep efficiency, derived — never stored. Health Auto
 * Export sends asleep and awake hours as two independent numbers whose sum
 * matches its own in-bed span, so the pair is enough and a stored copy would
 * only be a third number to keep in sync.
 *
 * Every function returns null when awake time is unknown, which is every
 * night ingested before `awake_hours` existed. A missing value must never
 * arrive at the screen as 0 h awake / 100% efficient — that is a claim the
 * data does not make.
 */

const known = (v: number | null | undefined): v is number => v != null && isFinite(v)

/** Asleep plus awake-in-bed. Null when either side is unknown. */
export function timeInBedHours(
  durationHours: number | null | undefined,
  awakeHours: number | null | undefined,
): number | null {
  if (!known(durationHours) || !known(awakeHours)) return null
  return durationHours + awakeHours
}

/** Share of the night actually spent asleep, whole percent. Null when unknown. */
export function sleepEfficiencyPct(
  durationHours: number | null | undefined,
  awakeHours: number | null | undefined,
): number | null {
  const inBed = timeInBedHours(durationHours, awakeHours)
  if (inBed == null || inBed <= 0) return null
  return Math.round((durationHours! / inBed) * 100)
}
