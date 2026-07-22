import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderWithProviders, waitFor, cleanup } from '../../test/utils'

const api = vi.hoisted(() => ({ getEnvironmentDays: vi.fn().mockResolvedValue([]) }))
vi.mock('../../lib/api/insights', () => api)
vi.mock('../../lib/demo', () => ({ isDemoActive: () => false }))

import { CorrelationsBlock } from './CorrelationsBlock'

beforeEach(() => localStorage.setItem('lang', 'en'))
afterEach(() => { cleanup(); vi.clearAllMocks(); localStorage.clear() })

describe('CorrelationsBlock', () => {
  it('fetches the ~48-day environment window and asks for more data on short history', async () => {
    const { container } = renderWithProviders(<CorrelationsBlock daily={[]} intakeEvents={[]} />)
    await waitFor(() => expect(api.getEnvironmentDays).toHaveBeenCalledTimes(1))
    const since = api.getEnvironmentDays.mock.calls[0][0] as string
    const daysBack = Math.round((Date.now() - new Date(since + 'T00:00:00Z').getTime()) / 86400000)
    expect(daysBack).toBeGreaterThanOrEqual(47)
    expect(daysBack).toBeLessThanOrEqual(49)
    // Empty history lands in the needMoreDays branch: title plus muted hint.
    expect(container.querySelector('.ins-title')).not.toBeNull()
    expect(container.querySelector('.settings-muted')).not.toBeNull()
  })
})
