import { useEffect, useRef, useState } from 'react'
import type { DailyMetrics } from '../../types'
import { computeStreak } from '../../lib/streak'
import { useT } from '../../lib/i18n'
import { ActivityCalendar } from './ActivityCalendar'
import { StreakWidget } from './StreakWidget'
import { StreakStats } from './StreakStats'

interface Props {
  daily: DailyMetrics[]
}

// Compact topbar entry point. The full streak and calendar only take space
// after the user asks for them, keeping the dashboard focused on health data.
export function StreakMenu({ daily }: Props) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const streak = computeStreak(daily)

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

  return (
    <div className="streak-menu" ref={rootRef}>
      <button
        type="button"
        className={`streak-menu-trigger${open ? ' active' : ''}`}
        aria-label={t('Серия')}
        aria-expanded={open}
        aria-controls="streak-menu-panel"
        onClick={() => setOpen(value => !value)}
      >
        <span className="streak-menu-flame" aria-hidden>🔥</span>
        <span className="streak-menu-count">{streak.current}</span>
        <span className="streak-menu-label">{t('Дней подряд')}</span>
      </button>

      {open && (
        <section id="streak-menu-panel" className="streak-menu-panel" role="dialog" aria-label={t('Серия')}>
          <div className="streak-menu-head">
            <span>{t('Серия')}</span>
            <button type="button" className="streak-menu-close" onClick={() => setOpen(false)} aria-label={t('Закрыть')}>×</button>
          </div>
          <StreakStats daily={daily} />
          <StreakWidget daily={daily} />
          <ActivityCalendar daily={daily} />
        </section>
      )}
    </div>
  )
}
