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

  it('deletes an event through the API module', async () => {
    const onEventsChange = vi.fn()
    renderWithProviders(<QuickLog user={user} events={[event]} onEventsChange={onEventsChange} />)

    fireEvent.click(screen.getByRole('button', { name: '×' }))
    await waitFor(() => expect(api.deleteIntakeEvent).toHaveBeenCalledWith('e1'))
    expect(onEventsChange).toHaveBeenCalledWith([])
  })
})
