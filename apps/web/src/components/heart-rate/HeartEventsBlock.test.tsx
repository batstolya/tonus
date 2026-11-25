import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '../../test/utils'
import type { HeartEvent } from '../../lib/doctorReport/heartEvents'

vi.mock('../../lib/doctorReport/load', async importOriginal => {
  const actual = await importOriginal<typeof import('../../lib/doctorReport/load')>()
  return { ...actual, loadHeartEvents: vi.fn() }
})
const { loadHeartEvents } = await import('../../lib/doctorReport/load')
const { HeartEventsBlock } = await import('./HeartEventsBlock')

beforeEach(() => localStorage.setItem('lang', 'en'))
afterEach(() => { cleanup(); localStorage.clear() })

const low = (i: number): HeartEvent => ({
  kind: 'low_hr', start_ts: new Date(2026, 0, 1 + i, 3, 10).toISOString(), end_ts: null,
  threshold: 40, hr_min: 36, hr_max: 45, hr_avg: 40, classification: 'low_heart_rate_notification',
})

describe('HeartEventsBlock', () => {
  it('shows counts, the ECG classification and only 10 notifications until expanded', async () => {
    vi.mocked(loadHeartEvents).mockResolvedValue([
      ...Array.from({ length: 12 }, (_, i) => low(i)),
      { kind: 'ecg', start_ts: new Date(2026, 5, 15, 19, 59).toISOString(), end_ts: null, threshold: null, hr_min: null, hr_max: null, hr_avg: 100, classification: 'Sinus Rhythm' },
    ])
    const { container } = renderWithProviders(<HeartEventsBlock userId="u1" />)
    await waitFor(() => expect(screen.getByText('Heart events (Apple Watch)')).toBeTruthy())
    expect(loadHeartEvents).toHaveBeenCalledWith('u1', '2000-01-01')
    expect(container.textContent).toContain('12')
    expect(container.textContent).toContain('Sinus rhythm · 100 bpm')
    expect(container.querySelectorAll('.he-list-item')).toHaveLength(10)
    fireEvent.click(screen.getByText('Show all (12)'))
    expect(container.querySelectorAll('.he-list-item')).toHaveLength(12)
  })

  it('renders nothing when there are no events', async () => {
    vi.mocked(loadHeartEvents).mockResolvedValue([])
    const { container } = renderWithProviders(<HeartEventsBlock userId="u1" />)
    await waitFor(() => expect(loadHeartEvents).toHaveBeenCalled())
    expect(container.textContent).toBe('')
  })
})
