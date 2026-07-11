// Расписание тренировок: фронтовая копия чистой логики.
// ЗЕРКАЛО supabase/functions/_shared/workoutPlan.ts (plannedDaysInRange,
// attendance) — менять синхронно (Deno не импортит из src, паттерн scores).

export interface WorkoutScheduleRow {
  weekdays: number[]
  time: string
  notify_hours_before: number
  enabled: boolean
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
// Сегодняшняя учитывается, только если время ещё не прошло.
export function nextPlannedWorkout(
  weekdays: number[], time: string, now: Date,
): { date: string; time: string; inDays: number } | null {
  if (!weekdays.length) return null
  for (let i = 0; i < 8; i++) {
    const d = new Date(now)
    d.setDate(d.getDate() + i)
    const wd = d.getDay() === 0 ? 7 : d.getDay()
    if (!weekdays.includes(wd)) continue
    if (i === 0) {
      const [h, m] = time.split(':').map(Number)
      if (now.getHours() * 60 + now.getMinutes() >= h * 60 + m) continue
    }
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { date: dateStr, time, inDays: i }
  }
  return null
}
