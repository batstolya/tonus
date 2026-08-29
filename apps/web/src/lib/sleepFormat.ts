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

// Mean of times of day (hours in [0, 24)) on the clock circle.
// A plain arithmetic mean is wrong for wrap-around values: one 12:10 wake-up
// among 09:50 mornings used to drag the average *backwards* by hours, because
// the linear "hours from noon" scale has its seam at midday. Averaging the
// unit vectors of the angles has no seam.
export function circularMeanHours(hours: number[]): number | null {
  if (!hours.length) return null
  let x = 0
  let y = 0
  for (const h of hours) {
    const a = (h / 24) * 2 * Math.PI
    x += Math.cos(a)
    y += Math.sin(a)
  }
  // Fully opposed times (e.g. 00:00 and 12:00) have no meaningful mean.
  if (Math.abs(x) < 1e-9 && Math.abs(y) < 1e-9) return null
  const mean = (Math.atan2(y, x) / (2 * Math.PI)) * 24
  return (mean + 24) % 24
}

// Circular mean of a list of timestamps, as a local time of day in [0, 24).
// Missing or unparseable entries are dropped, not folded in as some default
// hour. Returns null when nothing usable is left.
export function averageTimeOfDay(isos: (string | null | undefined)[]): number | null {
  const hours: number[] = []
  for (const iso of isos) {
    if (!iso) continue
    const d = new Date(iso)
    if (isNaN(d.getTime())) continue
    hours.push(d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600)
  }
  return circularMeanHours(hours)
}
