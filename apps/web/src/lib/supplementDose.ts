// Doses per day (spec: 2026-08-23-supplement-multi-dose-design.md).
// A day cell cycles through every dose and then back to none, so a supplement
// taken with each meal is marked meal by meal. With doses_per_day = 1 the cycle
// is the old boolean: none -> taken -> none.

export const MIN_DOSES_PER_DAY = 1
export const MAX_DOSES_PER_DAY = 10

export function clampDosesPerDay(n: number): number {
  if (!Number.isFinite(n)) return MIN_DOSES_PER_DAY
  return Math.min(MAX_DOSES_PER_DAY, Math.max(MIN_DOSES_PER_DAY, Math.round(n)))
}

/** Next value in the click cycle: 0 → 1 → … → dosesPerDay → 0. */
export function nextDoseCount(current: number, dosesPerDay: number): number {
  const max = clampDosesPerDay(dosesPerDay)
  const now = Math.min(max, Math.max(0, Math.round(current)))
  return now >= max ? 0 : now + 1
}

/** How much of a day one log covers, 0..1. */
export function doseFraction(takenCount: number, dosesPerDay: number): number {
  const max = clampDosesPerDay(dosesPerDay)
  const taken = Math.max(0, Math.round(takenCount))
  return Math.min(1, taken / max)
}
