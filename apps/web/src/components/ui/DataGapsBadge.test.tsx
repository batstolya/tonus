import { describe, it, expect, afterEach } from 'vitest'
import type { DailyMetrics } from '../../types'
import { renderWithProviders, screen, fireEvent, cleanup } from '../../test/utils'
import { DataGapsBadge } from './DataGapsBadge'

// Recent date (offset days ago) as YYYY-MM-DD, so it falls inside the gap window.
function recentDay(offset: number): string {
  const d = new Date()
  d.setDate(d.getDate() - offset)
  return d.toISOString().slice(0, 10)
}

// Five recent days fully populated except HRV → one significant gap (HRV, 5 days).
const hrvGap: DailyMetrics[] = [0, 1, 2, 3, 4].map(o => ({
  date: recentDay(o),
  restingHeartRate: 55,
  sleepHours: 7,
  steps: 5000,
  activeEnergy: 400,
  oxygenSaturation: 98,
}))

const complete: DailyMetrics[] = hrvGap.map(d => ({ ...d, hrv: 60 }))

afterEach(cleanup)

describe('DataGapsBadge', () => {
  it('stays out of the topbar when the data has no significant gaps', () => {
    const { container } = renderWithProviders(<DataGapsBadge daily={complete} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the gap detail only once the badge is clicked', () => {
    const { container } = renderWithProviders(<DataGapsBadge daily={hrvGap} />)
    expect(container.querySelectorAll('.data-gaps-chip').length).toBe(0)

    fireEvent.click(screen.getByRole('button'))
    expect(container.querySelectorAll('.data-gaps-chip').length).toBe(1)

    fireEvent.click(screen.getByRole('button'))
    expect(container.querySelectorAll('.data-gaps-chip').length).toBe(0)
  })

  it('names the gap in the button label, so the icon alone is not the whole message', () => {
    renderWithProviders(<DataGapsBadge daily={hrvGap} />)
    expect(screen.getByRole('button').getAttribute('aria-label')).toMatch(/1/)
  })
})
