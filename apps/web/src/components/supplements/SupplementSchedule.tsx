import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { useT } from '../../lib/i18n'
import {
  loadProfileBasics, saveProfileBasics, saveReminder,
  type Supplement, type ProfileBasics, type Sex,
} from '../../lib/supplements'
import {
  fetchSupplementSchedule, scheduleToReminderTimes, type Schedule,
} from '../../lib/supplementSchedule'

// 🕐 AI "ideal supplement timing" card on the supplements page. Asks once for
// age + sex, calls the supplement-schedule edge function, renders the day plan,
// and can write the recommended times into the existing reminders.

const CURRENT_YEAR = new Date().getFullYear()

export function SupplementSchedule({ user, supplements }: { user: User; supplements: Supplement[] }) {
  const { t } = useT()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [schedule, setSchedule] = useState<Schedule | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [profile, setProfile] = useState<ProfileBasics | null | undefined>(undefined)
  const [colMissing, setColMissing] = useState(false)
  const [showProfileForm, setShowProfileForm] = useState(false)
  const [birthYear, setBirthYear] = useState('')
  const [sex, setSex] = useState<Sex | ''>('')
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
    let p = profile
    if (p === undefined) {
      p = await loadProfileBasics(user.id)
      setProfile(p)
      if (p === null) setColMissing(true)
    }
    // Ask for age/sex once if we can store it but it's not set yet.
    if (p && p.birth_year == null && !showProfileForm) {
      setBirthYear(''); setSex('')
      setShowProfileForm(true)
      return
    }
    await generate()
  }

  async function handleSaveProfile() {
    const yr = parseInt(birthYear, 10)
    if (!isNaN(yr) && yr >= 1900 && yr <= CURRENT_YEAR) {
      const patch: Partial<ProfileBasics> = { birth_year: yr, sex: sex || null }
      await saveProfileBasics(user.id, patch)
      setProfile((prev) => ({ birth_year: yr, sex: sex || null, ...(prev ?? {}), ...patch }))
    }
    setShowProfileForm(false)
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

      {colMissing && (
        <div className="auth-error" style={{ marginBottom: 12, fontSize: 13 }}>
          ⚠️ {t('Колонки возраста нет в БД. Запусти в Supabase SQL Editor:')}<br />
          <code style={{ fontSize: 11 }}>alter table profiles add column if not exists birth_year int; alter table profiles add column if not exists sex text;</code>
        </div>
      )}

      {showProfileForm && (
        <div className="supp-form" style={{ marginBottom: 14 }}>
          <input
            className="supp-input supp-input-sm"
            type="text"
            inputMode="numeric"
            placeholder={t('Год рождения')}
            value={birthYear}
            onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
          />
          <select className="supp-input supp-input-sm" value={sex} onChange={(e) => setSex(e.target.value as Sex | '')}>
            <option value="">{t('Пол')}</option>
            <option value="male">{t('Мужской')}</option>
            <option value="female">{t('Женский')}</option>
          </select>
          <button className="btn-primary" onClick={handleSaveProfile} disabled={loading}>
            {t('Сохранить и подобрать')}
          </button>
          <button className="btn-ghost" onClick={() => { setShowProfileForm(false); generate() }}>
            {t('Пропустить')}
          </button>
        </div>
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
