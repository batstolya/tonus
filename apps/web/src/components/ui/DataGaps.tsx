import type { DailyMetrics } from '../../types'
import { computeGaps } from '../../lib/dataCompleteness'
import { useT } from '../../lib/i18n'
import { Icon } from '../../lib/icons'

interface Props {
  daily: DailyMetrics[]
  days?: number
  compact?: boolean
}

export function DataGaps({ daily, days = 14, compact = false }: Props) {
  const { t } = useT()
  const gaps = computeGaps(daily, days)
  const significant = gaps.filter(g => g.missingDays >= 3)

  if (!significant.length) return null

  if (compact) {
    return (
      <span className="data-gaps-compact" title={significant.map(g => `${g.label}: нет ${g.missingDays} дн`).join(', ')}>
        <Icon name="warning" size={14} /> {t('Неполные данные')} ({significant.length})
      </span>
    )
  }

  return (
    <div className="data-gaps">
      <div className="data-gaps-title"><Icon name="warning" size={14} /> {t('Пробелы в данных за')} {days} {t('дн')}:</div>
      <div className="data-gaps-list">
        {significant.map(g => (
          <span key={g.metric} className="data-gaps-chip">
            {g.label}: <b>{t('нет')} {g.missingDays} {t('дн')}</b>
          </span>
        ))}
      </div>
      <div className="data-gaps-note">{t('Выводы ИИ менее точны при пробелах в данных.')}</div>
    </div>
  )
}
