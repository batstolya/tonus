import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderWithProviders, screen, fireEvent, waitFor, cleanup } from '../../test/utils'

const sync = vi.hoisted(() => ({ loadHRSamples: vi.fn() }))
vi.mock('../../lib/sync', () => sync)

import { StressMapScreen } from './StressMapScreen'

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('StressMapScreen empty state', () => {
  it('shows only the Google connect option and a Settings hint', () => {
    renderWithProviders(
      <StressMapScreen
        heartRateSamples={[]}
        events={[]}
        onGoogleCalendar={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /Google Calendar/i })).toBeTruthy()
    expect(screen.getByText(/в Настройках|у Налаштуваннях|in Settings/)).toBeTruthy()
    expect(screen.queryByText(/\.ics/i)).toBeNull()
    expect(screen.queryByText(/cal_bookings\.json/i)).toBeNull()
  })

  it('omits the Google button when the integration is unavailable', () => {
    renderWithProviders(
      <StressMapScreen heartRateSamples={[]} events={[]} />,
    )
    expect(screen.queryByRole('button', { name: /Google Calendar/i })).toBeNull()
    expect(screen.getByText(/в Настройках|у Налаштуваннях|in Settings/)).toBeTruthy()
  })
})

// Samples are fetched when this screen opens rather than during app start-up,
// so there is now a moment with nothing to draw.
describe('StressMapScreen sample loading', () => {
  const event = {
    uid: 'e1', title: 'Планёрка',
    start: new Date('2026-07-10T10:00:00Z'), end: new Date('2026-07-10T11:00:00Z'),
  }
  const sample = { time: new Date('2026-07-10T10:30:00Z'), value: 95, sourceName: '' }

  it('holds the list back behind a placeholder while they load', async () => {
    sync.loadHRSamples.mockReturnValue(new Promise(() => {}))
    const { container } = renderWithProviders(
      <StressMapScreen heartRateSamples={[]} userId="u1" events={[event]} />,
    )
    await waitFor(() => expect(sync.loadHRSamples).toHaveBeenCalledWith('u1'))
    // Drawing the map from zero samples would claim every event had no heart
    // data — a wrong answer rather than a slow one.
    expect(container.querySelectorAll('.sk-card').length).toBeGreaterThan(0)
    expect(screen.queryByText('Планёрка')).toBeNull()
  })

  it('opens on the charts, with the list a click away', async () => {
    sync.loadHRSamples.mockResolvedValue([sample])
    renderWithProviders(
      <StressMapScreen heartRateSamples={[]} userId="u1" events={[event]} />,
    )
    // The charts answer the question people come here with; the event list is
    // the follow-up.
    const byDate = await screen.findByRole('button', { name: /по дате|за датою|by date/i })
    expect(screen.queryByText('Планёрка')).toBeNull()

    fireEvent.click(byDate)
    expect(await screen.findByText('Планёрка')).toBeTruthy()
  })

  it('drops the placeholder once the samples arrive', async () => {
    sync.loadHRSamples.mockResolvedValue([sample])
    const { container } = renderWithProviders(
      <StressMapScreen heartRateSamples={[]} userId="u1" events={[event]} />,
    )
    await waitFor(() => expect(container.querySelectorAll('.sk-card')).toHaveLength(0))
  })

  // A file import hands them straight in; fetching then would be a wasted
  // request for data already in hand.
  it('does not fetch when the samples were passed in', async () => {
    renderWithProviders(
      <StressMapScreen heartRateSamples={[sample]} userId="u1" events={[event]} />,
    )
    fireEvent.click(await screen.findByRole('button', { name: /по дате|за датою|by date/i }))
    expect(await screen.findByText('Планёрка')).toBeTruthy()
    expect(sync.loadHRSamples).not.toHaveBeenCalled()
  })

  it('settles rather than spinning forever if the fetch fails', async () => {
    sync.loadHRSamples.mockRejectedValue(new Error('offline'))
    const { container } = renderWithProviders(
      <StressMapScreen heartRateSamples={[]} userId="u1" events={[event]} />,
    )
    await waitFor(() => expect(container.querySelectorAll('.sk-card')).toHaveLength(0))
    fireEvent.click(screen.getByRole('button', { name: /по дате|за датою|by date/i }))
    expect(screen.getByText('Планёрка')).toBeTruthy()
  })
})
