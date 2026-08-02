import { motion } from 'motion/react'
import type { DailyMetrics } from '../../types'
import { computeStreak, isActiveDay, hasDayData, WEEKLY_MIN_DAYS } from '../../lib/streak'
import { useT } from '../../lib/i18n'
import { Icon } from '../../lib/icons'

interface Props {
  daily: DailyMetrics[]
  year: number
  month: number // 1-12
  minYm: string // 'YYYY-MM' — найраніший місяць з даними (межа навігації назад)
  onNavigate: (year: number, month: number) => void
}

function ymd(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

type Status = 'active' | 'frozen' | 'idle' | 'missed' | 'future'

// Календар обраного місяця (в духе mate.academy): дні-кружки + колонка
// тижневих чекмарок зліва (тиждень з >= WEEKLY_MIN_DAYS активними днями).
// Навігація ‹ › в межах [minYm, поточний місяць]. Чистий CSS-grid, без recharts.
export function ActivityCalendar({ daily, year, month, minYm, onNavigate }: Props) {
  const { t, locale } = useT()
  const today = new Date()
  const todayStr = ymd(today)

  const active = new Set<string>()
  const withData = new Set<string>()
  for (const d of daily) {
    if (isActiveDay(d)) active.add(d.date)
    if (hasDayData(d)) withData.add(d.date)
  }
  const frozen = new Set(computeStreak(daily, today).frozenDates)

  const m0 = month - 1
  const first = new Date(year, m0, 1)
  const daysInMonth = new Date(year, m0 + 1, 0).getDate()
  const lead = (first.getDay() + 6) % 7 // Mon-first grid
  const weeksCount = Math.ceil((lead + daysInMonth) / 7)

  // idle = дані є, поріг руху не закритий (лінивий день);
  // missed = даних взагалі нема (дірка в синку). До cutoff idle не буває.
  const statusOf = (date: string): Status => {
    if (date > todayStr) return 'future'
    if (active.has(date)) return 'active'
    if (frozen.has(date)) return 'frozen'
    if (withData.has(date)) return 'idle'
    return 'missed'
  }

  // Тиждень рахується по повному Пн-Нд, включно з днями сусідніх місяців —
  // так само тижні рахує computeWeekly/getWeeklyRecord.
  const weekMonday = (w: number) => new Date(year, m0, 1 - lead + w * 7)
  const weekActive = (monday: Date) => {
    let n = 0
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday)
      d.setDate(d.getDate() + i)
      if (active.has(ymd(d))) n++
    }
    return n
  }

  const ym = `${year}-${String(month).padStart(2, '0')}`
  const nowYm = todayStr.slice(0, 7)
  const canPrev = ym > minYm
  const canNext = ym < nowYm
  const shift = (delta: number) => {
    const d = new Date(year, m0 + delta, 1)
    onNavigate(d.getFullYear(), d.getMonth() + 1)
  }
  // Вручную «Місяць Рік»: year:'numeric' у uk дає хвіст «р.», а CSS-capitalize
  // капіталізував би і його.
  const monthName = new Intl.DateTimeFormat(locale, { month: 'long' }).format(first)
  const monthLabel = `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)} ${year}`

  const label = (status: Status) =>
    status === 'active' ? t('активный день')
      : status === 'frozen' ? t('заморожено')
      : status === 'idle' ? t('без активности')
      : status === 'missed' ? t('нет данных')
      : ''

  const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

  return (
    <div className="activity-cal">
      <div className="activity-cal-nav">
        <button type="button" className="activity-cal-arrow" onClick={() => shift(-1)}
          disabled={!canPrev} aria-label={t('Предыдущий месяц')}>‹</button>
        <span className="activity-cal-month">{monthLabel}</span>
        <button type="button" className="activity-cal-arrow" onClick={() => shift(1)}
          disabled={!canNext} aria-label={t('Следующий месяц')}>›</button>
      </div>
      <div className="activity-cal-grid">
        <div className="activity-cal-dow" />
        {weekdays.map(w => <div key={w} className="activity-cal-dow">{t(w)}</div>)}
        {Array.from({ length: weeksCount }, (_, w) => {
          const monday = weekMonday(w)
          const done = weekActive(monday) >= WEEKLY_MIN_DAYS
          return [
            <div key={`w${ymd(monday)}`} className={`activity-cal-week${done ? ' done' : ''}`} aria-hidden>
              {done ? '✓' : ''}
            </div>,
            ...Array.from({ length: 7 }, (_, i) => {
              const d = new Date(monday)
              d.setDate(d.getDate() + i)
              const date = ymd(d)
              if (d.getMonth() !== m0) {
                return <div key={date} className="activity-cal-cell adjacent">{d.getDate()}</div>
              }
              const status = statusOf(date)
              return (
                <motion.div
                  key={date}
                  className={`activity-cal-cell status-${status}${date === todayStr ? ' is-today' : ''}`}
                  title={label(status)}
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: Math.min(0.4, (w * 7 + i) * 0.008), duration: 0.2 }}
                >
                  {status === 'frozen' ? <Icon name="frozen" size={14} /> : d.getDate()}
                </motion.div>
              )
            }),
          ]
        })}
      </div>
    </div>
  )
}
