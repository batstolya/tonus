import { useState, useCallback, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  loadHabits, loadHabitBreaks, createHabit, setHabitBreak, archiveHabit,
} from '../../lib/api/habits'
import type { Habit, HabitBreak } from '../../lib/habits'
import { useT } from '../../lib/i18n'
import { LoadError } from '../ui/LoadError'
import { startEffect } from '../../lib/startEffect'
import { HabitCard } from './HabitCard'
import { shiftMonth } from '../../lib/monthGrid'

// Screen owns the data: loads habits + breaks for the user and hands both
// down to HabitCard, which is presentational only. `today` is resolved from
// the browser's local clock — the bot resolves it differently (Task 6), and
// that difference is deliberate: this page runs in the user's own timezone.
// Spec: docs/superpowers/specs/2026-08-28-habits-design.md
const localDate = (d: Date) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)

export function HabitsScreen({ user }: { user: User }) {
  const { t } = useT()
  const [habits, setHabits] = useState<Habit[]>([])
  const [breaks, setBreaks] = useState<HabitBreak[]>([])
  const [loadError, setLoadError] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [fName, setFName] = useState('')
  const [fNote, setFNote] = useState('')
  const [fStart, setFStart] = useState(() => localDate(new Date()))
  const [saving, setSaving] = useState(false)
  const [breakError, setBreakError] = useState(false)

  const today = localDate(new Date())
  // One month selector drives every card, like the supplement calendar.
  const [cursor, setCursor] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const monthName = new Date(cursor.year, cursor.month, 1)
    .toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })

  const reload = useCallback(async () => {
    try {
      const [h, b] = await Promise.all([loadHabits(user.id), loadHabitBreaks(user.id)])
      setHabits(h)
      setBreaks(b)
      setLoadError(false)
    } catch {
      setLoadError(true)
    }
  }, [user.id])

  useEffect(() => { startEffect(reload) }, [reload])

  async function handleCreate() {
    const name = fName.trim()
    if (!name || saving) return
    setSaving(true)
    try {
      await createHabit(user.id, { name, note: fNote.trim() || null, start_date: fStart })
      setFName(''); setFNote(''); setFStart(localDate(new Date()))
      setShowForm(false)
      await reload()
    } catch {
      setLoadError(true)
    }
    setSaving(false)
  }

  async function handleToggleBreak(habitId: string, date: string, broken: boolean) {
    // Update local state immediately so the grid reacts without a refetch;
    // roll back if the persist call fails so the user isn't left believing a
    // slip was recorded when it wasn't.
    const prev = breaks
    setBreaks(b => broken
      ? [...b, { id: `pending-${habitId}-${date}`, habit_id: habitId, date, note: null }]
      : b.filter(x => !(x.habit_id === habitId && x.date === date)))
    setBreakError(false)
    try {
      await setHabitBreak(user.id, habitId, date, broken)
    } catch {
      setBreaks(prev)
      setBreakError(true)
    }
  }

  async function handleArchive(habitId: string) {
    // Toggle relative to the habit's current state: an archived habit's
    // button un-archives it, an active habit's button archives it. Calling
    // archiveHabit(id, false) unconditionally left the button a dead no-op
    // once a habit was already archived.
    const habit = habits.find(h => h.id === habitId)
    if (!habit) return
    try {
      await archiveHabit(habitId, !habit.active)
      await reload()
    } catch {
      setLoadError(true)
    }
  }

  const activeHabits = habits.filter(h => h.active)
  const archivedHabits = habits.filter(h => !h.active)

  return (
    <div className="screen">
      <div className="goals-header">
        <h2>{t('Привычки')}</h2>
        <button className="btn-primary" onClick={() => setShowForm(s => !s)}>
          {showForm ? t('Отмена') : `+ ${t('Добавить привычку')}`}
        </button>
      </div>

      {loadError && <LoadError onRetry={reload} />}
      {breakError && (
        <div className="load-error">
          <span>{t('Не удалось сохранить отметку — попробуй ещё раз')}</span>
        </div>
      )}

      {showForm && (
        <div className="goals-form">
          <div className="goals-form-row">
            <div className="goals-form-field">
              <label className="settings-label">{t('Название')}</label>
              <input className="log-input" value={fName} onChange={e => setFName(e.target.value)} />
            </div>
            <div className="goals-form-field">
              <label className="settings-label">{t('Заметка')}</label>
              <input className="log-input" value={fNote} onChange={e => setFNote(e.target.value)} />
            </div>
          </div>
          <div className="goals-form-row">
            <div className="goals-form-field">
              <label className="settings-label">{t('Начало отсчёта')}</label>
              <input type="date" className="log-input" value={fStart} max={today}
                onChange={e => setFStart(e.target.value)} />
            </div>
          </div>
          <button className="btn-primary" onClick={handleCreate} disabled={saving || !fName.trim()}>
            {saving ? t('Сохраняем…') : t('Создать привычку')}
          </button>
        </div>
      )}

      {activeHabits.length === 0 && !loadError && (
        <p className="empty-hint" data-testid="habits-empty">{t('Привычек пока нет.')}</p>
      )}

      {activeHabits.length > 0 && (
        <div className="supp-month-nav">
          <button className="preset" onClick={() => setCursor(c => shiftMonth(c.year, c.month, -1))}>‹</button>
          <span className="supp-month-label" data-testid="habits-month">{monthName}</span>
          <button className="preset" onClick={() => setCursor(c => shiftMonth(c.year, c.month, 1))}>›</button>
        </div>
      )}

      <div className="goals-list">
        {activeHabits.map(h => (
          <HabitCard
            key={h.id}
            habit={h}
            breaks={breaks}
            today={today}
            year={cursor.year}
            month={cursor.month}
            onToggleBreak={handleToggleBreak}
            onArchive={handleArchive}
          />
        ))}
      </div>

      {archivedHabits.length > 0 && (
        <div data-testid="habits-archived">
          <button className="btn-ghost" onClick={() => setShowArchived(s => !s)}>
            {showArchived ? t('Скрыть архив') : `${t('Архив')} (${archivedHabits.length})`}
          </button>
          {showArchived && (
            <div className="goals-list">
              {archivedHabits.map(h => (
                <HabitCard
                  key={h.id}
                  habit={h}
                  breaks={breaks}
                  today={today}
                  year={cursor.year}
                  month={cursor.month}
                  onToggleBreak={handleToggleBreak}
                  onArchive={handleArchive}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
