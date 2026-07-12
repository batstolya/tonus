// Дробные часы → целые часы и минуты с переносом.
// Баг был: 6.993ч → floor=6, round(0.993*60)=60 → «6ч 60м». Минуты,
// округлившиеся до 60, должны переноситься в час: → «7ч 0м».
export function hoursToHM(h: number): { hrs: number; mins: number } {
  let hrs = Math.floor(h)
  let mins = Math.round((h - hrs) * 60)
  if (mins === 60) { hrs += 1; mins = 0 }
  return { hrs, mins }
}

// Some nights arrive with a broken wake_time (Apple Health sends a bad
// sleepEnd — e.g. 2026-06-13: wake logged ~a day later). If the time in bed
// is impossible (≤0, >16h, or less than the asleep duration), derive the
// wake moment as bedtime + duration. Otherwise keep the real wake_time
// (which legitimately exceeds asleep time by awake-in-bed minutes).
export function effectiveWake(
  bedtimeIso: string | null | undefined,
  wakeIso: string | null | undefined,
  durationHours: number | null | undefined,
): string | undefined {
  const bed = bedtimeIso ? new Date(bedtimeIso) : null
  if (!bed || isNaN(bed.getTime())) return wakeIso ?? undefined
  const wake = wakeIso ? new Date(wakeIso) : null
  const inBedH = wake && !isNaN(wake.getTime()) ? (wake.getTime() - bed.getTime()) / 3600000 : null
  const plausible = inBedH != null && inBedH > 0 && inBedH <= 16
    && (durationHours == null || inBedH >= durationHours - 0.05)
  if (plausible) return wakeIso ?? undefined
  if (durationHours != null) return new Date(bed.getTime() + durationHours * 3600000).toISOString()
  return wakeIso ?? undefined
}
