import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderWithProviders, screen, fireEvent, waitFor, cleanup } from '../../test/utils'

const api = vi.hoisted(() => ({
  getOpenHealthAlerts: vi.fn(),
  acknowledgeHealthAlert: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../lib/api/dashboard', () => api)

import HealthAlertBanner from './HealthAlertBanner'

// Pin the UI language: detectLang falls back to navigator.language otherwise.
beforeEach(() => localStorage.setItem('lang', 'en'))
afterEach(() => { cleanup(); vi.clearAllMocks(); localStorage.clear() })

describe('HealthAlertBanner', () => {
  it('renders the latest anomaly alert with HTML stripped and acks it', async () => {
    api.getOpenHealthAlerts.mockResolvedValue([
      { id: 'a1', level: 'red', message: '<b>Pulse</b> is up', created_at: '2026-07-17T06:00:00Z' },
    ])
    renderWithProviders(<HealthAlertBanner userId="u1" demo={false} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Pulse is up')
    expect(api.getOpenHealthAlerts).toHaveBeenCalledWith('u1', { sinceHours: 48, limit: 1, type: 'anomaly' })

    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(api.acknowledgeHealthAlert).toHaveBeenCalledWith('a1'))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('renders nothing when there are no alerts', async () => {
    api.getOpenHealthAlerts.mockResolvedValue([])
    const { container } = renderWithProviders(<HealthAlertBanner userId="u1" demo={false} />)
    await waitFor(() => expect(api.getOpenHealthAlerts).toHaveBeenCalled())
    expect(container.firstChild).toBeNull()
  })
})
