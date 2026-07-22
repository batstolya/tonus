import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { User } from '@supabase/supabase-js'
import { renderWithProviders, screen, fireEvent, waitFor, cleanup } from '../../test/utils'

const api = vi.hoisted(() => ({
  getTreatments: vi.fn(),
  getSupplementOptions: vi.fn().mockResolvedValue([]),
  getMetricDailyRows: vi.fn().mockResolvedValue([]),
  createTreatment: vi.fn(),
  deleteTreatment: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../lib/api/supplements', () => api)
vi.mock('../../lib/demo', () => ({ isDemoActive: () => false }))

import { TreatmentTracker } from './TreatmentTracker'

const user = { id: 'u1' } as User

const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10)

const treatment = (daysAgo: number) => ({
  id: 't1', user_id: 'u1', supplement_id: null, name: 'Magnesium',
  started_at: iso(daysAgo), outcome_metrics: [], notes: null, created_at: iso(daysAgo),
})

// Pin the UI language: detectLang falls back to navigator.language otherwise.
beforeEach(() => localStorage.setItem('lang', 'en'))
afterEach(() => { cleanup(); vi.clearAllMocks(); localStorage.clear() })

describe('TreatmentTracker', () => {
  it('shows a young treatment without querying metric windows', async () => {
    api.getTreatments.mockResolvedValue([treatment(10)])
    renderWithProviders(<TreatmentTracker user={user} />)
    expect(await screen.findByText('Magnesium')).toBeInTheDocument()
    expect(screen.getByText(/Not enough data \(need 30\+ days\)/)).toBeInTheDocument()
    expect(api.getMetricDailyRows).not.toHaveBeenCalled()
  })

  it('queries the before/after window for a 30+ day treatment', async () => {
    api.getTreatments.mockResolvedValue([treatment(40)])
    renderWithProviders(<TreatmentTracker user={user} />)
    expect(await screen.findByText('Magnesium')).toBeInTheDocument()
    expect(api.getMetricDailyRows).toHaveBeenCalledWith(
      'u1', ['hrv', 'restingHeartRate', 'sleepHours'], expect.any(String), expect.any(String),
    )
  })

  it('deletes a treatment through the API module', async () => {
    api.getTreatments.mockResolvedValue([treatment(10)])
    renderWithProviders(<TreatmentTracker user={user} />)
    await screen.findByText('Magnesium')
    fireEvent.click(screen.getByTitle(/Delete/))
    await waitFor(() => expect(api.deleteTreatment).toHaveBeenCalledWith('t1'))
    expect(screen.queryByText('Magnesium')).toBeNull()
  })
})
