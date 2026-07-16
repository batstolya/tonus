import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { User } from '@supabase/supabase-js'
import { renderWithProviders, screen, cleanup } from '../../../test/utils'

const api = vi.hoisted(() => ({ getCalSyncStatus: vi.fn() }))
vi.mock('../../../lib/api/settings', () => api)
vi.mock('../../../lib/edgeFunctions', () => ({ callFunction: vi.fn().mockResolvedValue({}) }))

import { CalSyncSection } from './CalSyncSection'

const user = { id: 'u1' } as User
const renderSection = () => renderWithProviders(
  <CalSyncSection archived={false} onArchive={() => {}} user={user} />,
)

// Pin the UI language: detectLang falls back to navigator.language otherwise.
beforeEach(() => localStorage.setItem('lang', 'en'))
afterEach(() => { cleanup(); vi.clearAllMocks(); localStorage.clear() })

describe('CalSyncSection', () => {
  it('shows the connected account in compact view', async () => {
    api.getCalSyncStatus.mockResolvedValue({
      cal_email: 'gleb@cal.com', last_sync_at: '2026-07-16T10:00:00Z', last_status: 'ok', event_count: 12, enabled: true,
    })
    renderSection()
    expect(await screen.findByText(/gleb@cal\.com/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Change account/ })).toBeInTheDocument()
    // login form is hidden in compact view
    expect(screen.queryByPlaceholderText('email@cal.com')).toBeNull()
  })

  it('shows the login form when nothing is connected', async () => {
    api.getCalSyncStatus.mockResolvedValue(null)
    renderSection()
    expect(await screen.findByPlaceholderText('email@cal.com')).toBeInTheDocument()
  })
})
