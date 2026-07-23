import { describe, it, expect } from 'vitest'
import type { DailyMetrics } from '../../types'
import { renderWithProviders } from '../../test/utils'
import { DataGaps } from './DataGaps'

// Recent date (offset days ago) as YYYY-MM-DD, so it falls inside the gap window.
function recentDay(offset: number): string {
  const d = new Date()
  d.setDate(d.getDate() - offset)
  return d.toISOString().slice(0, 10)
}

// Five recent days fully populated except HRV → one significant gap (HRV, 5 days).
const hrvGap: DailyMetrics[] = [0, 1, 2, 3, 4].map((o) => ({
  date: recentDay(o),
  restingHeartRate: 55,
  sleepHours: 7,
  steps: 5000,
  activeEnergy: 400,
  oxygenSaturation: 98,
}))

// Same five days with HRV present too → no gaps.
const complete: DailyMetrics[] = hrvGap.map((d) => ({ ...d, hrv: 60 }))

describe('DataGaps', () => {
  it('renders nothing when there are no significant gaps', () => {
    const { container } = renderWithProviders(<DataGaps daily={complete} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders a chip for each significant gap', () => {
    const { container } = renderWithProviders(<DataGaps daily={hrvGap} />)
    const chips = container.querySelectorAll('.data-gaps-chip')
    expect(chips).toHaveLength(1)
    expect(chips[0].textContent).toContain('HRV')
  })

  it('renders the compact variant as a single summary span', () => {
    const { container } = renderWithProviders(<DataGaps daily={hrvGap} compact />)
    expect(container.querySelector('.data-gaps-compact')).not.toBeNull()
    expect(container.querySelector('.data-gaps-list')).toBeNull()
  })
})
