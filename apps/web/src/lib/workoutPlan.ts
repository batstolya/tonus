// Расписание тренировок. Чистая логика живёт в ОДНОМ месте —
// supabase/functions/_shared/workoutPlan.ts (её же импортируют edge-функции
// напоминаний). Этот файл — клиентский фасад (паттерн scores.ts): re-export
// общего расчёта + фронтовые надстройки (виджет «ближайшая тренировка»).
// Модель day_times: { "1": { "time": "18:45", "label": "волейбол" }, ... } (1=Пн…7=Вс).

import { scheduleWeekdays } from '../../../../supabase/functions/_shared/workoutPlan'
import type { DayTimes } from '../../../../supabase/functions/_shared/workoutPlan'

export {
  scheduleWeekdays,
  sportEmoji,
  plannedDaysInRange,
  attendance,
} from '../../../../supabase/functions/_shared/workoutPlan'
export type { DayEntry, DayTimes } from '../../../../supabase/functions/_shared/workoutPlan'

// Форма строки настроек расписания, как её читает фронт.
export interface WorkoutScheduleRow {
  day_times: DayTimes
  notify_hours_before: number
  enabled: boolean
}

// Ближайшая плановая тренировка после момента now (для виджета).
// Сегодняшняя учитывается, только если её время ещё не прошло.
// Фронтовая надстройка: считает в ЛОКАЛЬНОЙ зоне устройства, тогда как
// серверные плановые дни (plannedDaysInRange) живут в UTC.
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
