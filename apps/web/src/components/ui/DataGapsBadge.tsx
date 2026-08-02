import { useState } from 'react'
import type { DailyMetrics } from '../../types'
import { computeGaps } from '../../lib/dataCompleteness'
import { useT } from '../../lib/i18n'
import { Icon } from '../../lib/icons'

interface Props {
  daily: DailyMetrics[]
  days?: number
}

// Data gaps live in the topbar rather than on the dashboard: the banner spelled
// out a caveat about the AI analysis above every card, every day the sync had
// holes. The icon keeps the warning in sight and the detail one click away.
export function DataGapsBadge({ daily, days = 14 }: Props) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const significant = computeGaps(daily, days).filter(g => g.missingDays >= 3)
  if (!significant.length) return null

  return (
    <div className="topbar-badge-wrap">
      <button
        type="button"
        className="topbar-badge data-gaps-badge"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label={`${t('Пробелы в данных за')} ${days} ${t('дн')} (${significant.length})`}
      >
        <Icon name="warning" size={17} />
      </button>
      {open && (
        <>
          <div className="lang-overlay" onClick={() => setOpen(false)} />
          <div className="topbar-pop" role="status">
            <strong className="topbar-pop-title">{t('Пробелы в данных за')} {days} {t('дн')}</strong>
            <div className="data-gaps-list">
              {significant.map(g => (
                <span key={g.metric} className="data-gaps-chip">
                  {g.label}: <b>{t('нет')} {g.missingDays} {t('дн')}</b>
                </span>
              ))}
            </div>
            <p className="topbar-pop-note">{t('Выводы ИИ менее точны при пробелах в данных.')}</p>
          </div>
        </>
      )}
    </div>
  )
}
