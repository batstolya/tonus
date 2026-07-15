import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderWithProviders, waitFor } from '../../test/utils'
import { enableDemo, disableDemo } from '../../lib/demo'
import { supabase } from '../../lib/supabase'
import { WorkoutPlanCard } from './WorkoutPlanCard'

beforeEach(() => disableDemo()) // start each test with demo mode off
afterEach(() => {
  disableDemo()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('WorkoutPlanCard', () => {
  it('renders the demo schedule with next-workout and attendance cards', async () => {
    enableDemo() // demo mode fills the schedule from a fixture instead of Supabase
    const { container } = renderWithProviders(<WorkoutPlanCard daily={[]} />)
    await waitFor(() => expect(container.querySelector('.workout-plan-card')).not.toBeNull())
    expect(container.querySelectorAll('.streak-card')).toHaveLength(2)
  })

  it('ignores a schedule response that arrives after unmount', () => {
    let resolveQuery: ((value: { data: { day_times: object; notify_hours_before: number; enabled: boolean } }) => void) | undefined
    const thenable = {
      then(callback: typeof resolveQuery) {
        resolveQuery = callback
        return Promise.resolve()
      },
    }
    vi.spyOn(supabase, 'from').mockReturnValue({
      select: () => ({ maybeSingle: () => thenable }),
    } as never)

    const { unmount } = renderWithProviders(<WorkoutPlanCard daily={[]} />)
    unmount()
    vi.stubGlobal('window', undefined)

    try {
      expect(() => resolveQuery!({
        data: { day_times: { 1: '18:00' }, notify_hours_before: 2, enabled: true },
      })).not.toThrow()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
