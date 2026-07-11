// Расписание тренировок: чистая логика без Deno-глобалов (vitest).
// Спека: docs/superpowers/specs/2026-07-11-workout-schedule-design.md.
// ЗЕРКАЛО для фронта — src/lib/workoutPlan.ts (plannedDaysInRange, attendance);
// менять синхронно (Deno не импортит из src, паттерн scores).

export interface WorkoutScores {
  readiness: number | null
  hrv: number | null
  hrvBaseline: number | null
}

// 'HH:MM' минус N часов; уход на вчера клампится к '00:00' (спека §2 п.3:
// уведомление не шлём накануне — рано утром того же дня).
export function shiftTime(hhmm: string, hoursBefore: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  const total = Math.max(h * 60 + m - hoursBefore * 60, 0)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

// Плановые дни (YYYY-MM-DD, обе границы включительно). weekday: 1=Пн…7=Вс
// (конвенция reminder_settings). Даты трактуются как календарные, без tz-сдвигов.
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
export function workoutNotificationText(time: string, s: WorkoutScores | null): string {
  const base = `🏋️ Сегодня тренировка в ${time}.`
  if (!s || s.readiness == null) return `🏋️ Сегодня тренировка в ${time}`
  const hrvLow = s.hrv != null && s.hrvBaseline != null && s.hrv < s.hrvBaseline * 0.9
  if (s.readiness < 60 || hrvLow) {
    return `${base} Готовность ${s.readiness}/100${hrvLow ? ', восстановление ниже твоей нормы' : ''} — сегодня лучше полегче.`
  }
  if (s.readiness >= 75) return `${base} Готовность ${s.readiness}/100 — можно выкладываться 💪`
  return `${base} Готовность ${s.readiness}/100.`
}
