import type { DailyMetrics } from '../../types'
import { getMonthlyStats } from '../../lib/streak-stats'
import { getWeeklyRecord } from '../../lib/streak'
import { useT } from '../../lib/i18n'
import { CountUp } from '../common/CountUp'

interface Props {
  daily: DailyMetrics[]
  year: number
  month: number // 1-12 — обраний у календарі місяць
}

// Дві карточки під календарем: тижневий рекорд за весь час і активні дні
// обраного місяця (число слідує за навігацією календаря).
export function StreakStats({ daily, year, month }: Props) {
  const { t, locale } = useT()
  const weeklyRecord = getWeeklyRecord(daily)
  const monthly = getMonthlyStats(daily, year, month)
  const monthName = new Intl.DateTimeFormat(locale, { month: 'long' })
    .format(new Date(year, month - 1, 1))

  return (
    <div className="streak-cards">
      <div className="streak-card">
        <span className="streak-card-value">
          <span className="streak-card-emoji" aria-hidden>⚡</span>
          <CountUp value={weeklyRecord} />
        </span>
        <span className="streak-card-label">{t('Недельный рекорд')}</span>
      </div>
      <div className="streak-card">
        <span className="streak-card-value">
          <span className="streak-card-emoji" aria-hidden>📅</span>
          <CountUp value={monthly.activeDays} /> / {monthly.totalDays}
        </span>
        <span className="streak-card-label">{t('Активные дни · {m}', { m: monthName })}</span>
      </div>
    </div>
  )
}
