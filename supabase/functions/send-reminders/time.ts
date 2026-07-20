// Текущее локальное время в указанной таймзоне → { hhmm, weekday(1=Пн..7=Вс), dateStr }
export function localNow(tz: string) {
  const now = new Date()
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
    weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
  })
  const parts = Object.fromEntries(fmt.formatToParts(now).map(p => [p.type, p.value]))
  const wdMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }
  return {
    hhmm: `${parts.hour}:${parts.minute}`,
    weekday: wdMap[parts.weekday] ?? 1,
    dateStr: `${parts.year}-${parts.month}-${parts.day}`,
  }
}

// время дозы наступило в текущем 5-минутном окне cron
export function timeDue(target: string, nowHHMM: string): boolean {
  const [th, tm] = target.split(':').map(Number)
  const [nh, nm] = nowHHMM.split(':').map(Number)
  const tMin = th * 60 + tm
  const nMin = nh * 60 + nm
  // окно [target, target+5) — cron тикает каждые 5 мин
  return nMin >= tMin && nMin < tMin + 5
}
