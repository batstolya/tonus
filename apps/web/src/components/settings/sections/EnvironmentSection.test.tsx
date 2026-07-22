import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { User } from '@supabase/supabase-js'
import { renderWithProviders, screen, cleanup } from '../../../test/utils'

const api = vi.hoisted(() => ({
  getProfileLocation: vi.fn(),
  saveProfileLocation: vi.fn().mockResolvedValue(null),
  updateLocationLabel: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../../lib/api/settings', () => api)
vi.mock('../../../lib/edgeFunctions', () => ({ callFunction: vi.fn().mockResolvedValue({}) }))

import { EnvironmentSection } from './EnvironmentSection'

const user = { id: 'u1' } as User
const renderSection = () => renderWithProviders(
  <EnvironmentSection archived={false} onArchive={() => {}} user={user} />,
)

// Pin the UI language: detectLang falls back to navigator.language otherwise.
beforeEach(() => localStorage.setItem('lang', 'en'))
afterEach(() => { cleanup(); vi.clearAllMocks(); localStorage.clear() })

describe('EnvironmentSection', () => {
  it('shows the saved location label', async () => {
    // null coords → the label-refresh geocoder path is skipped, no fetch needed
    api.getProfileLocation.mockResolvedValue({ location_label: 'Kyiv, Ukraine', latitude: null, longitude: null })
    renderSection()
    expect(await screen.findByText('Kyiv, Ukraine')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Update now/ })).toBeInTheDocument()
  })

  it('offers location pick when no profile location', async () => {
    api.getProfileLocation.mockResolvedValue(null)
    renderSection()
    expect(await screen.findByRole('button', { name: /Detect automatically/ })).toBeInTheDocument()
  })
})
