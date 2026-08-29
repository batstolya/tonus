import { describe, it, expect, vi } from 'vitest'
import { renderWithProviders, screen, fireEvent } from '../../test/utils'
import { HabitCard } from './HabitCard'
import type { Habit, HabitBreak } from '../../lib/habits'

const habit: Habit = {
  id: 'h1', user_id: 'u1', name: 'Без сладкого', note: null,
  start_date: '2026-08-20', active: true, sort_order: 0, created_at: '2026-08-20T00:00:00Z',
}
const noop = () => {}

describe('HabitCard', () => {
  it('shows the current streak of closed clean days', () => {
    renderWithProviders(
      <HabitCard habit={habit} breaks={[]} today="2026-08-28" onToggleBreak={noop} onArchive={noop} />,
    )
    expect(screen.getByTestId('habit-streak')).toHaveTextContent('8')
  })

  it('renders one cell per day since start_date, today pending', () => {
    renderWithProviders(
      <HabitCard habit={habit} breaks={[]} today="2026-08-28" onToggleBreak={noop} onArchive={noop} />,
    )
    expect(screen.getAllByTestId('habit-day')).toHaveLength(9)
    expect(screen.getByTestId('habit-day-2026-08-28')).toHaveAttribute('data-status', 'pending')
  })

  it('marks today broken when the break button is used', () => {
    const onToggleBreak = vi.fn()
    renderWithProviders(
      <HabitCard habit={habit} breaks={[]} today="2026-08-28" onToggleBreak={onToggleBreak} onArchive={noop} />,
    )
    fireEvent.click(screen.getByTestId('habit-break-today'))
    expect(onToggleBreak).toHaveBeenCalledWith('h1', '2026-08-28', true)
  })

  it('marks yesterday broken through its own control', () => {
    const onToggleBreak = vi.fn()
    renderWithProviders(
      <HabitCard habit={habit} breaks={[]} today="2026-08-28" onToggleBreak={onToggleBreak} onArchive={noop} />,
    )
    fireEvent.click(screen.getByTestId('habit-break-yesterday'))
    expect(onToggleBreak).toHaveBeenCalledWith('h1', '2026-08-27', true)
  })

  it('offers to clear a day that is already marked', () => {
    const onToggleBreak = vi.fn()
    const breaks: HabitBreak[] = [{ id: 'b1', habit_id: 'h1', date: '2026-08-28', note: null }]
    renderWithProviders(
      <HabitCard habit={habit} breaks={breaks} today="2026-08-28" onToggleBreak={onToggleBreak} onArchive={noop} />,
    )
    fireEvent.click(screen.getByTestId('habit-break-today'))
    expect(onToggleBreak).toHaveBeenCalledWith('h1', '2026-08-28', false)
  })

  it('hides the percentage until the window covers 30 days', () => {
    renderWithProviders(
      <HabitCard habit={habit} breaks={[]} today="2026-08-28" onToggleBreak={noop} onArchive={noop} />,
    )
    expect(screen.queryByTestId('habit-pct')).toBeNull()
  })

  it('disables the yesterday button when yesterday precedes start_date', () => {
    // start_date is today: yesterday never existed for this habit, so the
    // RPC would reject the break and the user would just see a failure banner.
    const freshHabit: Habit = { ...habit, start_date: '2026-08-28' }
    renderWithProviders(
      <HabitCard habit={freshHabit} breaks={[]} today="2026-08-28" onToggleBreak={noop} onArchive={noop} />,
    )
    expect(screen.getByTestId('habit-break-yesterday')).toBeDisabled()
  })

  it('keeps the yesterday button enabled once yesterday is on or after start_date', () => {
    renderWithProviders(
      <HabitCard habit={habit} breaks={[]} today="2026-08-28" onToggleBreak={noop} onArchive={noop} />,
    )
    expect(screen.getByTestId('habit-break-yesterday')).toBeEnabled()
  })

  it('labels the archive control as archiving for an active habit', () => {
    renderWithProviders(
      <HabitCard habit={habit} breaks={[]} today="2026-08-28" onToggleBreak={noop} onArchive={noop} />,
    )
    expect(screen.getByRole('button', { name: 'Archive habit' })).toBeInTheDocument()
  })

  it('labels the archive control as restoring for an archived habit', () => {
    renderWithProviders(
      <HabitCard habit={{ ...habit, active: false }} breaks={[]} today="2026-08-28" onToggleBreak={noop} onArchive={noop} />,
    )
    expect(screen.getByRole('button', { name: 'Restore habit' })).toBeInTheDocument()
  })
})
