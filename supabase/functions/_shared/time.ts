// Таймзонные хелперы для бота. Чистые функции (без Deno-глобалов) → тестируются vitest.

// Смещение таймзоны (минуты к востоку от UTC) на конкретный момент.
export function tzOffsetMin(tz: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const p = Object.fromEntries(dtf.formatToParts(date).map(x => [x.type, x.value]))
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
  return (asUTC - date.getTime()) / 60000
}

// Локальные дата (YYYY-MM-DD) и время (HH:MM) для момента now в данной tz.
export function localNow(tz: string, now: Date = new Date()): { date: string; time: string } {
  const d = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now).map(x => [x.type, x.value]))
  const t = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now).map(x => [x.type, x.value]))
  return { date: `${d.year}-${d.month}-${d.day}`, time: `${t.hour}:${t.minute}` }
}

export interface LocalToIsoOpts {
  // Якорь «сейчас». По умолчанию системные часы; для бота — время отправки сообщения (msg.date).
  now?: Date
  // Относительный сдвиг «N минут назад» («час назад»=60). Если задан — считается детерминированно
  // от now, а time/date игнорируются (LLM не должна вычислять абсолютное время сама).
  minutesAgo?: number | null
}

// Локальные дата/время (HH:MM) в этой tz → ISO (UTC). time=null → момент now.
export function localToIso(
  tz: string,
  time: string | null,
  dateStr?: string | null,
  opts: LocalToIsoOpts = {},
): string {
  const now = opts.now ?? new Date()

  // Относительное время («час назад») — считаем от якоря, без таймзонной арифметики.
  if (opts.minutesAgo != null && Number.isFinite(opts.minutesAgo)) {
    return new Date(now.getTime() - opts.minutesAgo * 60000).toISOString()
  }

  if (!time && !dateStr) return now.toISOString()
  const off = tzOffsetMin(tz, now)
  let day = dateStr
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    day = localNow(tz, now).date
  }
  let hhmm = time
  if (!hhmm) {
    // время не указано (напр. «сейчас») → текущее локальное, НЕ полдень
    hhmm = localNow(tz, now).time
  }
  const naiveUTC = Date.parse(`${day}T${hhmm}:00Z`)
  return new Date(naiveUTC - off * 60000).toISOString()
}

// Текущая локальная дата (YYYY-MM-DD) в данной tz.
export function localDate(tz: string, now: Date = new Date()): string {
  return localNow(tz, now).date
}
