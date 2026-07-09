import { motion } from 'motion/react'
import type { DailyMetrics } from '../../types'
import { computeStreak, isActiveDay } from '../../lib/streak'
import { useT } from '../../lib/i18n'

interface Props {
  daily: DailyMetrics[]
}

function ymd(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

type Status = 'active' | 'frozen' | 'missed' | 'future'

// Текущий месяц кружками-днями (в духе mate.academy): активный залит, сегодня
// подсвечен, закрытый заморозкой — ❄️. Чистый CSS-grid, без recharts.
export function ActivityCalendar({ daily }: Props) {
  const { t } = useT()
  const today = new Date()
  const todayStr = ymd(today)

  const active = new Set<string>()
  for (const d of daily) if (isActiveDay(d)) active.add(d.date)
  const frozen = new Set(computeStreak(daily, today).frozenDates)

  const year = today.getFullYear()
  const month = today.getMonth()
  const first = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const leadBlanks = (first.getDay() + 6) % 7 // Mon-first grid

  const cells: { key: string; blank?: boolean; date?: string; day?: number; status?: Status }[] = []
  for (let i = 0; i < leadBlanks; i++) cells.push({ key: `b${i}`, blank: true })
  for (let d = 1; d <= daysInMonth; d++) {
    const date = ymd(new Date(year, month, d))
    let status: Status
    if (date > todayStr) status = 'future'
    else if (active.has(date)) status = 'active'
    else if (frozen.has(date)) status = 'frozen'
    else status = 'missed'
    cells.push({ key: date, date, day: d, status })
  }

  const label = (status?: Status) =>
    status === 'active' ? t('данные есть') : status === 'frozen' ? t('заморожено') : status === 'missed' ? t('пропуск') : ''

  const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

  return (
    <div className="activity-cal">
      <div className="activity-cal-title">{t('Активность')}</div>
      <div className="activity-cal-grid">
        {weekdays.map(w => <div key={w} className="activity-cal-dow">{t(w)}</div>)}
        {cells.map((c, i) =>
          c.blank ? (
            <div key={c.key} className="activity-cal-cell blank" />
          ) : (
            <motion.div
              key={c.key}
              className={`activity-cal-cell status-${c.status}${c.date === todayStr ? ' is-today' : ''}`}
              title={label(c.status)}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: Math.min(0.4, i * 0.008), duration: 0.2 }}
            >
              {c.status === 'frozen' ? '❄️' : c.day}
            </motion.div>
          )
        )}
      </div>
    </div>
  )
}
