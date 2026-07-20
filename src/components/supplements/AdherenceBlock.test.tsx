import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderWithProviders, screen, waitFor, cleanup } from '../../test/utils'
import type { Supplement } from '../../lib/supplements'

const api = vi.hoisted(() => ({ getAdherenceLogs: vi.fn() }))
vi.mock('../../lib/api/supplements', () => api)
vi.mock('../../lib/demo', () => ({ isDemoActive: () => false }))

import { AdherenceBlock } from './AdherenceBlock'

const supplements = [{ id: 's1', name: 'Magnesium', active: true } as Supplement]

const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10)

// Pin the UI language: detectLang falls back to navigator.language otherwise.
beforeEach(() => localStorage.setItem('lang', 'en'))
afterEach(() => { cleanup(); vi.clearAllMocks(); localStorage.clear() })

describe('AdherenceBlock', () => {
  it('loads logs for the rolling window and renders adherence rows', async () => {
    api.getAdherenceLogs.mockResolvedValue(
      Array.from({ length: 7 }, (_, i) => ({ supplement_id: 's1', date: iso(i + 1), taken: true })),
    )
    renderWithProviders(<AdherenceBlock supplements={supplements} />)
    expect(await screen.findByText(/Adherence/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Magnesium')).toBeInTheDocument())
    // called with a date ~30 days back
    const since = api.getAdherenceLogs.mock.calls[0][0] as string
    const daysBack = (Date.now() - new Date(since).getTime()) / 86400000
    expect(daysBack).toBeGreaterThan(29)
    expect(daysBack).toBeLessThan(31)
  })

  it('refetches logs when refreshKey changes (calendar toggle)', async () => {
    api.getAdherenceLogs.mockResolvedValue([{ supplement_id: 's1', date: iso(1), taken: true }])
    const { rerender } = renderWithProviders(<AdherenceBlock supplements={supplements} refreshKey={0} />)
    await waitFor(() => expect(api.getAdherenceLogs).toHaveBeenCalledTimes(1))
    api.getAdherenceLogs.mockResolvedValue(
      Array.from({ length: 3 }, (_, i) => ({ supplement_id: 's1', date: iso(i + 1), taken: true })),
    )
    rerender(<AdherenceBlock supplements={supplements} refreshKey={1} />)
    await waitFor(() => expect(api.getAdherenceLogs).toHaveBeenCalledTimes(2))
  })

  it('renders nothing when no supplement is active', () => {
    const { container } = renderWithProviders(<AdherenceBlock supplements={[]} />)
    expect(container.firstChild).toBeNull()
    expect(api.getAdherenceLogs).not.toHaveBeenCalled()
  })
})
