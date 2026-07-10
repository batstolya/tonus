import { useEffect, useRef, useState } from 'react'
import type { DailyMetrics } from '../../types'
import {
  computeStreak, isActiveDay, hasDayData,
  ACTIVE_STEPS_MIN, ACTIVE_EXERCISE_MIN,
} from '../../lib/streak'
import { useT } from '../../lib/i18n'
import { ActivityCalendar } from './ActivityCalendar'
import { StreakStats } from './StreakStats'

interface Props {
  daily: DailyMetrics[]
}

function ymd(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

// Compact topbar entry point. The full streak and calendar only take space
// after the user asks for them, keeping the dashboard focused on health data.
export function StreakMenu({ daily }: Props) {
  const { t, locale } = useT()
  const [open, setOpen] = useState(false)
  const now = new Date()
  const nowYm = { year: now.getFullYear(), month: now.getMonth() + 1 }
  const [ym, setYm] = useState(nowYm)
  const rootRef = useRef<HTMLDivElement>(null)
  const streak = computeStreak(daily)

  // Сьогоднішній прогрес до порогу активності: показуємо, поки день не закритий.
  const todayEntry = daily.find(d => d.date === ymd(now))
  const todayActive = todayEntry ? isActiveDay(todayEntry) : false
  const todayHasData = todayEntry ? hasDayData(todayEntry) : false
  const todaySteps = todayEntry?.steps ?? 0
  const todayExercise = todayEntry?.exerciseMinutes ?? 0
  const todayPercent = Math.min(100, Math.round(
    Math.max(todaySteps / ACTIVE_STEPS_MIN, todayExercise / ACTIVE_EXERCISE_MIN) * 100,
  ))

  // Межа навігації назад — найраніший місяць з даними.
  const firstActive = daily.filter(isActiveDay).map(d => d.date).sort()[0]
  const minYm = (firstActive ?? `${nowYm.year}-${String(nowYm.month).padStart(2, '0')}`).slice(0, 7)

  useEffect(() => {
    if (!open) return

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const togglePanel = () => {
    // Кожне відкриття починається з поточного місяця.
    if (!open) setYm(nowYm)
    setOpen(value => !value)
  }

  return (
    <div className="streak-menu" ref={rootRef}>
      <button
        type="button"
        className={`streak-menu-trigger${open ? ' active' : ''}`}
        aria-label={t('Серия')}
        aria-expanded={open}
        aria-controls="streak-menu-panel"
        onClick={togglePanel}
      >
        <span className="streak-menu-flame" aria-hidden>🔥</span>
        <span className="streak-menu-count">{streak.current}</span>
        <span className="streak-menu-label">{t('Дней подряд')}</span>
      </button>

      {open && (
        <section id="streak-menu-panel" className="streak-menu-panel" role="dialog" aria-label={t('Текущий стрик')}>
          <div className="streak-menu-head">
            <span className="streak-menu-title">{t('Текущий стрик')}</span>
            <div className="streak-menu-counters">
              <span className="streak-menu-counter" title={t('Дней подряд')}>
                <span aria-hidden>🔥</span>{streak.current}
              </span>
              <span className="streak-menu-counter" title={t('Недель подряд')}>
                <span aria-hidden>⚡</span>{streak.weekly}
              </span>
              <button type="button" className="streak-menu-close" onClick={() => setOpen(false)} aria-label={t('Закрыть')}>×</button>
            </div>
          </div>
          {!todayActive && todayHasData && (
            <div className="streak-menu-today">
              <span className="streak-menu-today-text">
                {t('Сегодня')}: 🚶 {todaySteps.toLocaleString(locale)} / {ACTIVE_STEPS_MIN.toLocaleString(locale)}
                {' · '}🏃 {todayExercise} / {ACTIVE_EXERCISE_MIN} {t('мин')}
              </span>
              <div className="streak-menu-today-bar">
                <div className="streak-menu-today-fill" style={{ width: `${todayPercent}%` }} />
              </div>
            </div>
          )}
          {!todayHasData && streak.todayPending && (
            <div className="streak-menu-pending">{t('Синхронизация ожидается')}</div>
          )}
          <ActivityCalendar
            daily={daily}
            year={ym.year}
            month={ym.month}
            minYm={minYm}
            onNavigate={(year, month) => setYm({ year, month })}
          />
          <StreakStats daily={daily} year={ym.year} month={ym.month} />
        </section>
      )}
    </div>
  )
}
