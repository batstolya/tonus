import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { DailyMetrics } from '../../types'
import { renderWithProviders, fireEvent, waitFor, cleanup } from '../../test/utils'

// Opening the panel mounts WorkoutPlanCard, whose effect fetches the workout
// schedule. Unmocked it hits the dummy Supabase URL and resolves after the
// test run tears jsdom down (flaky "window is not defined" setState).
const api = vi.hoisted(() => ({ getWorkoutSchedule: vi.fn().mockResolvedValue(null) }))
vi.mock('../../lib/api/settings', () => api)
vi.mock('../../lib/demo', () => ({ isDemoActive: () => false }))

import { StreakMenu } from './StreakMenu'

// StreakMenu reads today from `new Date()` directly (no injected clock), so a
// fixture for "today" has to be dated with the same local-time formatting the
// component uses rather than a fixed string.
function todayYmd(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

// Pin the UI language: detectLang falls back to navigator.language otherwise.
beforeEach(() => localStorage.setItem('lang', 'en'))
afterEach(() => { cleanup(); vi.clearAllMocks(); localStorage.clear() })

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

  // The today-progress line is a JSX fragment (icons inlined into a sentence,
  // not a template string). Both other tests here render with daily=[], so
  // todayHasData is always false and this line never mounts. Below the
  // threshold on both fronts keeps todayActive false and todayHasData true.
  it('shows the today-progress line with the steps/exercise split before the day closes', async () => {
    const daily: DailyMetrics[] = [{ date: todayYmd(), steps: 3000, exerciseMinutes: 10 } as DailyMetrics]
    const { container } = renderWithProviders(<StreakMenu daily={daily} />)
    fireEvent.click(container.querySelector('.streak-menu-trigger')!)
    await waitFor(() => expect(api.getWorkoutSchedule).toHaveBeenCalled())

    const line = container.querySelector('.streak-menu-today-text')
    expect(line).not.toBeNull()
    const text = line!.textContent ?? ''
    expect(text.indexOf('3,000')).toBeGreaterThanOrEqual(0)
    expect(text.indexOf('3,000')).toBeLessThan(text.indexOf('·'))
    expect(text.indexOf('·')).toBeLessThan(text.indexOf('10'))
    expect(text).toMatch(/10 \/ 30 min/)
  })
})
