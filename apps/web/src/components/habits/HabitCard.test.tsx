import { describe, it, expect, vi } from 'vitest'
import { renderWithProviders, screen, fireEvent } from '../../test/utils'
import { HabitCard } from './HabitCard'
import type { Habit, HabitBreak } from '../../lib/habits'

const habit: Habit = {
  id: 'h1', user_id: 'u1', name: 'Без сладкого', note: null,
  start_date: '2026-08-10', active: true, sort_order: 0, created_at: '2026-08-10T00:00:00Z',
}
const noop = () => {}

// The card mirrors the supplement calendar, inverted: a day is checked unless a
// break says otherwise, and clicking a checked day unchecks it.
const render = (props: Partial<Parameters<typeof HabitCard>[0]> = {}) =>
  renderWithProviders(
    <HabitCard
      habit={habit}
      breaks={[]}
      today="2026-08-20"
      year={2026}
      month={7}
      onToggleBreak={noop}
      onArchive={noop}
      {...props}
    />,
  )

describe('HabitCard', () => {
  it('checks every day from start_date through today by default', () => {
    render()
    expect(screen.getByTestId('habit-day-2026-08-10')).toHaveAttribute('data-status', 'clean')
    expect(screen.getByTestId('habit-day-2026-08-20')).toHaveAttribute('data-status', 'clean')
  })

  it('leaves a recorded slip unchecked', () => {
    const breaks: HabitBreak[] = [{ id: 'b1', habit_id: 'h1', date: '2026-08-15', note: null }]
    render({ breaks })
    expect(screen.getByTestId('habit-day-2026-08-15')).toHaveAttribute('data-status', 'broken')
  })

  it('unchecks a clean day when it is clicked', () => {
    const onToggleBreak = vi.fn()
    render({ onToggleBreak })
    fireEvent.click(screen.getByTestId('habit-day-2026-08-14'))
    expect(onToggleBreak).toHaveBeenCalledWith('h1', '2026-08-14', true)
  })

  it('re-checks a day that was marked as a slip', () => {
    const onToggleBreak = vi.fn()
    const breaks: HabitBreak[] = [{ id: 'b1', habit_id: 'h1', date: '2026-08-15', note: null }]
    render({ onToggleBreak, breaks })
    fireEvent.click(screen.getByTestId('habit-day-2026-08-15'))
    expect(onToggleBreak).toHaveBeenCalledWith('h1', '2026-08-15', false)
  })

  it('renders days before start_date as outside the habit, not as clean', () => {
    render()
    const before = screen.getByTestId('habit-day-2026-08-09')
    expect(before).toHaveAttribute('data-status', 'outside')
    expect(before).toBeDisabled()
  })

  it('disables future days', () => {
    render()
    expect(screen.getByTestId('habit-day-2026-08-21')).toBeDisabled()
  })

  it('shows the whole month, including days outside the habit', () => {
    const { container } = render()
    expect(container.querySelectorAll('[data-testid^="habit-day-"]')).toHaveLength(31)
  })

  it('puts each day cell directly in the grid, so the CSS can size it', () => {
    // .supp-cell carries aspect-ratio and only sizes as a direct child of
    // .supp-grid; a wrapper element collapses every cell to its text.
    const { container } = render()
    const cell = container.querySelector('[data-testid="habit-day-2026-08-14"]')!
    expect(cell.parentElement).toHaveClass('supp-grid')
    expect(cell).toHaveClass('supp-cell')
  })

  it('counts the streak of clean days up to today', () => {
    render()
    expect(screen.getByTestId('habit-streak')).toHaveTextContent('11')
  })
})
