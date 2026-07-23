// Расписание тренировок: фронтовая копия чистой логики.
// Модель day_times: { "1": { "time": "18:45", "label": "волейбол" }, ... } (1=Пн…7=Вс).
// ЗЕРКАЛО supabase/functions/_shared/workoutPlan.ts (plannedDaysInRange,
// attendance, scheduleWeekdays, sportEmoji) — менять синхронно (паттерн scores).

export interface DayEntry { time: string; label?: string | null }
export type DayTimes = Record<string, DayEntry>

export interface WorkoutScheduleRow {
  day_times: DayTimes
  notify_hours_before: number
  enabled: boolean
}

// Дни недели расписания из ключей day_times (1=Пн…7=Вс), отсортированы.
export function scheduleWeekdays(dayTimes: DayTimes): number[] {
  return Object.keys(dayTimes ?? {})
    .map(Number)
    .filter(n => Number.isInteger(n) && n >= 1 && n <= 7)
    .sort((a, b) => a - b)
}

// Эмодзи по виду спорта (best effort, дефолт — общий).
export function sportEmoji(label?: string | null): string {
  const l = (label ?? '').toLowerCase()
  if (l.includes('волейб') || l.includes('volley')) return '🏐'
  if (l.includes('футбол') || l.includes('футзал') || l.includes('soccer') || l.includes('football')) return '⚽'
  return '🏋️'
}

// Плановые дни (YYYY-MM-DD, обе границы включительно). weekday: 1=Пн…7=Вс.
export function plannedDaysInRange(weekdays: number[], fromDate: string, toDate: string): string[] {
  if (!weekdays.length) return []
  const out: string[] = []
  const d = new Date(fromDate + 'T00:00:00Z')
  const end = new Date(toDate + 'T00:00:00Z')
  while (d <= end) {
    const wd = d.getUTCDay() === 0 ? 7 : d.getUTCDay()
    if (weekdays.includes(wd)) out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

export function attendance(planned: string[], doneDays: Set<string>): { done: number; total: number } {
  return { done: planned.filter(p => doneDays.has(p)).length, total: planned.length }
}

// Ближайшая плановая тренировка после момента now (для виджета).
// Сегодняшняя учитывается, только если её время ещё не прошло.
export function nextPlannedWorkout(
  dayTimes: DayTimes, now: Date,
): { date: string; time: string; label?: string | null; inDays: number } | null {
  const weekdays = scheduleWeekdays(dayTimes)
  if (!weekdays.length) return null
  for (let i = 0; i < 8; i++) {
    const d = new Date(now)
    d.setDate(d.getDate() + i)
    const wd = d.getDay() === 0 ? 7 : d.getDay()
    const entry = dayTimes[String(wd)]
    if (!entry) continue
    if (i === 0) {
      const [h, m] = entry.time.split(':').map(Number)
      if (now.getHours() * 60 + now.getMinutes() >= h * 60 + m) continue
    }
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { date: dateStr, time: entry.time, label: entry.label, inDays: i }
  }
  return null
}
