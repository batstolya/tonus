import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { User } from '@supabase/supabase-js'
import { renderWithProviders, screen, fireEvent, waitFor, cleanup } from '../../../test/utils'

const api = vi.hoisted(() => ({
  getActiveTelegramLink: vi.fn(),
  createTelegramLinkToken: vi.fn(),
  pauseTelegramLink: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../../lib/api/settings', () => api)
vi.mock('../../../lib/dailyNote', () => ({
  loadDailyNoteSettings: vi.fn().mockResolvedValue({ enabled: false, time: '21:00' }),
  saveDailyNoteSettings: vi.fn().mockResolvedValue(true),
}))
vi.mock('../../../lib/reportSettings', () => ({
  loadReportSettings: vi.fn().mockResolvedValue(null),
  saveReportSettings: vi.fn().mockResolvedValue(true),
}))

import { TelegramSection } from './TelegramSection'

const user = { id: 'u1' } as User
const renderSection = () => renderWithProviders(
  <TelegramSection user={user} archivedTelegram={false} archivedReports={false} onArchive={() => {}} />,
)

// Pin the UI language: detectLang falls back to navigator.language otherwise.
beforeEach(() => localStorage.setItem('lang', 'en'))
afterEach(() => { cleanup(); vi.clearAllMocks(); localStorage.clear() })

describe('TelegramSection', () => {
  it('shows connect button when no active link', async () => {
    api.getActiveTelegramLink.mockResolvedValue(null)
    renderSection()
    expect(await screen.findByRole('button', { name: /Connect Telegram/ })).toBeInTheDocument()
  })

  it('shows username and disconnects via the API module', async () => {
    api.getActiveTelegramLink.mockResolvedValue({ telegram_username: 'gleb' })
    renderSection()
    expect(await screen.findByText(/@gleb/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Disconnect/ }))
    await waitFor(() => expect(api.pauseTelegramLink).toHaveBeenCalledWith('u1'))
    expect(await screen.findByRole('button', { name: /Connect Telegram/ })).toBeInTheDocument()
  })
})
