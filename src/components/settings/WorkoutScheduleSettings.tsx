import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { isDemoActive } from '../../lib/demo'
import { makeDemoWorkoutSchedule } from '../../lib/demoFixture'
import { useT } from '../../lib/i18n'
import type { DayTimes } from '../../lib/workoutPlan'
import type { Json } from '../../lib/database.types'

interface ScheduleState {
  day_times: DayTimes
  notify_hours_before: number
  enabled: boolean
}

const DAY_KEYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] // индекс+1 = weekday (1=Пн…7=Вс)

// Карточка «Расписание тренировок»: у каждого дня своё время и вид спорта.
// Пишет в workout_schedule.day_times (upsert); уведомление шлёт send-reminders.
export function WorkoutScheduleSettings({ user }: { user: User }) {
  const { t } = useT()
  const demo = isDemoActive()
  // Демо-значения ставим ленивыми инициализаторами, а не синхронным setState в
  // эффекте (react-hooks/set-state-in-effect) — то же состояние, на рендер меньше.
  const [ws, setWs] = useState<ScheduleState>(() => demo ? makeDemoWorkoutSchedule() : { day_times: {}, notify_hours_before: 4, enabled: true })
  const [loaded, setLoaded] = useState(() => demo)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (demo) return
    supabase.from('workout_schedule').select('day_times, notify_hours_before, enabled')
      .maybeSingle()
      .then(({ data }) => {
        if (data) setWs({ ...data, day_times: (data.day_times ?? {}) as unknown as DayTimes })
        setLoaded(true)
      })
  }, [demo])

  const patch = (p: Partial<ScheduleState>) => {
    const next = { ...ws, ...p }
    setWs(next)
    if (demo) return
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Kyiv'
    supabase.from('workout_schedule')
      .upsert({ user_id: user.id, ...next, day_times: next.day_times as unknown as Json, timezone })
      .then(({ error }: { error: unknown }) => {
        if (!error) { setSaved(true); setTimeout(() => setSaved(false), 1500) }
      })
  }

  const toggleDay = (day: number) => {
    const key = String(day)
    const next = { ...ws.day_times }
    if (next[key]) delete next[key]
    else next[key] = { time: '19:00' }
    patch({ day_times: next })
  }

  const patchDay = (day: number, p: Partial<{ time: string; label: string }>) => {
    const key = String(day)
    const cur = ws.day_times[key]
    if (!cur) return
    patch({ day_times: { ...ws.day_times, [key]: { ...cur, ...p } } })
  }

  if (!loaded) return null

  return (
    <section className="settings-section">
      <h3 className="settings-section-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 8 }}><path d="M6.5 6.5h11v11h-11z"/><path d="M2 12h2.5M19.5 12H22M12 2v2.5M12 19.5V22"/></svg>
        {t('Расписание тренировок')}
        {saved && <span className="settings-muted" style={{ marginLeft: 8, fontSize: 12 }}>{t('Расписание сохранено')}</span>}
      </h3>

      <div className="rep-setting">
        <span className="settings-label">{t('Дни недели')}</span>
        <div className="rep-seg">
          {DAY_KEYS.map((label, i) => {
            const day = i + 1
            const on = Boolean(ws.day_times[String(day)])
            return (
              <button
                key={label}
                className={`rep-seg-btn${on ? ' on' : ''}`}
                disabled={demo}
                onClick={() => toggleDay(day)}
              >{t(label)}</button>
            )
          })}
        </div>
      </div>

      {DAY_KEYS.map((label, i) => {
        const day = i + 1
        const entry = ws.day_times[String(day)]
        if (!entry) return null
        return (
          <div className="rep-setting" key={label}>
            <span className="settings-label">{t(label)}</span>
            <input
              type="time" value={entry.time} disabled={demo}
              onChange={e => patchDay(day, { time: e.target.value })}
              className="log-input" style={{ width: 100 }}
            />
            <input
              type="text" value={entry.label ?? ''} disabled={demo}
              placeholder={t('вид спорта (необязательно)')}
              onChange={e => patchDay(day, { label: e.target.value })}
              className="log-input" style={{ width: 180, marginLeft: 8 }}
            />
          </div>
        )
      })}

      <div className="rep-setting">
        <span className="settings-label">{t('Напомнить за')}</span>
        <div className="rep-seg">
          {[2, 3, 4, 6].map(h => (
            <button
              key={h}
              className={`rep-seg-btn${ws.notify_hours_before === h ? ' on' : ''}`}
              disabled={demo}
              onClick={() => patch({ notify_hours_before: h })}
            >{t('{n} ч. до', { n: h })}</button>
          ))}
        </div>
      </div>

      <label className="rep-toggle-row">
        <input type="checkbox" checked={ws.enabled} disabled={demo} onChange={e => patch({ enabled: e.target.checked })} />
        <span className="settings-label">{t('Уведомления включены')}</span>
      </label>
    </section>
  )
}
