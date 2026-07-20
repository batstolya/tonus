// Pure digest helpers for the biweekly report. No Deno imports — the vitest
// node project tests this directly (same pattern as telegram-bot/router.ts).
// Everything here is a precomputed fact for the prompt: the model must never
// derive cross-period comparisons or timezone math itself.

export interface SleepBedtime {
  date: string
  bedtime: string | null
}

// Render an instant as HH:MM in the given IANA timezone (DST-correct).
export function localHHMM(iso: string, tz: string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date(iso)).map(x => [x.type, x.value]),
  )
  // en-GB renders midnight as '00'; normalize just in case a runtime says '24'.
  const hour = p.hour === '24' ? '00' : p.hour
  return `${hour}:${p.minute}`
}

// Late = falling asleep in [01:00, 09:00) local time.
export function lateBedtimes(sleep: SleepBedtime[], tz: string): { date: string; local: string }[] {
  return sleep.flatMap(s => {
    if (!s.bedtime) return []
    const local = localHHMM(s.bedtime, tz)
    const h = Number(local.slice(0, 2))
    return h >= 1 && h < 9 ? [{ date: s.date, local }] : []
  })
}

export function median(vals: number[]): number | null {
  if (!vals.length) return null
  const sorted = [...vals].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// Days with HRV below 80% of the personal baseline (median over ~4 weeks).
export function lowHrvDays(
  rows: { date: string; hrv: number | null }[],
  baseline: number,
): { date: string; hrv: number }[] {
  return rows.flatMap(r =>
    r.hrv != null && r.hrv < baseline * 0.8 ? [{ date: r.date, hrv: r.hrv }] : [],
  )
}

export function coverage(periodDays: number, metricDays: number, sleepNights: number): string {
  return `Покрытие данных: метрики ${metricDays}/${periodDays} дней, сон ${sleepNights}/${periodDays} ночей`
}

export function lateComparisonLine(currentCount: number, prevCount: number): string {
  return `Поздние засыпания (после 01:00 локального): текущий период ${currentCount}, предыдущий ${prevCount}`
}
