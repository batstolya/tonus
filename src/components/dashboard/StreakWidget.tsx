import { motion } from 'motion/react'
import type { DailyMetrics } from '../../types'
import { computeStreak } from '../../lib/streak'
import { CountUp } from '../common/CountUp'
import { useT } from '../../lib/i18n'

interface Props {
  daily: DailyMetrics[]
}

// mate-style streak block: Day / Freeze / Week + fire icon. Derives everything
// from the daily timeline via computeStreak (no persisted state).
export function StreakWidget({ daily }: Props) {
  const { t } = useT()
  const s = computeStreak(daily)

  const items = [
    { emoji: '🔥', value: s.current, label: t('Дней подряд') },
    { emoji: '❄️', value: s.freezesAvailable, label: t('Заморозки') },
    { emoji: '⚡', value: s.weekly, label: t('Недель подряд') },
  ]

  return (
    <div className="streak-widget">
      <div className="streak-widget-head">
        <span className="streak-widget-title">{t('Серия')}</span>
        {s.todayPending && (
          <span className="streak-widget-pending">{t('Синхронизация ожидается')}</span>
        )}
      </div>
      <div className="streak-widget-row">
        {items.map(it => (
          <div key={it.label} className="streak-metric">
            <motion.span className="streak-metric-emoji" aria-hidden
              animate={it.emoji === '🔥' && s.current > 0 ? { scale: [1, 1.18, 1] } : undefined}
              transition={{ duration: 0.5, ease: 'easeOut' }}>
              {it.emoji}
            </motion.span>
            <span className="streak-metric-value"><CountUp value={it.value} /></span>
            <span className="streak-metric-label">{it.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
