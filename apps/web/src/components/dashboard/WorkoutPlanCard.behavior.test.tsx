import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderWithProviders, waitFor } from '../../test/utils'
import { enableDemo, disableDemo } from '../../lib/demo'
import { WorkoutPlanCard } from './WorkoutPlanCard'

beforeEach(() => disableDemo()) // start each test with demo mode off
afterEach(() => disableDemo())

describe('WorkoutPlanCard', () => {
  it('renders the demo schedule with next-workout and attendance cards', async () => {
    enableDemo() // demo mode fills the schedule from a fixture instead of Supabase
    const { container } = renderWithProviders(<WorkoutPlanCard daily={[]} />)
    await waitFor(() => expect(container.querySelector('.workout-plan-card')).not.toBeNull())
    expect(container.querySelectorAll('.streak-card')).toHaveLength(2)
  })
})
