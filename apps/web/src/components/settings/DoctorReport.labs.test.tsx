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
// return nothing — there is no other way to get a lab fixture into the
// printed page, so the barrel this component imports from is mocked here,
// with every other export passed through untouched.
vi.mock('../../lib/doctorReport', async importOriginal => {
  const actual = await importOriginal<typeof import('../../lib/doctorReport')>()
  return { ...actual, loadReportSources: vi.fn() }
})

const { loadReportSources } = await import('../../lib/doctorReport')

const EMPTY_SOURCES: ReportSources = {
  labs: [], supplements: [], supplementLogs: [], concerns: [], concernLogs: [], notes: [],
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

describe('DoctorReport labs status — printed page', () => {
  it('never prints "в норме" for a result with no reference range and no lab flag', async () => {
    vi.mocked(loadReportSources).mockResolvedValue({
      ...EMPTY_SOURCES,
      labs: [{ id: '1', lab_file_id: 'f', marker: 'LDL', value: 147, unit: 'mg/dL', date: '2026-07-20' }],
    })
    const { container } = renderWithProviders(
      <DoctorReport user={user} daily={daily} onClose={() => {}} />)
    fireEvent.click(screen.getByText(ui('Сформировать')))
    await waitFor(() => expect(screen.getByText('LDL')).toBeTruthy())

    expect(container.textContent).not.toContain('в норме')
    const row = Array.from(container.querySelectorAll('table tbody tr'))
      .find(tr => tr.textContent?.includes('LDL'))
    expect(row?.textContent).toContain('статус не определён')
  })

  it('names the range as the source, and the lab flag when the range does not parse', async () => {
    vi.mocked(loadReportSources).mockResolvedValue({
      ...EMPTY_SOURCES,
      labs: [
        { id: '1', lab_file_id: 'f', marker: 'LDL', value: 147, unit: 'mg/dL', ref_range: '0-115', date: '2026-07-20' },
        { id: '2', lab_file_id: 'f', marker: 'Glucose', value: 6.2, unit: 'mmol/L', flag: 'high', date: '2026-07-20' },
      ],
    })
    const { container } = renderWithProviders(
      <DoctorReport user={user} daily={daily} onClose={() => {}} />)
    fireEvent.click(screen.getByText(ui('Сформировать')))
    await waitFor(() => expect(screen.getByText('LDL')).toBeTruthy())

    const rows = Array.from(container.querySelectorAll('table tbody tr'))
    const ldlRow = rows.find(tr => tr.textContent?.includes('LDL'))
    expect(ldlRow?.textContent).toContain('выше диапазона лаборатории')
    expect(ldlRow?.textContent).not.toContain('по флагу лаборатории')

    const glucoseRow = rows.find(tr => tr.textContent?.includes('Glucose'))
    expect(glucoseRow?.textContent).toContain('выше диапазона лаборатории (по флагу лаборатории)')
  })

  it('keeps a percentage and an absolute count of the same marker as two rows and shows both caveats', async () => {
    vi.mocked(loadReportSources).mockResolvedValue({
      ...EMPTY_SOURCES,
      labs: [
        { id: '1', lab_file_id: 'f', marker: 'LINFOCITOS', value: 42.2, unit: '%', date: '2026-06-20' },
        { id: '2', lab_file_id: 'f', marker: 'LINFOCITOS', value: 2.16, unit: '10E3/µL', date: '2026-06-20' },
      ],
    })
    const { container } = renderWithProviders(
      <DoctorReport user={user} daily={daily} onClose={() => {}} />)
    fireEvent.click(screen.getByText(ui('Сформировать')))
    await waitFor(() => expect(screen.getAllByText('LINFOCITOS')).toHaveLength(2))

    const rows = Array.from(container.querySelectorAll('table tbody tr'))
      .filter(tr => tr.textContent?.includes('LINFOCITOS'))
    expect(rows).toHaveLength(2)
    for (const row of rows) expect(row.textContent).toContain('—') // no delta across units

    const notes = Array.from(container.querySelectorAll('.dr-note')).map(el => el.textContent)
    expect(notes.some(t => t?.includes('Показатели с одинаковым названием в разных единицах'))).toBe(true)
    expect(notes.some(t => t?.includes('Дата берётся из формы загрузки файла'))).toBe(true)
  })
})
