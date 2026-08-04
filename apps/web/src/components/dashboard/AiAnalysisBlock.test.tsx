import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { DailyMetrics } from '../../types'
import { renderWithProviders, screen, cleanup } from '../../test/utils'

vi.mock('../../lib/aiAnalysis', () => ({
  runAnalysis: vi.fn(),
  loadAnalyses: vi.fn().mockResolvedValue([]),
  deleteAnalysis: vi.fn(),
}))
vi.mock('../../lib/aiConsent', () => ({
  loadAiConsent: vi.fn().mockResolvedValue(true),
  isAiConsentRequiredError: () => false,
}))

import { AiAnalysisBlock } from './AiAnalysisBlock'

// Fourteen days ending today, so they fall inside the window computeGaps reads.
function window(make: (date: string) => DailyMetrics): DailyMetrics[] {
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - i)
    return make(d.toISOString().slice(0, 10))
  })
}
const full = (date: string): DailyMetrics => ({
  date, steps: 12000, sleepHours: 7, oxygenSaturation: 0.97,
  hrv: 45, restingHeartRate: 55, activeEnergy: 600,
})

beforeEach(() => localStorage.setItem('lang', 'en'))
afterEach(() => { cleanup(); vi.clearAllMocks(); localStorage.clear() })

// The caveat moved here from a topbar popover: it only means something next to
// the result it qualifies. Demo data has no gaps, so this is unreachable in the
// browser.
describe('AiAnalysisBlock: accuracy caveat', () => {
  it('warns when a tracked metric has gaps', () => {
    const daily = window(d => {
      const day = full(d)
      delete day.oxygenSaturation
      return day
    })
    renderWithProviders(<AiAnalysisBlock daily={daily} userId="u1" />)
    expect(screen.getByText(/less accurate/i)).toBeTruthy()
  })

  it('stays quiet when the data is complete', () => {
    renderWithProviders(<AiAnalysisBlock daily={window(full)} userId="u1" />)
    expect(screen.queryByText(/less accurate/i)).toBeNull()
  })
})
