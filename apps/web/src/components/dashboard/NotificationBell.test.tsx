import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { DailyMetrics } from '../../types'
import { renderWithProviders, screen, fireEvent, waitFor, cleanup } from '../../test/utils'

const api = vi.hoisted(() => ({
  getOpenHealthAlerts: vi.fn(),
  acknowledgeHealthAlert: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../lib/api/dashboard', () => api)
// Default stays [] for the existing tests below; the streak-risk fragment
// test overrides it once via mockReturnValueOnce to render a real item
// without reverse-engineering buildBellItems' date math.
vi.mock('../../lib/notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/notifications')>()),
  buildBellItems: vi.fn(() => []),
}))

import { NotificationBell } from './NotificationBell'
import { buildBellItems } from '../../lib/notifications'

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

  // derivedText's streak-risk body is a JSX fragment (icons inlined into a
  // sentence, not a template string) — nothing else renders it, since every
  // other test in this file mocks buildBellItems back to []. This exercises
  // that fragment for real, asserting on text content so it survives an icon
  // swap but still catches a dropped separator or trailing period.
  it('renders the streak-risk body with the steps/exercise split and the follow-on sentence', async () => {
    api.getOpenHealthAlerts.mockResolvedValue([])
    vi.mocked(buildBellItems).mockReturnValueOnce([
      { kind: 'streak-risk', id: 'streak-risk:test', streak: 5, steps: 4200, exercise: 12, freezes: 1 },
    ])
    renderWithProviders(<NotificationBell daily={daily} userId="u1" demo={false} />)
    fireEvent.click(await screen.findByRole('button', { name: /Notifications/ }))

    const body = await screen.findByText(/4,200/)
    const text = body.textContent ?? ''
    expect(text.indexOf('4,200')).toBeLessThan(text.indexOf('·'))
    expect(text.indexOf('·')).toBeLessThan(text.indexOf('12'))
    expect(text).toMatch(/30 min\.\s*Otherwise a freeze burns \(1 left\)/)
  })
})

// The data-gaps item used to be its own topbar icon with its own popover.
// Demo fixtures have no gaps, so this state is unreachable in the browser.
describe('NotificationBell: data gaps', () => {
  it('lists the metrics with gaps and how many days each is missing', async () => {
    api.getOpenHealthAlerts.mockResolvedValue([])
    vi.mocked(buildBellItems).mockReturnValueOnce([{
      kind: 'data-gaps',
      id: 'data-gaps:2026-07-17',
      gaps: [
        { metric: 'sleepHours', label: 'Сон', missingDays: 5 },
        { metric: 'oxygenSaturation', label: 'SpO₂', missingDays: 3 },
      ],
    }])
    renderWithProviders(<NotificationBell daily={daily} userId="u1" demo={false} />)
    fireEvent.click(screen.getByRole('button', { name: /notification/i }))

    expect(await screen.findByText(/Data gaps/i)).toBeTruthy()
    const panel = document.querySelector('.bell-panel')!
    expect(panel.textContent).toContain('5')
    expect(panel.textContent).toContain('3')
  })
})
