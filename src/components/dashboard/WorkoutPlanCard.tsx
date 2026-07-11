import { useEffect, useState } from 'react'
import type { DailyMetrics } from '../../types'
import { supabase } from '../../lib/supabase'
import { isDemoActive } from '../../lib/demo'
import { makeDemoWorkoutSchedule } from '../../lib/demoFixture'
import { plannedDaysInRange, attendance, nextPlannedWorkout, type WorkoutScheduleRow } from '../../lib/workoutPlan'
import { useT } from '../../lib/i18n'

// Карточка расписания тренировок: ближайшая плановая + соблюдение за месяц.
// Скрыта, пока расписание не задано в настройках (или выключено).
// Факт = день с exerciseMinutes ≥ 30 (тот же порог, что в стрике).
export function WorkoutPlanCard({ daily }: { daily: DailyMetrics[] }) {
  const { t, locale } = useT()
  const [ws, setWs] = useState<WorkoutScheduleRow | null>(null)

  useEffect(() => {
    if (isDemoActive()) { setWs(makeDemoWorkoutSchedule()); return }
    supabase.from('workout_schedule').select('weekdays, time, notify_hours_before, enabled')
      .maybeSingle()
      .then(({ data }: { data: WorkoutScheduleRow | null }) => setWs(data ?? null))
  }, [])

  if (!ws?.enabled || !ws.weekdays?.length) return null

  const now = new Date()
  const next = nextPlannedWorkout(ws.weekdays, ws.time, now)
  const pad = (n: number) => String(n).padStart(2, '0')
  const monthFrom = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const planned = plannedDaysInRange(ws.weekdays, monthFrom, todayStr)
  const done = new Set(daily.filter(d => (d.exerciseMinutes ?? 0) >= 30).map(d => d.date))
  const a = attendance(planned, done)

  let nextLabel = '—'
  if (next) {
    if (next.inDays === 0) {
      nextLabel = t('Сегодня в {time}', { time: next.time })
    } else {
      const wd = new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(next.date + 'T00:00:00'))
      nextLabel = next.inDays === 1
        ? `${wd} ${next.time} · ${t('завтра')}`
        : `${wd} ${next.time} · ${t('через {n} дн.', { n: next.inDays })}`
    }
  }

  return (
    <div className="streak-cards workout-plan-card">
      <div className="streak-card">
        <span className="streak-card-value">
          <span className="streak-card-emoji" aria-hidden>🏋️</span>
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
