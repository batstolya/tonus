import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { User } from '@supabase/supabase-js'
import { renderWithProviders, screen, fireEvent, waitFor, cleanup } from '../../test/utils'

const api = vi.hoisted(() => ({
  createIntakeEvent: vi.fn(),
  deleteIntakeEvent: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../lib/api/intake', () => api)
vi.mock('../../lib/demo', () => ({ isDemoActive: () => false }))

import { QuickLog } from './QuickLog'

const user = { id: 'u1' } as User

const event = {
  id: 'e1', ts: new Date().toISOString(), type: 'coffee', amount: 200, unit: 'мл', note: null,
}

// Pin the UI language: detectLang falls back to navigator.language otherwise.
beforeEach(() => localStorage.setItem('lang', 'en'))
afterEach(() => { cleanup(); vi.clearAllMocks(); localStorage.clear() })

describe('QuickLog', () => {
  it('adds an event through the API module and prepends it to the list', async () => {
    api.createIntakeEvent.mockResolvedValue(event)
    const onEventsChange = vi.fn()
    renderWithProviders(<QuickLog user={user} events={[]} onEventsChange={onEventsChange} />)

    fireEvent.click(screen.getByRole('button', { name: /\+ Add/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Log it/ }))

    await waitFor(() => expect(api.createIntakeEvent).toHaveBeenCalledWith('u1', expect.objectContaining({
      type: 'coffee', amount: 200, unit: 'мл',
    })))
    await waitFor(() => expect(onEventsChange).toHaveBeenCalledWith([event]))
  })

  it('shows only today and pages back a day at a time', async () => {
    const yesterday = new Date(Date.now() - 864e5)
    yesterday.setHours(12, 0, 0, 0)
    const events = [
      { ...event, id: 'today', note: 'today note' },
      { ...event, id: 'older', ts: yesterday.toISOString(), note: 'older note' },
    ]
    renderWithProviders(<QuickLog user={user} events={events} onEventsChange={vi.fn()} />)

    expect(screen.getByText(/today note/)).toBeTruthy()
    expect(screen.queryByText(/older note/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /previous day/i }))
    expect(screen.getByText(/older note/)).toBeTruthy()
    expect(screen.queryByText(/today note/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /next day/i }))
    expect(screen.getByText(/today note/)).toBeTruthy()
  })

  it('stops at the ends of the range instead of paging into nothing', () => {
    renderWithProviders(<QuickLog user={user} events={[event]} onEventsChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: /previous day/i }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: /next day/i }).hasAttribute('disabled')).toBe(true)
  })

  it('returns to today after logging something from an older day', async () => {
    const yesterday = new Date(Date.now() - 864e5)
    yesterday.setHours(12, 0, 0, 0)
    const older = { ...event, id: 'older', ts: yesterday.toISOString(), note: 'older note' }
    const created = { ...event, id: 'new', note: 'fresh note' }
    api.createIntakeEvent.mockResolvedValue(created)
    const { rerender } = renderWithProviders(
      <QuickLog user={user} events={[older]} onEventsChange={vi.fn()} />,
    )

    fireEvent.click(screen.getByRole('button', { name: /previous day/i }))
    expect(screen.getByText(/older note/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /\+ Add/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Log it/ }))
    await waitFor(() => expect(api.createIntakeEvent).toHaveBeenCalled())

    rerender(<QuickLog user={user} events={[created, older]} onEventsChange={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(/fresh note/)).toBeTruthy())
  })

  // The icon rollout's recurring regression was visual, not functional: a
  // label that still rendered fine while its icon had silently become the
  // same shape as a neighbour's, or vanished into an empty span. Reviews
  // caught those by eye every time because no test looked at the drawing.
  // These two do.
  it('gives every event type an icon and a translated word', async () => {
    renderWithProviders(<QuickLog user={user} events={[]} onEventsChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /\+ Add/ }))

    const words = ['Coffee', 'Alcohol', 'Meal', 'Water', 'Medication',
      'Workout', 'Illness', 'Stress', 'Travel', 'Other']
    for (const word of words) {
      const btn = await screen.findByRole('button', { name: new RegExp(`^${word}$`) })
      expect(btn.querySelector('svg'), `${word} button should render an icon`).not.toBeNull()
    }
  })

  it('draws a distinct icon per event type', async () => {
    renderWithProviders(<QuickLog user={user} events={[]} onEventsChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /\+ Add/ }))

    const grid = document.querySelector('.type-grid')!
    const buttons = [...grid.querySelectorAll('button')]
    expect(buttons).toHaveLength(10)

    // Compare the actual drawn geometry, not the component identity: two
    // registry names pointing at one Phosphor component would render the same
    // paths, which is exactly the collision that kept slipping past review.
    const shapes = buttons.map(b => [...b.querySelectorAll('svg path')].map(p => p.getAttribute('d')).join('|'))
    expect(shapes.every(s => s.length > 0)).toBe(true)
    expect(new Set(shapes).size, 'every event type should draw its own shape').toBe(10)
  })

  it('deletes an event through the API module', async () => {
    const onEventsChange = vi.fn()
    renderWithProviders(<QuickLog user={user} events={[event]} onEventsChange={onEventsChange} />)

    fireEvent.click(screen.getByRole('button', { name: '×' }))
    await waitFor(() => expect(api.deleteIntakeEvent).toHaveBeenCalledWith('e1'))
    expect(onEventsChange).toHaveBeenCalledWith([])
  })
})
