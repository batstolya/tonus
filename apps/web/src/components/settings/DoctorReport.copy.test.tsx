import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test/utils'
import { DoctorReport } from './DoctorReport'
import { MISSING_LINES } from '../../lib/doctorReport'
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
afterEach(() => vi.useRealTimers())

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

  it('prints every "what this data does not contain" line in the print view too', async () => {
    // Same MISSING_LINES export the markdown renderer prints — this loop is
    // the guard against the two renderers silently diverging on this block.
    const { container } = renderWithProviders(
      <DoctorReport user={user} daily={daily} onClose={() => {}} />)
    fireEvent.click(screen.getByText(ui('Сформировать')))
    await waitFor(() => expect(screen.getByText('Чего в этих данных нет')).toBeTruthy())
    for (const line of MISSING_LINES) expect(container.textContent).toContain(line)
  })

  it('renders a row for every night in the print view', async () => {
    const { container } = renderWithProviders(
      <DoctorReport user={user} daily={daily} onClose={() => {}} />)
    fireEvent.click(screen.getByText(ui('Сформировать')))
    await waitFor(() => expect(container.querySelector('.dr-sleep-table')).toBeTruthy())
    expect(container.querySelectorAll('.dr-sleep-table tbody tr')).toHaveLength(30)
  })

  it('marks a daytime nap in the printed sleep table and the summary line', async () => {
    // Same fixture as the markdown-level test: a 1.9 h doze starting at 09:08
    // next to a real 7.2 h night, rendered through the actual print view.
    const base = new Date()
    const dateAt = (daysAgo: number) => {
      const d = new Date(base)
      d.setDate(d.getDate() - daysAgo)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    const napDate = dateAt(1)
    const nightDate = dateAt(0)
    const napDaily: DailyMetrics[] = [
      { date: napDate, sleepHours: 1.9, sleepBedtime: `${napDate}T09:08:00` },
      { date: nightDate, sleepHours: 7.2, sleepBedtime: `${nightDate}T01:10:00` },
    ]
    const { container } = renderWithProviders(
      <DoctorReport user={user} daily={napDaily} onClose={() => {}} />)
    fireEvent.click(screen.getByText('30'))
    fireEvent.click(screen.getByText(ui('Сформировать')))
    await waitFor(() => expect(container.querySelector('.dr-sleep-table')).toBeTruthy())

    const rows = Array.from(container.querySelectorAll('.dr-sleep-table tbody tr'))
    const napRow = rows.find(tr => tr.textContent?.includes(napDate))
    const nightRow = rows.find(tr => tr.textContent?.includes(nightDate))
    expect(napRow?.textContent).toContain('дневной эпизод')
    expect(nightRow?.textContent).not.toContain('дневной эпизод')

    const summary = Array.from(container.querySelectorAll('.dr-note'))
      .find(el => el.textContent?.includes('Ночей в периоде'))
    expect(summary?.textContent).toContain('Дневных эпизодов: 1')
    expect(screen.getByText(/Дневные эпизоды \(короче 3 ч/)).toBeTruthy()
  })

  it('shows the sleep time no phase accounts for, and the phase-coverage line — in the DOM, not the model', async () => {
    // Same fixture as the markdown-level test: 9.1 h total, 1.8 deep + 2.1
    // REM + 2.4 core classify only 6.3 h, leaving 2.8 h unclassified.
    const base = new Date()
    const dateAt = (daysAgo: number) => {
      const d = new Date(base)
      d.setDate(d.getDate() - daysAgo)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    const nightDate = dateAt(0)
    const nightDaily: DailyMetrics[] = [{
      date: nightDate, sleepHours: 9.1, sleepDeep: 1.8, sleepREM: 2.1, sleepCore: 2.4,
      sleepBedtime: `${nightDate}T01:00:00`,
    }]

    const { container } = renderWithProviders(
      <DoctorReport user={user} daily={nightDaily} onClose={() => {}} />)
    fireEvent.click(screen.getByText('30'))
    fireEvent.click(screen.getByText(ui('Сформировать')))
    await waitFor(() => expect(container.querySelector('.dr-sleep-table')).toBeTruthy())

    const headerCells = Array.from(container.querySelectorAll('.dr-sleep-table thead th')).map(th => th.textContent)
    const unclassifiedCol = headerCells.indexOf('Не классифицировано, ч')
    expect(unclassifiedCol).toBeGreaterThanOrEqual(0)

    const nightRow = Array.from(container.querySelectorAll('.dr-sleep-table tbody tr'))
      .find(tr => tr.textContent?.includes(nightDate))!
    // Same column index as the header's "Не классифицировано, ч" — pinned so
    // a column reorder fails here instead of a loose substring match passing.
    const cells = Array.from(nightRow.querySelectorAll('td')).map(td => td.textContent)
    expect(cells[unclassifiedCol]).toBe('2.8')

    expect(screen.getByText(/Разложено по фазам: 69%/)).toBeTruthy()
  })

  it('prints negative unclassified hours and the overshoot note when phases sum past the total — in the DOM, not the model', async () => {
    const base = new Date()
    const dateAt = (daysAgo: number) => {
      const d = new Date(base)
      d.setDate(d.getDate() - daysAgo)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    const nightDate = dateAt(0)
    // 3 + 3 + 1 = 7 of 6 h: the source's phases overshoot its own total.
    const nightDaily: DailyMetrics[] = [{
      date: nightDate, sleepHours: 6, sleepDeep: 3, sleepREM: 3, sleepCore: 1,
    }]

    const { container } = renderWithProviders(
      <DoctorReport user={user} daily={nightDaily} onClose={() => {}} />)
    fireEvent.click(screen.getByText('30'))
    fireEvent.click(screen.getByText(ui('Сформировать')))
    await waitFor(() => expect(container.querySelector('.dr-sleep-table')).toBeTruthy())

    const headerCells = Array.from(container.querySelectorAll('.dr-sleep-table thead th')).map(th => th.textContent)
    const unclassifiedCol = headerCells.indexOf('Не классифицировано, ч')
    const nightRow = Array.from(container.querySelectorAll('.dr-sleep-table tbody tr'))
      .find(tr => tr.textContent?.includes(nightDate))!
    const cells = Array.from(nightRow.querySelectorAll('td')).map(td => td.textContent)
    expect(cells[unclassifiedCol]).toBe('-1.0') // signed, not floored at 0

    expect(container.textContent).toContain(
      'Ночей, где сумма фаз больше общего сна: 1. Источник записал фазы и общий сон независимо; значения показаны как есть, без правки.',
    )
  })

  it('dates a bedtime that spans midnight and shows the median bed/wake rows — in the DOM, not the model', async () => {
    // Same shape as the markdown-level test: a night that ran 02:14 (previous
    // calendar day) -> 01:55 (the row's own day), rendered through the print
    // view so a renderer that dropped the date suffix would be caught here too.
    const base = new Date()
    const dateAt = (daysAgo: number) => {
      const d = new Date(base)
      d.setDate(d.getDate() - daysAgo)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    const nightDate = dateAt(0)
    const prevDate = dateAt(1)
    const ddmm = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`
    const nightDaily: DailyMetrics[] = [{
      date: nightDate, sleepHours: 7.3,
      sleepBedtime: `${prevDate}T02:14:00`, sleepWakeTime: `${nightDate}T01:55:00`,
    }]

    const { container } = renderWithProviders(
      <DoctorReport user={user} daily={nightDaily} onClose={() => {}} />)
    fireEvent.click(screen.getByText('30'))
    fireEvent.click(screen.getByText(ui('Сформировать')))
    await waitFor(() => expect(container.querySelector('.dr-sleep-table')).toBeTruthy())

    const nightRow = Array.from(container.querySelectorAll('.dr-sleep-table tbody tr'))
      .find(tr => tr.textContent?.includes(nightDate))
    expect(nightRow?.textContent).toContain(`02:14 (${ddmm(prevDate)})`)
    expect(nightRow?.textContent).not.toContain('01:55 (')

    const metricRows = Array.from(container.querySelectorAll('table tbody tr'))
    const bedtimeRow = metricRows.find(tr => tr.textContent?.includes('Время отбоя (медиана)'))
    const wakeRow = metricRows.find(tr => tr.textContent?.includes('Время подъёма (медиана)'))
    expect(bedtimeRow?.textContent).toContain('02:14')
    expect(bedtimeRow?.textContent).toContain('половина ночей 02:14–02:14')
    expect(wakeRow?.textContent).toContain('01:55')
    expect(wakeRow?.textContent).toContain('половина ночей 01:55–01:55')

    // Coverage, not a dash — same "N из M" the metric rows above carry.
    expect(bedtimeRow?.textContent).toContain('1 из 1')
    expect(wakeRow?.textContent).toContain('1 из 1')
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

  it('describes recovery renormalising around a missing input, instead of claiming the day is excluded', async () => {
    const { container } = renderWithProviders(
      <DoctorReport user={user} daily={daily} onClose={() => {}} />)
    fireEvent.click(screen.getByText(ui('Сформировать')))
    await screen.findByText('Оценки Tonus (0–100, расчёт приложения)')

    expect(container.textContent).toContain(
      'Если одного из показателей не хватает, вес пересчитывается на оставшиеся: день с одним лишь пульсом покоя (без HRV) всё равно даёт оценку восстановления.',
    )
    expect(container.textContent).not.toContain('он в него не входит')
  })

  it('drops the load row and shows day counts on the printed scores table', async () => {
    const { container } = renderWithProviders(
      <DoctorReport user={user} daily={daily} onClose={() => {}} />)
    fireEvent.click(screen.getByText(ui('Сформировать')))
    const heading = await screen.findByText('Оценки Tonus (0–100, расчёт приложения)')
    const table = heading.closest('section')!.querySelector('table')!

    const rowLabels = Array.from(table.querySelectorAll('tbody tr td:first-child'))
      .map(td => td.textContent)
    expect(rowLabels).toEqual(['Сон', 'Восстановление'])
    expect(rowLabels).not.toContain('Нагрузка')

    const headerCells = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent)
    expect(headerCells).toContain('Дней с данными')
    expect(headerCells).toContain('Тренд')

    const daysCell = table.querySelector('tbody tr td:last-child')!
    // "N из M" against the period's calendar days, same as every metric row.
    expect(daysCell.textContent).toMatch(/^\d+ из \d+$/)
    expect(Number(daysCell.textContent!.split(' из ')[0])).toBeGreaterThan(0)

    expect(container.querySelector('.dr-doc')?.textContent).toContain(
      'Сон: часы сна к 8 ч; 8 ч и больше — 100.',
    )
  })

  it('shows "не рассчитан" instead of a fabricated score when the last third of the period is mostly empty', async () => {
    const base = new Date()
    const dateAt = (daysAgo: number) => {
      const d = new Date(base)
      d.setDate(d.getDate() - daysAgo)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    // 60 days of history (needed for the score baseline) with the most
    // recent ~19 days blanked — the last third of a 30-day period ends up
    // mostly empty, same shape as the model/markdown-level gappy fixtures.
    const daily60: DailyMetrics[] = Array.from({ length: 60 }, (_, i) => ({
      date: dateAt(59 - i),
      restingHeartRate: 58, hrv: 45, sleepHours: 7, steps: 9000,
    }))
    const gappy = daily60.map((d, i) => (i > 40 ? { date: d.date } : d))

    const { container } = renderWithProviders(
      <DoctorReport user={user} daily={gappy} onClose={() => {}} />)
    fireEvent.click(screen.getByText('30'))
    fireEvent.click(screen.getByText(ui('Сформировать')))
    const heading = await screen.findByText('Оценки Tonus (0–100, расчёт приложения)')
    const table = heading.closest('section')!.querySelector('table')!

    const sleepRow = Array.from(table.querySelectorAll('tbody tr'))
      .find(tr => tr.textContent?.startsWith('Сон'))!
    const cells = Array.from(sleepRow.querySelectorAll('td')).map(td => td.textContent)
    expect(cells[2]).toBe('—') // "Начало периода" — no fabricated score
    expect(cells[3]).toBe('—') // "Конец периода"
    expect(cells[4]).toBe('не рассчитан') // "Тренд"

    expect(container.textContent).not.toMatch(/Нагрузка/)
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

  it('hides the weekly table for a single week, and formats a multi-week table to the metric\'s digits — in the DOM, not just markdown', async () => {
    // periodFrame clamps to the actual data span regardless of which period
    // button is selected, so a short fixture pins the week count without
    // needing to fake the period selector. The wall clock is pinned so the
    // fixture's dates land on real, predictable calendar weeks.
    const isoDate = (d: Date) => d.toISOString().slice(0, 10)
    const addUtcDays = (iso: string, n: number) => {
      const d = new Date(iso + 'T00:00:00Z')
      d.setUTCDate(d.getUTCDate() + n)
      return isoDate(d)
    }

    vi.setSystemTime(new Date('2026-07-26T12:00:00Z')) // Sunday, closes the single week below
    const oneWeek: DailyMetrics[] = Array.from({ length: 7 }, (_, i) => ({
      date: addUtcDays('2026-07-20', i), sleepHours: 7, restingHeartRate: 58,
    }))
    const { unmount: unmountOne } = renderWithProviders(
      <DoctorReport user={user} daily={oneWeek} onClose={() => {}} />)
    fireEvent.click(screen.getByText(ui('Сформировать')))
    await waitFor(() => expect(screen.getByText('Метрики за период')).toBeTruthy())
    expect(screen.queryByText('Динамика по неделям')).toBeNull()
    unmountOne()

    vi.setSystemTime(new Date('2026-08-02T12:00:00Z')) // Sunday, closes a second full week
    const twoWeeks: DailyMetrics[] = Array.from({ length: 14 }, (_, i) => ({
      date: addUtcDays('2026-07-20', i), sleepHours: 7, restingHeartRate: 58,
    }))
    renderWithProviders(
      <DoctorReport user={user} daily={twoWeeks} onClose={() => {}} />)
    fireEvent.click(screen.getByText(ui('Сформировать')))
    const heading = await screen.findByText('Динамика по неделям')

    const weekRow = Array.from(heading.closest('section')!.querySelectorAll('table:last-of-type tbody tr'))
      .find(tr => tr.textContent?.includes('2026-07-20'))!
    // weeklyRows() pre-rounds to the metric's digits (sleep: 1); the cell
    // must print through the same toFixed, or a value the model already
    // rounded to "7" prints as the bare number instead of "7.0".
    expect(Array.from(weekRow.querySelectorAll('td')).some(td => td.textContent === '7.0')).toBe(true)
  })
})
