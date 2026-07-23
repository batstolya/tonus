import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { DailyMetrics } from '../../types'
import { renderWithProviders, screen, waitFor, cleanup } from '../../test/utils'

const api = vi.hoisted(() => ({ getWorkoutSchedule: vi.fn() }))
vi.mock('../../lib/api/settings', () => api)
vi.mock('../../lib/demo', () => ({ isDemoActive: () => false }))

import { WorkoutPlanCard } from './WorkoutPlanCard'

// Pin the UI language: detectLang falls back to navigator.language otherwise.
beforeEach(() => localStorage.setItem('lang', 'en'))
afterEach(() => { cleanup(); vi.clearAllMocks(); localStorage.clear() })

describe('WorkoutPlanCard', () => {
  it('shows next workout and monthly attendance when a schedule exists', async () => {
    api.getWorkoutSchedule.mockResolvedValue({ day_times: { '1': { time: '19:00' } }, notify_hours_before: 4, enabled: true })
    renderWithProviders(<WorkoutPlanCard daily={[] as DailyMetrics[]} />)
    expect(await screen.findByText(/Next workout/)).toBeInTheDocument()
  })

  it('renders nothing when the schedule is disabled', async () => {
    api.getWorkoutSchedule.mockResolvedValue({ day_times: { '1': { time: '19:00' } }, notify_hours_before: 4, enabled: false })
    const { container } = renderWithProviders(<WorkoutPlanCard daily={[] as DailyMetrics[]} />)
    await waitFor(() => expect(api.getWorkoutSchedule).toHaveBeenCalled())
    expect(container.firstChild).toBeNull()
  })
})
