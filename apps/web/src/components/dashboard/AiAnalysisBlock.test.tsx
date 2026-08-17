import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { DailyMetrics } from '../../types'
import { fireEvent, renderWithProviders, screen, cleanup } from '../../test/utils'
import type { AiAnalysis } from '../../lib/aiAnalysis'

vi.mock('../../lib/aiAnalysis', () => ({
  runAnalysis: vi.fn(),
  loadAnalyses: vi.fn().mockResolvedValue([]),
  deleteAnalysis: vi.fn(),
}))
vi.mock('../../lib/aiConsent', () => ({
  loadAiConsent: vi.fn().mockResolvedValue(true),
  isAiConsentRequiredError: () => false,
}))

import { loadAnalyses } from '../../lib/aiAnalysis'
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

// A long history pushed everything below it off the screen: the feed grew with
// every run and never stopped. Only the newest five are worth the space by
// default — the rest arrive a page at a time.
describe('AiAnalysisBlock: history paging', () => {
  function analyses(count: number): AiAnalysis[] {
    return Array.from({ length: count }, (_, i) => ({
      id: `a${i}`,
      period_start: '2026-08-01', period_end: '2026-08-14',
      created_at: `2026-08-${String(28 - i).padStart(2, '0')}T10:00:00Z`,
      summary: `Analysis number ${i}`,
      good: [], improve: [], focus: [], model: 'test', tokens_used: null,
    }))
  }

  function renderWith(count: number) {
    vi.mocked(loadAnalyses).mockResolvedValue(analyses(count))
    return renderWithProviders(<AiAnalysisBlock daily={window(full)} userId="u1" />)
  }

  it('shows only the newest five and offers the rest', async () => {
    renderWith(8)

    expect(await screen.findByText(/Analysis number 4\./)).toBeTruthy()
    expect(screen.queryByText(/Analysis number 5\./)).toBeNull()
    expect(screen.getByRole('button', { name: /Show more \(3\)/ })).toBeTruthy()
  })

  it('adds the next page and then drops the button', async () => {
    renderWith(8)
    fireEvent.click(await screen.findByRole('button', { name: /Show more/ }))

    expect(screen.getByText(/Analysis number 7\./)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Show more/ })).toBeNull()
  })

  it('offers nothing extra when the history fits', async () => {
    renderWith(5)

    expect(await screen.findByText(/Analysis number 4\./)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Show more/ })).toBeNull()
  })
})
