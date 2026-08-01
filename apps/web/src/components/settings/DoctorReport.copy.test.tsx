import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test/utils'
import { DoctorReport } from './DoctorReport'
import { translations } from '../../lib/translations'
import type { DailyMetrics } from '../../types'
import type { User } from '@supabase/supabase-js'

// Chrome labels follow the UI language, which the harness detects as en; the
// report body stays Russian because its own language selector defaults to ru.
const ui = (ru: string) => translations[ru]?.en ?? ru

const writeText = vi.fn((_text: string) => Promise.resolve())
Object.assign(navigator, { clipboard: { writeText } })

const user = { id: 'u1' } as User
const daily: DailyMetrics[] = Array.from({ length: 30 }, (_, i) => {
  const d = new Date()
  d.setDate(d.getDate() - i)
  return {
    date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    restingHeartRate: 58, sleepHours: 7, steps: 9000,
  }
})

beforeEach(() => writeText.mockClear())

describe('DoctorReport copy for AI', () => {
  it('puts the full markdown on the clipboard', async () => {
    renderWithProviders(<DoctorReport user={user} daily={daily} onClose={() => {}} />)
    fireEvent.click(screen.getByText(ui('Сформировать')))
    await waitFor(() => expect(screen.getByText(ui('Скопировать для ИИ'))).toBeTruthy())
    fireEvent.click(screen.getByText(ui('Скопировать для ИИ')))
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    const md = writeText.mock.calls[0][0]
    expect(md).toContain('# Сводка данных здоровья')
    expect(md).toContain('## Чего в этих данных нет')
  })

  it('renders a row for every night in the print view', async () => {
    const { container } = renderWithProviders(
      <DoctorReport user={user} daily={daily} onClose={() => {}} />)
    fireEvent.click(screen.getByText(ui('Сформировать')))
    await waitFor(() => expect(container.querySelector('.dr-sleep-table')).toBeTruthy())
    expect(container.querySelectorAll('.dr-sleep-table tbody tr')).toHaveLength(30)
  })

  it('shows the reliability band and longest gap for a metric with a hole', async () => {
    // Steps miss five consecutive days in the middle; rhr and sleep stay
    // complete, so only the steps row should carry a gap note. The report
    // body renders in Russian regardless of UI language (lang defaults to
    // 'ru' and never gets toggled in this test).
    const gapDaily: DailyMetrics[] = daily.map((d, i) => (i >= 12 && i <= 16
      ? { date: d.date, restingHeartRate: d.restingHeartRate, sleepHours: d.sleepHours }
      : d))
    const { container } = renderWithProviders(
      <DoctorReport user={user} daily={gapDaily} onClose={() => {}} />)
    fireEvent.click(screen.getByText(ui('Сформировать')))
    await waitFor(() => expect(screen.getByText('Метрики за период')).toBeTruthy())

    expect(screen.getByText('Надёжность')).toBeTruthy()
    const stepsRow = Array.from(container.querySelectorAll('table tbody tr'))
      .find(tr => tr.textContent?.includes('Шаги'))
    expect(stepsRow?.textContent).toContain('высокая')
    expect(stepsRow?.textContent).toContain('макс. пробел 5 дн.')
  })

  it('prints the median and range for a well-covered metric, and refuses one below the coverage band — in the DOM, not the model', async () => {
    // Same fixture shape as the model/markdown-level tests (28 pre-period
    // days shaped 44..53 -> median 48, range 46-50), but rendered through the
    // actual print view so a hand-rolled TSX cell that regressed to a
    // percentage would be caught here too.
    const base = new Date()
    const dateAt = (daysAgo: number) => {
      const d = new Date(base)
      d.setDate(d.getDate() - daysAgo)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    // 28 days feeding the pre-period baseline window, then 30 days in the
    // period: rhr fully covered and well above that range, hrv present only
    // every fourth day so its coverage stays below the claims band.
    const preDays: DailyMetrics[] = Array.from({ length: 28 }, (_, i) => ({
      date: dateAt(30 + i),
      restingHeartRate: 44 + (i % 10),
    }))
    const periodDays: DailyMetrics[] = Array.from({ length: 30 }, (_, i) => ({
      date: dateAt(29 - i),
      restingHeartRate: 60,
      hrv: i % 4 === 0 ? 45 : undefined,
    }))
    const baselineDaily = [...preDays, ...periodDays]

    const { container } = renderWithProviders(
      <DoctorReport user={user} daily={baselineDaily} onClose={() => {}} />)
    fireEvent.click(screen.getByText('30'))
    fireEvent.click(screen.getByText(ui('Сформировать')))
    await waitFor(() => expect(screen.getByText('Метрики за период')).toBeTruthy())

    const rows = Array.from(container.querySelectorAll('table tbody tr'))
    const rhrRow = rows.find(tr => tr.textContent?.includes('Пульс покоя'))
    const rhrCell = rhrRow?.querySelectorAll('td')[4]
    expect(rhrCell?.textContent).toBe('медиана 48 · 46–50 · выше диапазона')
    expect(rhrCell?.textContent).not.toMatch(/%/)

    const hrvRow = rows.find(tr => tr.textContent?.includes('HRV'))
    const hrvCell = hrvRow?.querySelectorAll('td')[4]
    expect(hrvCell?.textContent).toBe('данных недостаточно')
  })
})
