import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderWithProviders, fireEvent, waitFor, cleanup } from '../../test/utils'

// Opening the panel mounts WorkoutPlanCard, whose effect fetches the workout
// schedule. Unmocked it hits the dummy Supabase URL and resolves after the
// test run tears jsdom down (flaky "window is not defined" setState).
const api = vi.hoisted(() => ({ getWorkoutSchedule: vi.fn().mockResolvedValue(null) }))
vi.mock('../../lib/api/settings', () => api)
vi.mock('../../lib/demo', () => ({ isDemoActive: () => false }))

import { StreakMenu } from './StreakMenu'

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('StreakMenu', () => {
  it('renders the trigger collapsed with a zero streak for empty history', () => {
    const { container } = renderWithProviders(<StreakMenu daily={[]} />)
    const trigger = container.querySelector('.streak-menu-trigger')
    expect(trigger).not.toBeNull()
    expect(trigger!.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector('#streak-menu-panel')).toBeNull()
    expect(container.querySelector('.streak-menu-count')!.textContent).toBe('0')
  })

  it('opens the streak panel on click', async () => {
    const { container } = renderWithProviders(<StreakMenu daily={[]} />)
    fireEvent.click(container.querySelector('.streak-menu-trigger')!)
    expect(container.querySelector('.streak-menu-trigger')!.getAttribute('aria-expanded')).toBe('true')
    expect(container.querySelector('#streak-menu-panel')).not.toBeNull()
    // Let the schedule fetch settle inside the test so no state update leaks
    // past teardown.
    await waitFor(() => expect(api.getWorkoutSchedule).toHaveBeenCalled())
  })
})
