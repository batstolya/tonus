import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { useT } from '../../lib/i18n'
import { saveReminder, type Supplement } from '../../lib/supplements'
import { loadProfileBasics, type ProfileBasics } from '../../lib/api/settings'
import {
  fetchSupplementSchedule, scheduleToReminderTimes, type Schedule,
} from '../../lib/supplementSchedule'

// 🕐 AI "ideal supplement timing" card on the supplements page. Reads age + sex
// from the profile, calls the supplement-schedule edge function, renders the day
// plan, and can write the recommended times into the existing reminders. The
// profile is edited in Settings — two editors for one field drift apart.

export function SupplementSchedule({ user, supplements }: { user: User; supplements: Supplement[] }) {
  const { t } = useT()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [schedule, setSchedule] = useState<Schedule | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [profile, setProfile] = useState<ProfileBasics | null | undefined>(undefined)
  const [applied, setApplied] = useState<number | null>(null)

  if (supplements.length === 0) return null

  async function generate() {
    setLoading(true); setError(null); setApplied(null); setMessage(null)
    try {
      const res = await fetchSupplementSchedule()
      if (res.schedule) setSchedule(res.schedule)
      else { setSchedule(null); setMessage(res.message || t('Нет рекомендаций')) }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  async function handleGenerate() {
    setError(null)
    // Read the profile only to tell the user where to fill it in; the schedule
    // function reads age and sex server-side either way.
    if (profile === undefined) setProfile(await loadProfileBasics(user.id))
    await generate()
  }

  async function handleApply() {
    if (!schedule) return
    const map = scheduleToReminderTimes(schedule)
    const byName = new Map(supplements.map((s) => [s.name, s.id]))
    let n = 0
    for (const [name, times] of Object.entries(map)) {
      const id = byName.get(name)
      if (!id) continue
      const ok = await saveReminder(user.id, id, { times, enabled: true })
      if (ok) n++
    }
    setApplied(n)
  }

  return (
    <div className="supp-sched" style={{ marginTop: 28 }}>
      <div className="supp-sched-head">
        <h3>🕐 {t('Идеальное время приёма')}</h3>
        <button className="btn-suggest" onClick={handleGenerate} disabled={loading}>
          {loading ? <span className="ai-spinner" /> : '✨'} {t('Подобрать (ИИ)')}
        </button>
      </div>

      {profile && profile.birth_year == null && (
        <p className="supp-hint">{t('Укажи год рождения и пол в Настройках — расписание подбирается по возрасту')}</p>
      )}

      {error && (
        <div className="auth-error" style={{ marginBottom: 12, fontSize: 13 }}>
          ⚠️ {error}
          <button style={{ marginLeft: 8, fontSize: 11, cursor: 'pointer' }} onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {message && !schedule && <p className="empty-hint">{message}</p>}

      {schedule && (
        <div className="supp-sched-result">
          {schedule.slots.map((slot, i) => (
            <div key={i} className="supp-sched-slot">
              <div className="supp-sched-time">
                <span className="supp-sched-clock">{slot.time}</span>
                {slot.label && <span className="supp-sched-label">{slot.label}</span>}
              </div>
              <ul className="supp-sched-items">
                {slot.items.map((it, j) => (
                  <li key={j}>
                    <span className="supp-sched-sup">{it.supplement}</span>
                    {it.reason && <span className="supp-sched-reason"> — {it.reason}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {schedule.notes && <p className="supp-sched-notes">{schedule.notes}</p>}

          <div className="supp-sched-actions">
            <button className="btn-primary" onClick={handleApply} disabled={applied !== null}>
              {applied !== null
                ? `✓ ${t('Применено к напоминаниям')}: ${applied}`
                : t('Применить к напоминаниям')}
            </button>
          </div>

          {schedule.disclaimer && <p className="treatment-disclaimer">{schedule.disclaimer}</p>}
        </div>
      )}
    </div>
  )
}
