import type { DailyMetrics } from '../../types'
import { getMonthlyStats, getAllStreakRecords, getMilestoneProgress } from '../../lib/streak-stats'
import { computeStreak } from '../../lib/streak'
import { useT } from '../../lib/i18n'
import { CountUp } from '../common/CountUp'

interface Props {
  daily: DailyMetrics[]
}

export function StreakStats({ daily }: Props) {
  const { t } = useT()
  const today = new Date()
  const currentYear = today.getFullYear()
  const currentMonth = today.getMonth() + 1

  const monthly = getMonthlyStats(daily, currentYear, currentMonth)
  const streak = computeStreak(daily)
  const milestone = getMilestoneProgress(streak.current)
  const records = getAllStreakRecords(daily)
  const record = records.reduce((max, r) => r.days > max.days ? r : max, records[0])

  return (
    <div className="streak-stats">
      <div className="streak-stats-row">
        <div className="streak-stats-item">
          <span className="streak-stats-label">{t('Активных дней')}</span>
          <span className="streak-stats-value">
            <CountUp value={monthly.activeDays} /> / {monthly.totalDays}
          </span>
          <div className="streak-stats-bar">
            <div
              className="streak-stats-bar-fill"
              style={{ width: `${(monthly.activeDays / monthly.totalDays) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {record && (
        <div className="streak-stats-row">
          <div className="streak-stats-item">
            <span className="streak-stats-label">{t('Личный рекорд')}</span>
            <span className="streak-stats-value">
              <CountUp value={record.days} /> {t('дн.')}
            </span>
          </div>
        </div>
      )}

      {milestone && (
        <div className="streak-stats-row">
          <div className="streak-stats-item">
            <span className="streak-stats-label">{t('До')} {milestone.nextMilestone} {t('дней')}</span>
            <span className="streak-stats-value">
              {milestone.daysToGo} {t('дн.')}
            </span>
            <div className="streak-stats-bar">
              <div
                className="streak-stats-bar-fill"
                style={{ width: `${milestone.percent}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
