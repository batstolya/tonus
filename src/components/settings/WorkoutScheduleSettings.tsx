import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { isDemoActive } from '../../lib/demo'
import { makeDemoWorkoutSchedule } from '../../lib/demoFixture'
import { useT } from '../../lib/i18n'

interface ScheduleState {
  weekdays: number[]
  time: string
  notify_hours_before: number
  enabled: boolean
}

const DAY_KEYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] // индекс+1 = weekday (1=Пн…7=Вс)

// Карточка «Расписание тренировок»: дни недели + время + «напомнить за N часов».
// Пишет в workout_schedule (upsert); уведомление шлёт send-reminders.
export function WorkoutScheduleSettings({ user }: { user: User }) {
  const { t } = useT()
  const demo = isDemoActive()
  const [ws, setWs] = useState<ScheduleState>({ weekdays: [], time: '19:00', notify_hours_before: 4, enabled: true })
  const [loaded, setLoaded] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (demo) { setWs(makeDemoWorkoutSchedule()); setLoaded(true); return }
    supabase.from('workout_schedule').select('weekdays, time, notify_hours_before, enabled')
      .maybeSingle()
      .then(({ data }: { data: ScheduleState | null }) => {
        if (data) setWs(data)
        setLoaded(true)
      })
  }, [demo])

  const patch = (p: Partial<ScheduleState>) => {
    const next = { ...ws, ...p }
    setWs(next)
    if (demo) return
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Kyiv'
    supabase.from('workout_schedule')
      .upsert({ user_id: user.id, ...next, timezone })
      .then(({ error }: { error: unknown }) => {
        if (!error) { setSaved(true); setTimeout(() => setSaved(false), 1500) }
      })
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
            const on = ws.weekdays.includes(day)
            return (
              <button
                key={label}
                className={`rep-seg-btn${on ? ' on' : ''}`}
                disabled={demo}
                onClick={() => patch({ weekdays: on ? ws.weekdays.filter(d => d !== day) : [...ws.weekdays, day].sort() })}
              >{t(label)}</button>
            )
          })}
        </div>
      </div>

      <div className="rep-setting">
        <span className="settings-label">{t('Время тренировки')}</span>
        <input
          type="time" value={ws.time} disabled={demo}
          onChange={e => patch({ time: e.target.value })}
          className="log-input" style={{ width: 100 }}
        />
      </div>

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
