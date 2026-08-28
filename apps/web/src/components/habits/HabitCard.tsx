import { habitDays, habitStats, addDays } from '../../lib/habits'
import type { Habit, HabitBreak, DayStatus } from '../../lib/habits'
import { useT } from '../../lib/i18n'
import { Icon } from '../../lib/icons'

export interface HabitCardProps {
  habit: Habit
  breaks: HabitBreak[]
  today: string
  onToggleBreak: (habitId: string, date: string, broken: boolean) => void
  onArchive: (habitId: string) => void
}

// Presentational only: no query, no persistence. The screen (Task 5) owns the
// data and passes the day list down; this card renders it and reports intent
// through onToggleBreak/onArchive.
export function HabitCard({ habit, breaks, today, onToggleBreak, onArchive }: HabitCardProps) {
  const { t } = useT()
  const days = habitDays(habit, breaks, today)
  const stats = habitStats(days)
  const yesterday = addDays(today, -1)
  // The RPC rejects a break before start_date; disable rather than let the
  // user hit a generic failure banner for a day the habit didn't exist yet.
  const yesterdayExists = yesterday >= habit.start_date
  const brokenDates = new Set(breaks.filter(b => b.habit_id === habit.id).map(b => b.date))

  // Same Mon-first week grid as ActivityCalendar, so the two calendars read
  // as one system: leading blanks pad the first row out to a full week.
  const leadDow = days.length > 0 ? (new Date(`${days[0].date}T00:00:00Z`).getUTCDay() + 6) % 7 : 0

  const toggle = (date: string) => {
    onToggleBreak(habit.id, date, !brokenDates.has(date))
  }

  const breakLabel = (date: string) =>
    brokenDates.has(date) ? t('Убрать отметку') : date === today ? t('Сорвался сегодня') : t('Сорвался вчера')

  return (
    <div className="habit-card">
      <div className="habit-card-header">
        <div>
          <div className="habit-card-name">{habit.name}</div>
          {habit.note && <div className="habit-card-note">{habit.note}</div>}
        </div>
        <button
          type="button"
          className="habit-card-archive"
          onClick={() => onArchive(habit.id)}
          aria-label={habit.active ? t('Архивировать привычку') : t('Восстановить привычку')}
        >
          <Icon name="archive" size={16} title={habit.active ? t('Архивировать привычку') : t('Восстановить привычку')} />
        </button>
      </div>

      <div className="habit-card-streaks">
        <div className="habit-card-streak-main">
          <Icon name="streak" size={20} />
          <span data-testid="habit-streak">{stats.currentStreak}</span>
        </div>
        <div className="habit-card-streak-best">
          {t('Лучший')}: {stats.bestStreak}
        </div>
      </div>

      <div className="habit-card-grid">
        {Array.from({ length: leadDow }, (_, i) => (
          <div key={`blank${i}`} className="habit-day-cell blank" aria-hidden />
        ))}
        {days.map(day => (
          <HabitDayCell
            key={day.date}
            date={day.date}
            status={day.status}
            interactive={day.date === today || day.date === yesterday}
            onClick={() => toggle(day.date)}
          />
        ))}
      </div>

      <div className="habit-card-controls">
        <button type="button" data-testid="habit-break-today" onClick={() => toggle(today)}>
          {breakLabel(today)}
        </button>
        <button
          type="button"
          data-testid="habit-break-yesterday"
          disabled={!yesterdayExists}
          onClick={() => toggle(yesterday)}
        >
          {breakLabel(yesterday)}
        </button>
      </div>

      <div className="habit-card-footer">
        <span>{t('Срывов за 30 дней')}: {stats.breaks30}</span>
        <span>{t('Чистых дней')}: {stats.cleanDays} / {stats.windowDays}</span>
        {stats.windowDays >= 30 && (
          <span data-testid="habit-pct">
            {Math.round((stats.cleanDays / stats.windowDays) * 100)}%
          </span>
        )}
      </div>
    </div>
  )
}

interface DayCellProps {
  date: string
  status: DayStatus
  interactive: boolean
  onClick: () => void
}

// A single DOM element can only carry one data-testid value, but the tests
// need both "every cell" (habit-day) and "this exact date" (habit-day-DATE)
// lookups. Two nested elements give both without a custom RTL matcher.
function HabitDayCell({ date, status, interactive, onClick }: DayCellProps) {
  return (
    <div data-testid="habit-day">
      <button
        type="button"
        data-testid={`habit-day-${date}`}
        data-status={status}
        title={date}
        className={`habit-day-cell status-${status}`}
        disabled={!interactive}
        onClick={interactive ? onClick : undefined}
      />
    </div>
  )
}
