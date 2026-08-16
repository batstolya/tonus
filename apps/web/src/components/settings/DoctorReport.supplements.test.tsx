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
// return nothing — there is no other way to get a supplement fixture into
// the printed page, so the barrel this component imports from is mocked
// here, with every other export passed through untouched (same technique as
// DoctorReport.labs.test.tsx).
vi.mock('../../lib/doctorReport', async importOriginal => {
  const actual = await importOriginal<typeof import('../../lib/doctorReport')>()
  return { ...actual, loadReportSources: vi.fn() }
})

const { loadReportSources } = await import('../../lib/doctorReport')

const EMPTY_SOURCES: ReportSources = {
  labs: [], supplements: [], supplementLogs: [], concerns: [], concernLogs: [], notes: [], intake: [], nutrition: [],
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

describe('DoctorReport supplements header — printed page', () => {
  it('reads "Доля дней с отметкой", not the old adherence wording', async () => {
    vi.mocked(loadReportSources).mockResolvedValue({
      ...EMPTY_SOURCES,
      supplements: [{
        id: 's1', user_id: 'u1', name: 'Магний', default_dose: '400', unit: 'мг',
        active: true, sort_order: 0, created_at: '2026-07-01', stock_count: null,
      }],
      supplementLogs: [{ supplement_id: 's1', date: daily[daily.length - 1].date, taken: true }],
    })
    const { container } = renderWithProviders(
      <DoctorReport user={user} daily={daily} onClose={() => {}} />)
    fireEvent.click(screen.getByText(ui('Сформировать')))
    await waitFor(() => expect(screen.getByText('Магний')).toBeTruthy())

    expect(screen.getByText('Доля дней с отметкой')).toBeTruthy()
    expect(container.textContent).not.toContain('Соблюдение в периоде')

    expect(screen.getByText(
      'Показана доля дней с отметкой о приёме, считая от первого отмеченного приёма внутри периода. Отсутствие отметки не означает, что приём не состоялся.',
    )).toBeTruthy()
  })
})
