import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderWithProviders, screen, fireEvent, waitFor, cleanup } from '../../test/utils'

const api = vi.hoisted(() => ({
  loadLogs: vi.fn(),
  addLog: vi.fn(),
  deleteLog: vi.fn().mockResolvedValue(undefined),
  uploadConcernPhoto: vi.fn(),
  getPhotoUrl: vi.fn().mockResolvedValue(''),
  updateConcern: vi.fn().mockResolvedValue(undefined),
  CATEGORIES: { gut: '🫀 ЖКТ' },
  STATUS_LABELS: {
    active: { label: 'Активна', color: 'red' },
    improving: { label: 'Улучшается', color: 'orange' },
    resolved: { label: 'Решена', color: 'green' },
  },
  formatLogTime: (at: string | null | undefined) => (at ? at.slice(0, 5) : ''),
  compareLogsAsc: () => 0,
  // The journal's own ordering is under test here, so the real comparator runs.
  compareLogsDesc: (a: { date: string; at_time?: string | null }, b: { date: string; at_time?: string | null }) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date)
    const at = a.at_time?.slice(0, 5) ?? ''
    const bt = b.at_time?.slice(0, 5) ?? ''
    if (!at && !bt) return 0
    if (!at) return 1
    if (!bt) return -1
    return bt.localeCompare(at)
  },
}))
vi.mock('../../lib/concerns', () => api)

import { ConcernDetail } from './ConcernsScreen'

const concern = {
  id: 'c1', user_id: 'u1', name: 'Стул', category: 'gut', status: 'active' as const,
  started_at: null, notes: null, is_private: false, created_at: '2026-08-01T00:00:00Z',
}

const log = (over: Record<string, unknown> = {}) => ({
  id: 'l1', concern_id: 'c1', date: '2026-08-16', at_time: '12:00:00',
  severity: 3, note: 'кашеобразный', photo_path: null, created_at: '2026-08-16T19:00:00Z',
  ...over,
})

const detail = () => (
  <ConcernDetail concern={concern} userId="u1" onBack={vi.fn()} onUpdate={vi.fn()} />
)

beforeEach(() => {
  localStorage.setItem('lang', 'en')
  api.loadLogs.mockResolvedValue([])
  api.addLog.mockResolvedValue(log())
})
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); localStorage.clear() })

describe('ConcernDetail', () => {
  it('prefills the date and time of a new observation with now', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 7, 16, 14, 5))
    renderWithProviders(detail())

    const date = await screen.findByTestId('log-date')
    expect((date as HTMLInputElement).value).toBe('2026-08-16')
    expect((screen.getByTestId('log-time') as HTMLInputElement).value).toBe('14:05')
  })

  it('saves the time the user corrected it to', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 7, 16, 19, 0))
    renderWithProviders(detail())

    fireEvent.change(await screen.findByTestId('log-time'), { target: { value: '12:00' } })
    fireEvent.click(screen.getByRole('button', { name: /Add/i }))

    await waitFor(() => expect(api.addLog).toHaveBeenCalledWith('u1', expect.objectContaining({
      date: '2026-08-16', at_time: '12:00',
    })))
  })

  it('shows the time of an observation in the journal', async () => {
    api.loadLogs.mockResolvedValue([log()])
    renderWithProviders(detail())

    expect(await screen.findByText('12:00')).toBeTruthy()
    expect(screen.queryByText('12:00:00')).toBeNull()
  })

  // Newest first, and an entry whose time is unknown does not get to pose as
  // the last thing that happened that day.
  it('lists a day newest first and keeps an untimed entry at the bottom of it', async () => {
    api.loadLogs.mockResolvedValue([
      log({ id: 'morning', at_time: '09:00', note: 'утром' }),
      log({ id: 'untimed', at_time: null, note: 'без времени' }),
      log({ id: 'noon', at_time: '13:00', note: 'в обед' }),
    ])
    renderWithProviders(detail())

    await screen.findByText('в обед')
    const notes = screen.getAllByText(/утром|в обед|без времени/).map(n => n.textContent)
    expect(notes).toEqual(['в обед', 'утром', 'без времени'])
  })

  it('shows the date alone for an observation without a time', async () => {
    api.loadLogs.mockResolvedValue([log({ at_time: null })])
    renderWithProviders(detail())

    expect(await screen.findByText('2026-08-16')).toBeTruthy()
    expect(screen.queryByTestId('log-item-time')).toBeNull()
  })
})
