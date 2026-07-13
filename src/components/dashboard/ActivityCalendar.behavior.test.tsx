import { describe, it, expect, vi } from 'vitest'
import { renderWithProviders, fireEvent } from '../../test/utils'
import { ActivityCalendar } from './ActivityCalendar'

describe('ActivityCalendar', () => {
  it('renders the month label and the weekday header row', () => {
    const { container } = renderWithProviders(
      <ActivityCalendar daily={[]} year={2024} month={6} minYm="2024-01" onNavigate={() => {}} />,
    )
    expect(container.querySelector('.activity-cal')).not.toBeNull()
    expect(container.querySelector('.activity-cal-month')!.textContent).toContain('2024')
    // one spacer + 7 weekday labels
    expect(container.querySelectorAll('.activity-cal-dow')).toHaveLength(8)
  })

  it('calls onNavigate with the next month when › is pressed', () => {
    const onNavigate = vi.fn()
    const { container } = renderWithProviders(
      <ActivityCalendar daily={[]} year={2024} month={6} minYm="2024-01" onNavigate={onNavigate} />,
    )
    const arrows = container.querySelectorAll('.activity-cal-arrow')
    fireEvent.click(arrows[1]) // next
    expect(onNavigate).toHaveBeenCalledWith(2024, 7)
  })

  it('disables the previous arrow at the earliest available month', () => {
    const { container } = renderWithProviders(
      <ActivityCalendar daily={[]} year={2024} month={1} minYm="2024-01" onNavigate={() => {}} />,
    )
    const prev = container.querySelectorAll('.activity-cal-arrow')[0] as HTMLButtonElement
    expect(prev.disabled).toBe(true)
  })
})
