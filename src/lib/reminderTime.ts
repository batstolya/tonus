// Когда сработает ближайшее напоминание из набора времён + дней недели.
// Чистая функция (тестируется vitest). Считает по локальному времени устройства —
// для UX-подсказки этого достаточно (точная tz-логика — на сервере send-reminders).

export interface NextReminder {
  offsetDays: number // 0 = сегодня, 1 = завтра, 2+ = через N дней
  time: string // 'HH:MM'
}

const toMin = (t: string): number => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

// weekdays: 1=Пн … 7=Вс (как в reminder_settings).
export function describeNextReminder(times: string[], weekdays: number[], now: Date = new Date()): NextReminder | null {
  const valid = times.filter((t) => /^\d{1,2}:\d{2}$/.test(t)).sort()
  if (!valid.length || !weekdays.length) return null

  const nowMin = now.getHours() * 60 + now.getMinutes()
  const todayWd = ((now.getDay() + 6) % 7) + 1 // JS 0=Вс → 1=Пн…7=Вс

  for (let off = 0; off < 8; off++) {
    const wd = ((todayWd - 1 + off) % 7) + 1
    if (!weekdays.includes(wd)) continue
    for (const t of valid) {
      if (off === 0 && toMin(t) <= nowMin) continue // сегодняшнее время уже прошло
      return { offsetDays: off, time: t }
    }
  }
  return null
}
