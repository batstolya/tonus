import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { DailyMetrics } from '../../types'
import { renderWithProviders, screen, fireEvent, waitFor, cleanup } from '../../test/utils'

const api = vi.hoisted(() => ({
  getOpenHealthAlerts: vi.fn(),
  acknowledgeHealthAlert: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../lib/api/dashboard', () => api)
vi.mock('../../lib/notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/notifications')>()),
  buildBellItems: () => [],
}))

import { NotificationBell } from './NotificationBell'

const daily = [{ date: '2026-07-17' } as DailyMetrics]

// Pin the UI language: detectLang falls back to navigator.language otherwise.
beforeEach(() => localStorage.setItem('lang', 'en'))
afterEach(() => { cleanup(); vi.clearAllMocks(); localStorage.clear() })

describe('NotificationBell', () => {
  it('shows the alert count badge and lists alerts from the API', async () => {
    api.getOpenHealthAlerts.mockResolvedValue([
      { id: 'a1', level: 'yellow', message: '<i>HRV</i> low', created_at: '2026-07-17T06:00:00Z' },
    ])
    renderWithProviders(<NotificationBell daily={daily} userId="u1" demo={false} />)
    expect(await screen.findByText('1')).toBeInTheDocument()
    expect(api.getOpenHealthAlerts).toHaveBeenCalledWith('u1', { sinceHours: 14 * 24, limit: 10 })

    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }))
    expect(await screen.findByText('HRV low')).toBeInTheDocument()
  })

  it('acks an alert through the API module', async () => {
    api.getOpenHealthAlerts.mockResolvedValue([
      { id: 'a1', level: 'red', message: 'Alert', created_at: '2026-07-17T06:00:00Z' },
    ])
    renderWithProviders(<NotificationBell daily={daily} userId="u1" demo={false} />)
    fireEvent.click(await screen.findByRole('button', { name: /Notifications/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Got it/ }))
    await waitFor(() => expect(api.acknowledgeHealthAlert).toHaveBeenCalledWith('a1'))
  })

  it('localizes a guard alert and hides the advice behind an expander', async () => {
    api.getOpenHealthAlerts.mockResolvedValue([{
      id: 'a1', level: 'red',
      message: '🔴 <b>Организм с чем-то борется</b>\n\n↓ HRV: 39 мс при твоей норме 52 мс (1.8σ)\n\nСовет: день без нагрузок, больше воды и сна. Если появятся симптомы — не геройствуй.\n<i>Это наблюдение по данным часов, не диагноз.</i>',
      created_at: '2026-07-17T06:00:00Z',
    }])
    renderWithProviders(<NotificationBell daily={daily} userId="u1" demo={false} />)
    fireEvent.click(await screen.findByRole('button', { name: /Notifications/ }))

    // Заголовок и факты — на языке UI (en в тесте), совет свёрнут.
    expect(await screen.findByText('Your body is fighting something')).toBeInTheDocument()
    expect(screen.getByText(/↓ HRV: 39 ms vs your baseline 52 ms \(1\.8σ\)/)).toBeInTheDocument()
    expect(screen.queryByText(/Advice:/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    expect(screen.getByText(/Advice: a day off training/)).toBeInTheDocument()
    expect(screen.getByText(/not a diagnosis/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Less' }))
    expect(screen.queryByText(/Advice:/)).not.toBeInTheDocument()
  })
})
