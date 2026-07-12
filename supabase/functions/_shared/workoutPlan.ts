// Расписание тренировок: чистая логика без Deno-глобалов (vitest).
// Спека: docs/superpowers/specs/2026-07-11-workout-schedule-design.md.
// Модель: day_times — своё время (и вид спорта) на каждый день недели:
//   { "1": { "time": "18:45", "label": "волейбол" }, "3": { "time": "19:00", "label": "футбол" } }
// ЗЕРКАЛО для фронта — src/lib/workoutPlan.ts (plannedDaysInRange, attendance,
// scheduleWeekdays, sportEmoji); менять синхронно (Deno не импортит из src).

export interface DayEntry { time: string; label?: string | null }
export type DayTimes = Record<string, DayEntry>

export interface WorkoutScores {
  readiness: number | null
  hrv: number | null
  hrvBaseline: number | null
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

// 'HH:MM' минус N часов; уход на вчера клампится к '00:00' (спека §2 п.3:
// уведомление не шлём накануне — рано утром того же дня).
export function shiftTime(hhmm: string, hoursBefore: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  const total = Math.max(h * 60 + m - hoursBefore * 60, 0)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
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

// Текст уведомления за N часов до тренировки (спека §2 п.4).
// «🏐 Сегодня волейбол в 18:45. Готовность 82/100 — можно выкладываться 💪»
export function workoutNotificationText(entry: DayEntry, s: WorkoutScores | null): string {
  const what = entry.label?.trim() || 'тренировка'
  const base = `${sportEmoji(entry.label)} Сегодня ${what} в ${entry.time}`
  if (!s || s.readiness == null) return base
  const hrvLow = s.hrv != null && s.hrvBaseline != null && s.hrv < s.hrvBaseline * 0.9
  if (s.readiness < 60 || hrvLow) {
    return `${base}. Готовность ${s.readiness}/100${hrvLow ? ', восстановление ниже твоей нормы' : ''} — сегодня лучше полегче.`
  }
  if (s.readiness >= 75) return `${base}. Готовность ${s.readiness}/100 — можно выкладываться 💪`
  return `${base}. Готовность ${s.readiness}/100.`
}
