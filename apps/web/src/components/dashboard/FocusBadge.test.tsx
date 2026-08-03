import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { User } from '@supabase/supabase-js'
import { renderWithProviders, screen, fireEvent, waitFor, cleanup } from '../../test/utils'
import { FOCUS_HIDDEN_KEY, nextMorning } from '../../lib/focusVisibility'

const coach = vi.hoisted(() => ({
  loadFocus: vi.fn(),
  loadCheckins: vi.fn().mockResolvedValue([]),
  loadFocusInputs: vi.fn().mockResolvedValue({ intake: [], wellbeingByDate: {} }),
  checkInToday: vi.fn(),
  removeCheckinToday: vi.fn(),
  inferFocusCheck: vi.fn().mockReturnValue(null),
}))
vi.mock('../../lib/coach', () => coach)
vi.mock('../../lib/demo', () => ({ isDemoActive: () => false }))

import { FocusBadge } from './FocusBadge'
import { CoachFocusCard } from './CoachFocusCard'

const user = { id: 'u1' } as User
const focus = { text: 'Sleep seven hours', set_at: '2026-08-01T00:00:00Z', check: null }

beforeEach(() => {
  localStorage.setItem('lang', 'en')
  coach.loadFocus.mockResolvedValue(focus)
  coach.loadCheckins.mockResolvedValue(['2026-08-01', '2026-08-02'])
})
afterEach(() => { cleanup(); vi.clearAllMocks(); localStorage.clear() })

const hideUntilMorning = () =>
  localStorage.setItem(FOCUS_HIDDEN_KEY, nextMorning(new Date()).toISOString())

describe('FocusBadge', () => {
  it('stays out of the topbar while the card is visible', async () => {
    renderWithProviders(<FocusBadge user={user} daily={[]} />)
    await waitFor(() => expect(coach.loadFocus).not.toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /Weekly focus/ })).toBeNull()
  })

  it('appears with the progress once the card is hidden', async () => {
    hideUntilMorning()
    renderWithProviders(<FocusBadge user={user} daily={[]} />)
    const btn = await screen.findByRole('button', { name: /Weekly focus/ })
    expect(btn.textContent).toContain('2/7')
  })

  it('restores the card when clicked', async () => {
    hideUntilMorning()
    renderWithProviders(<FocusBadge user={user} daily={[]} />)
    fireEvent.click(await screen.findByRole('button', { name: /Weekly focus/ }))
    await waitFor(() => expect(localStorage.getItem(FOCUS_HIDDEN_KEY)).toBeNull())
  })
})

describe('CoachFocusCard', () => {
  it('hides itself and writes the flag when the hide button is pressed', async () => {
    renderWithProviders(<CoachFocusCard user={user} daily={[]} />)
    expect(await screen.findByText('Sleep seven hours')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Hide until morning/ }))

    await waitFor(() => expect(screen.queryByText('Sleep seven hours')).toBeNull())
    expect(localStorage.getItem(FOCUS_HIDDEN_KEY)).toBeTruthy()
  })

  // Card and badge are mutually exclusive, so the hidden one must not fetch —
  // otherwise putting the card away doubles the requests instead of moving them.
  it('neither renders nor loads while the flag is set', async () => {
    hideUntilMorning()
    renderWithProviders(<CoachFocusCard user={user} daily={[]} />)
    await new Promise(r => setTimeout(r, 50))
    expect(screen.queryByText('Sleep seven hours')).toBeNull()
    expect(coach.loadFocus).not.toHaveBeenCalled()
  })
})
