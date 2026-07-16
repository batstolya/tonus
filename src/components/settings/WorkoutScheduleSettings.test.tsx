import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { User } from '@supabase/supabase-js'
import { renderWithProviders, screen, fireEvent, waitFor, cleanup } from '../../test/utils'

const api = vi.hoisted(() => ({
  getWorkoutSchedule: vi.fn(),
  saveWorkoutSchedule: vi.fn().mockResolvedValue(true),
}))
vi.mock('../../lib/api/settings', () => api)
vi.mock('../../lib/demo', () => ({ isDemoActive: () => false }))

import { WorkoutScheduleSettings } from './WorkoutScheduleSettings'

const user = { id: 'u1' } as User

// Pin the UI language: detectLang falls back to navigator.language otherwise.
beforeEach(() => localStorage.setItem('lang', 'en'))
afterEach(() => { cleanup(); vi.clearAllMocks(); localStorage.clear() })

describe('WorkoutScheduleSettings', () => {
  it('loads the schedule and marks configured days', async () => {
    api.getWorkoutSchedule.mockResolvedValue({ day_times: { '1': { time: '19:00' } }, notify_hours_before: 4, enabled: true })
    renderWithProviders(<WorkoutScheduleSettings user={user} />)
    const mon = await screen.findByRole('button', { name: 'Mon' })
    await waitFor(() => expect(mon.className).toMatch(/\bon\b/))
  })

  it('toggling a day saves through the API module', async () => {
    api.getWorkoutSchedule.mockResolvedValue({ day_times: {}, notify_hours_before: 4, enabled: true })
    renderWithProviders(<WorkoutScheduleSettings user={user} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Tue' }))
    await waitFor(() => expect(api.saveWorkoutSchedule).toHaveBeenCalledWith('u1', expect.objectContaining({
      day_times: { '2': { time: '19:00' } },
    })))
  })
})
