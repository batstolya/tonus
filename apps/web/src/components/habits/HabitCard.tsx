import { habitDays, habitStats } from '../../lib/habits'
import type { Habit, HabitBreak } from '../../lib/habits'
import { monthGrid } from '../../lib/monthGrid'
import { useT } from '../../lib/i18n'
import { Icon } from '../../lib/icons'

export interface HabitCardProps {
  habit: Habit
  breaks: HabitBreak[]
  today: string
  /** Calendar year and zero-based month the screen is showing. */
  year: number
  month: number
  onToggleBreak: (habitId: string, date: string, broken: boolean) => void
  onArchive: (habitId: string) => void
}

/** How a day of the displayed month relates to the habit. */
type CellStatus = 'clean' | 'broken' | 'outside' | 'future'

// Presentational only: no query, no persistence. The screen owns the data and
// the month being shown; this card renders it and reports intent through
// onToggleBreak/onArchive.
//
// Deliberately the supplement calendar, inverted: there a cell is empty until
// the user checks it off, here it is checked from the start and the user
// unchecks a day they slipped on.
export function HabitCard({
  habit, breaks, today, year, month, onToggleBreak, onArchive,
}: HabitCardProps) {
  const { t } = useT()
  const stats = habitStats(habitDays(habit, breaks, today))
  const grid = monthGrid(year, month)
  const brokenDates = new Set(breaks.filter(b => b.habit_id === habit.id).map(b => b.date))

  const statusOf = (date: string): CellStatus => {
    if (date > today) return 'future'
    if (date < habit.start_date) return 'outside'
    return brokenDates.has(date) ? 'broken' : 'clean'
  }

  const cleanPct = stats.windowDays >= 30
    ? Math.round((stats.cleanDays / stats.windowDays) * 100)
    : null

  return (
    <div className="supp-card">
      <div className="supp-card-header">
        <div>
          <span className="supp-name">{habit.name}</span>
          {habit.note && <span className="supp-dose">{habit.note}</span>}
        </div>
        <div className="supp-card-actions">
          <span className="habit-streak-badge" data-testid="habit-streak">
            {stats.currentStreak} {t('дн. чисто')}
          </span>
          <span className="habit-best">{t('Лучший')}: {stats.bestStreak}</span>
          {cleanPct !== null && (
            <span className={`supp-pct ${cleanPct >= 80 ? 'good' : cleanPct >= 50 ? 'ok' : 'bad'}`} data-testid="habit-pct">
              {cleanPct}%
            </span>
          )}
          <button
            className="supp-delete"
            onClick={() => onArchive(habit.id)}
            title={habit.active ? t('Архивировать привычку') : t('Восстановить привычку')}
          >
            <Icon
              name="archive"
              size={14}
              title={habit.active ? t('Архивировать привычку') : t('Восстановить привычку')}
            />
          </button>
        </div>
      </div>

      <div className="supp-grid">
        {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => (
          <div key={d} className="supp-dow">{t(d)}</div>
        ))}
        {Array.from({ length: grid.leadingBlanks }, (_, i) => (
          <div key={`blank${i}`} className="supp-cell empty" />
        ))}
        {grid.days.map(date => {
          const status = statusOf(date)
          const clean = status === 'clean'
          const locked = status === 'future' || status === 'outside'
          // The button is the grid item itself: .supp-cell carries aspect-ratio
          // and only sizes correctly as a direct child of .supp-grid. Wrapping
          // it collapses every cell to its text.
          return (
            <button
              key={date}
              type="button"
              data-testid={`habit-day-${date}`}
              data-status={status}
              className={`supp-cell${clean ? ' taken' : ''}${date === today ? ' today' : ''}${status === 'future' ? ' future' : ''}${status === 'outside' ? ' habit-outside' : ''}`}
              title={date}
              disabled={locked}
              onClick={locked ? undefined : () => onToggleBreak(habit.id, date, clean)}
            >
              <span className="supp-day-num">{Number(date.slice(8, 10))}</span>
              {clean && (
                <svg className="supp-check" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          )
        })}
      </div>

      <div className="habit-card-footer">
        <span>{t('Срывов за 30 дней')}: {stats.breaks30}</span>
        <span>{t('Чистых дней')}: {stats.cleanDays} / {stats.windowDays}</span>
      </div>
    </div>
  )
}
