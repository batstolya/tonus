import { useEffect, useState } from 'react'
import type { DailyMetrics } from '../../types'
import { supabase } from '../../lib/supabase'
import { isDemoActive } from '../../lib/demo'
import { makeDemoWorkoutSchedule } from '../../lib/demoFixture'
import { plannedDaysInRange, attendance, nextPlannedWorkout, scheduleWeekdays, sportEmoji, type WorkoutScheduleRow, type DayTimes } from '../../lib/workoutPlan'
import { useT } from '../../lib/i18n'

// Карточка расписания тренировок: ближайшая плановая + соблюдение за месяц.
// Скрыта, пока расписание не задано в настройках (или выключено).
// Факт = день с exerciseMinutes ≥ 30 (тот же порог, что в стрике).
export function WorkoutPlanCard({ daily }: { daily: DailyMetrics[] }) {
  const { t, locale } = useT()
  // Демо-значение ставим ленивым инициализатором, а не синхронным setState в
  // эффекте (react-hooks/set-state-in-effect) — то же состояние, на рендер меньше.
  const [ws, setWs] = useState<WorkoutScheduleRow | null>(() => isDemoActive() ? makeDemoWorkoutSchedule() : null)

  useEffect(() => {
    if (isDemoActive()) return
    let active = true
    supabase.from('workout_schedule').select('day_times, notify_hours_before, enabled')
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return
        setWs(data ? { ...data, day_times: (data.day_times ?? {}) as unknown as DayTimes } : null)
      })
    return () => { active = false }
  }, [])

  const days = ws?.enabled ? scheduleWeekdays(ws.day_times) : []
  if (!ws || !days.length) return null

  const now = new Date()
  const next = nextPlannedWorkout(ws.day_times, now)
  const pad = (n: number) => String(n).padStart(2, '0')
  const monthFrom = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const planned = plannedDaysInRange(days, monthFrom, todayStr)
  const done = new Set(daily.filter(d => (d.exerciseMinutes ?? 0) >= 30).map(d => d.date))
  const a = attendance(planned, done)

  const demo = isDemoActive()
  let nextLabel = '—'
  if (next) {
    // Вид спорта — данные юзера; в демо это строка фикстуры, т.е. ключ словаря.
    const what = next.label ? `${demo ? t(next.label) : next.label} ` : ''
    if (next.inDays === 0) {
      nextLabel = `${what}${t('Сегодня в {time}', { time: next.time })}`
    } else {
      const wd = new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(next.date + 'T00:00:00'))
      nextLabel = next.inDays === 1
        ? `${what}${wd} ${next.time} · ${t('завтра')}`
        : `${what}${wd} ${next.time} · ${t('через {n} дн.', { n: next.inDays })}`
    }
  }

  return (
    <div className="streak-cards workout-plan-card">
      <div className="streak-card">
        <span className="streak-card-value">
          <span className="streak-card-emoji" aria-hidden>{sportEmoji(next?.label)}</span>
          {nextLabel}
        </span>
        <span className="streak-card-label">{t('Следующая тренировка')}</span>
      </div>
      <div className="streak-card">
        <span className="streak-card-value">
          <span className="streak-card-emoji" aria-hidden>✅</span>
          {a.done} / {a.total}
        </span>
        <span className="streak-card-label">{t('Месяц: по плану')}</span>
      </div>
    </div>
  )
}
