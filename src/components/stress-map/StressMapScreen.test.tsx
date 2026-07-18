import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderWithProviders, screen, cleanup } from '../../test/utils'
import { StressMapScreen } from './StressMapScreen'

afterEach(() => cleanup())

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
