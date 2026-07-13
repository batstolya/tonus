import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderWithProviders } from '../../test/utils'
import { GeoStormBanner } from './GeoStormBanner'
import { useTodayStorm } from '../../lib/useTodayStorm'

vi.mock('../../lib/useTodayStorm', () => ({ useTodayStorm: vi.fn() }))
const mockStorm = vi.mocked(useTodayStorm)

describe('GeoStormBanner', () => {
  beforeEach(() => mockStorm.mockReset())

  it('renders nothing on a calm day', () => {
    mockStorm.mockReturnValue({ kp: null, tier: null })
    const { container } = renderWithProviders(<GeoStormBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the storm banner with the tier class and Kp value', () => {
    mockStorm.mockReturnValue({ kp: 6, tier: 'strong' })
    const { container } = renderWithProviders(<GeoStormBanner />)
    const banner = container.querySelector('.geostorm-banner')
    expect(banner).not.toBeNull()
    expect(banner!.classList.contains('strong')).toBe(true)
    expect(banner!.getAttribute('role')).toBe('status')
    expect(banner!.textContent).toContain('Kp 6')
  })
})
