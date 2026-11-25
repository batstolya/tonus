import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test/utils'
import { DoctorReport } from './DoctorReport'
import { translations } from '../../lib/translations'
import type { DailyMetrics } from '../../types'
import type { User } from '@supabase/supabase-js'
import type { ReportSources } from '../../lib/doctorReport'

// Chrome labels follow the UI language (en in this harness); the report body
// stays Russian, same convention as DoctorReport.copy.test.tsx.
const ui = (ru: string) => translations[ru]?.en ?? ru

// loadReportSources talks to Supabase, which the jsdom project stubs to
// return nothing — there is no other way to get a heart-event fixture into the
// printed page, so the barrel this component imports from is mocked here,
// with every other export passed through untouched.
vi.mock('../../lib/doctorReport', async importOriginal => {
  const actual = await importOriginal<typeof import('../../lib/doctorReport')>()
  return { ...actual, loadReportSources: vi.fn() }
})

const { loadReportSources } = await import('../../lib/doctorReport')

const EMPTY_SOURCES: ReportSources = {
  labs: [], supplements: [], supplementLogs: [], concerns: [], concernLogs: [], observations: [], notes: [], intake: [], nutrition: [],
  habits: [], habitBreaks: [], heartEvents: [],
  profile: null,
}

const user = { id: 'u1' } as User
const daily: DailyMetrics[] = Array.from({ length: 5 }, (_, i) => {
  const d = new Date()
  d.setDate(d.getDate() - i)
  return {
    date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    restingHeartRate: 58, sleepHours: 7, steps: 9000,
  }
})

describe('DoctorReport heart events — printed page', () => {
  it('prints the heart events section with the notification line', async () => {
    const recent = new Date(Date.now() - 2 * 86400000).toISOString()
    vi.mocked(loadReportSources).mockResolvedValue({
      ...EMPTY_SOURCES,
      heartEvents: [{ kind: 'low_hr', start_ts: recent, end_ts: null, threshold: 40, hr_min: 36, hr_max: 38, hr_avg: 37, classification: null }],
    })
    renderWithProviders(<DoctorReport user={user} daily={daily} onClose={() => {}} />)
    fireEvent.click(screen.getByText(ui('Сформировать')))
    await waitFor(() => expect(screen.getByText('Сердечные события (уведомления Apple Watch и ЭКГ)')).toBeTruthy())
    const section = screen.getByText('Сердечные события (уведомления Apple Watch и ЭКГ)').closest('section')!
    expect(section.textContent).toMatch(/Уведомление о низком пульсе: пульс 36–38 уд\/мин \(порог 40\)/)
  })
})
