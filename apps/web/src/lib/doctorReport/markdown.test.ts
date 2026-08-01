import { describe, it, expect } from 'vitest'
import { toMarkdown } from './markdown'
import { buildReportModel } from './model'
import { addDays } from './dates'
import type { DailyMetrics } from '../../types'

const today = '2026-07-31'
const daily: DailyMetrics[] = Array.from({ length: 30 }, (_, i) => ({
  date: addDays(today, -29 + i),
  restingHeartRate: 58, sleepHours: 7, steps: 9000,
}))
const sources = {
  labs: [], supplements: [], supplementLogs: [], concerns: [], concernLogs: [], notes: [],
  profile: null,
}
const model = buildReportModel({ daily, sources, periodDays: 30, today })

describe('toMarkdown', () => {
  it('opens with the title, period and source disclaimer', () => {
    const md = toMarkdown(model, 'ru')
    expect(md.startsWith('# Сводка данных здоровья')).toBe(true)
    expect(md).toContain(`${model.period.effectiveStart} — ${today}`)
    expect(md).toContain('**Пациент:** ________________')
  })

  it('renders the calendar-days / with-data / empty-days header facts', () => {
    // 30 calendar days, records on all but two — a clean 30 / 28 / 2 split.
    const gappyDaily: DailyMetrics[] = Array.from({ length: 30 }, (_, i) => ({
      date: addDays(today, -29 + i),
      restingHeartRate: 58, sleepHours: 7, steps: 9000,
    })).filter(d => d.date !== addDays(today, -10) && d.date !== addDays(today, -20))
    const gappyModel = buildReportModel({ daily: gappyDaily, sources, periodDays: 30, today })
    expect(gappyModel.period.clamped).toBe(false)

    const md = toMarkdown(gappyModel, 'ru')
    expect(md).toContain(
      'Качество данных:** календарных дней 30 · дней хотя бы с одной записью 28 · полностью пустых дней 2',
    )
  })

  it('names the clamp when the requested period outruns the history', () => {
    // Only 10 days of history, but a 365-day period is requested.
    const shortDaily: DailyMetrics[] = Array.from({ length: 10 }, (_, i) => ({
      date: addDays(today, -9 + i),
      restingHeartRate: 58, sleepHours: 7, steps: 9000,
    }))
    const clampedModel = buildReportModel({ daily: shortDaily, sources, periodDays: 365, today })
    expect(clampedModel.period.clamped).toBe(true)
    expect(clampedModel.period.effectiveStart).toBe(addDays(today, -9))

    const md = toMarkdown(clampedModel, 'ru')
    expect(md).toContain(
      `Запрошенный период:** 365 дней, но данные начинаются ${addDays(today, -9)} — знаменатель считается от этой даты`,
    )
  })

  it('always closes with what the data does not contain', () => {
    expect(toMarkdown(model, 'ru')).toContain('## Чего в этих данных нет')
  })

  it('names the data the app holds but the report leaves out', () => {
    const md = toMarkdown(model, 'ru')
    expect(md).toContain('Кофе, алкоголь, лекарства')
    expect(md).toContain('Время и длительность')
  })

  it('keeps sections in the same order every time', () => {
    const md = toMarkdown(model, 'ru')
    const order = ['## Оценки', '## Метрики за период', '## Динамика по неделям',
      '## Сон по дням', '## Покрытие данных', '## Отклонения', '## Анализы',
      '## Добавки', '## Проблемы', '## Самочувствие', '## Чего в этих данных нет']
    const positions = order.map(h => md.indexOf(h)).filter(i => i >= 0)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  it('translates headings for the en report', () => {
    const md = toMarkdown(model, 'en')
    expect(md).toContain('# Health data summary')
    expect(md).not.toContain('Сводка данных здоровья')
  })

  it('renders one markdown table row per night', () => {
    const rows = toMarkdown(model, 'ru').split('\n').filter(l => /^\| 2026-/.test(l))
    expect(rows.length).toBeGreaterThanOrEqual(30)
  })

  it('shows a median and range for a metric with a full pre-period window, and refuses one for a metric below the coverage band', () => {
    // 28 days before the period, feeding the baseline window — same shape the
    // reliability.test.ts baselineOf tests use: median 48, range 46–50.
    const preDays: DailyMetrics[] = Array.from({ length: 28 }, (_, i) => ({
      date: addDays(today, -29 - 28 + i),
      restingHeartRate: 44 + (i % 10),
    }))
    // 30 days in the period: rhr fully covered (well above the pre-period
    // range), hrv present on only every fourth day — below the coverage band.
    const periodDays: DailyMetrics[] = Array.from({ length: 30 }, (_, i) => ({
      date: addDays(today, -29 + i),
      restingHeartRate: 60,
      hrv: i % 4 === 0 ? 45 : undefined,
    }))
    const m = buildReportModel({ daily: [...preDays, ...periodDays], sources, periodDays: 30, today })

    const rhr = m.metrics.find(x => x.key === 'rhr')!
    expect(rhr.baseline).toEqual({ median: 48, lo: 46, hi: 50, days: 28, position: 'above' })
    const hrv = m.metrics.find(x => x.key === 'hrv')!
    expect(hrv.baseline).toBeNull()

    const md = toMarkdown(m, 'ru')
    expect(md).toContain('медиана 48 · 46–50 · выше диапазона')
    const hrvRow = md.split('\n').find(l => l.startsWith('| HRV, мс |'))
    expect(hrvRow).toBeDefined()
    expect(hrvRow).toContain('данных недостаточно')
  })

  it('marks a daytime nap in the sleep table and reports it in the summary line', () => {
    // A 1.9 h doze starting at 09:08 next to a real 7.2 h night.
    const nap: DailyMetrics = { date: '2026-07-30', sleepHours: 1.9, sleepBedtime: '2026-07-30T09:08:00' }
    const night: DailyMetrics = { date: '2026-07-31', sleepHours: 7.2, sleepBedtime: '2026-07-31T01:10:00' }
    const napModel = buildReportModel({ daily: [nap, night], sources, periodDays: 2, today })

    expect(napModel.sleep!.total).toBe(1)
    expect(napModel.sleep!.daytimeCount).toBe(1)

    const md = toMarkdown(napModel, 'ru')
    const rows = md.split('\n').filter(l => /^\| 2026-07-3[01] \|/.test(l))
    expect(rows.find(r => r.startsWith('| 2026-07-30'))).toContain('дневной эпизод')
    expect(rows.find(r => r.startsWith('| 2026-07-31'))).not.toContain('дневной эпизод')
    expect(md).toContain('Ночей в периоде: 1. Короче 6 ч: 0. От 8 ч: 0. Без записи ночного сна:')
    expect(md).toContain('Дневных эпизодов: 1.')
    expect(md).toContain('Дневные эпизоды (короче 3 ч, начались между 08:00 и 20:00) показаны в таблице, но не входят в подсчёт ночей, в средние времена и в оценку сна.')
  })

  it('dates a bedtime that spans midnight and reports median bed/wake times', () => {
    // Same fixture as sleep.test.ts: a night that ran 02:14 -> 01:55, dated
    // against the row's own calendar day (no 'Z' suffix — local time, same
    // as the daytime-episode fixtures use).
    const nightDaily: DailyMetrics[] = [{
      date: '2026-06-13', sleepHours: 7.3,
      sleepBedtime: '2026-06-12T02:14:00', sleepWakeTime: '2026-06-13T01:55:00',
    }]
    const nightModel = buildReportModel({ daily: nightDaily, sources, periodDays: 1, today: '2026-06-13' })

    const md = toMarkdown(nightModel, 'ru')
    const row = md.split('\n').find(l => l.startsWith('| 2026-06-13 |'))!
    expect(row).toContain('02:14 (12.06)') // bedtime lands on the previous day
    expect(row).not.toContain('01:55 (')   // wake time is the row's own day

    expect(md).toContain('Время отбоя (медиана) | 02:14 | половина ночей 02:14–02:14')
    expect(md).toContain('Время подъёма (медиана) | 01:55 | половина ночей 01:55–01:55')
  })

  it('drops the load row and prints day counts on the scores that remain', () => {
    const md = toMarkdown(model, 'ru')
    expect(md).not.toContain('| Нагрузка |')
    expect(md).toContain('| Оценка | Среднее за период | Начало периода | Конец периода | Тренд | Дней с данными |')
    const sleepRow = md.split('\n').find(l => l.startsWith('| Сон |'))!
    const cells = sleepRow.split('|').map(c => c.trim())
    expect(cells[1]).toBe('Сон')
    expect(Number(cells[6])).toBeGreaterThan(0) // "Дней с данными" column
  })

  it('refuses a score trend and prints "не рассчитан" when the last third of the period is mostly empty', () => {
    const daily60: DailyMetrics[] = Array.from({ length: 60 }, (_, i) => ({
      date: addDays(today, -59 + i),
      restingHeartRate: 58, hrv: 45, sleepHours: 7, steps: 9000,
    }))
    const gappy = daily60.map((d, i) => (i > 40 ? { date: d.date } : d))
    const gappyModel = buildReportModel({ daily: gappy, sources, periodDays: 30, today })

    const md = toMarkdown(gappyModel, 'ru')
    const sleepRow = md.split('\n').find(l => l.startsWith('| Сон |'))!
    const cells = sleepRow.split('|').map(c => c.trim())
    expect(cells[3]).toBe('—') // "Начало периода" — no fabricated score
    expect(cells[4]).toBe('—') // "Конец периода"
    expect(cells[5]).toBe('не рассчитан') // "Тренд"
  })

  it('prints the reliability band and longest gap for a metric with a hole', () => {
    // Steps miss five consecutive days in the middle of the period; rhr and
    // sleep stay complete so only the steps row should carry a gap note.
    const gapDates = new Set([-20, -19, -18, -17, -16].map(n => addDays(today, n)))
    const gappyDaily: DailyMetrics[] = daily.map(d =>
      gapDates.has(d.date) ? { date: d.date, restingHeartRate: d.restingHeartRate, sleepHours: d.sleepHours } : d)
    const gappyModel = buildReportModel({ daily: gappyDaily, sources, periodDays: 30, today })

    const stepsRow = gappyModel.metrics.find(m => m.key === 'steps')!
    expect(stepsRow.reliability.maxGap).toBe(5)
    expect(stepsRow.reliability.band).toBe('high') // 25/30 ≈ 83%, still above the 80% line

    const md = toMarkdown(gappyModel, 'ru')
    expect(md).toContain('Надёжность') // the column header
    expect(md).toContain('высокая, макс. пробел 5 дн.') // the steps row's reliability cell
  })

  it('never calls a lab result normal on its own authority', () => {
    const withLabs = buildReportModel({
      daily,
      sources: { ...sources, labs: [{ id: '1', lab_file_id: 'f', marker: 'LDL', value: 147, unit: 'mg/dL', date: '2026-07-20' }] },
      periodDays: 30, today,
    })
    const md = toMarkdown(withLabs, 'ru')
    expect(md).toContain('статус не определён')
    expect(md).not.toContain('в норме')
    expect(md).not.toContain('Нагрузка')
  })

  it('names the range as the source when a lab result has a parseable reference', () => {
    const withLabs = buildReportModel({
      daily,
      sources: { ...sources, labs: [{ id: '1', lab_file_id: 'f', marker: 'LDL', value: 147, unit: 'mg/dL', ref_range: '0-115', date: '2026-07-20' }] },
      periodDays: 30, today,
    })
    const md = toMarkdown(withLabs, 'ru')
    const row = md.split('\n').find(l => l.startsWith('| LDL |'))!
    expect(row).toContain('выше диапазона лаборатории')
    expect(row).not.toContain('по флагу лаборатории')
  })

  it('names the lab flag as the source when the range does not parse', () => {
    const withLabs = buildReportModel({
      daily,
      sources: { ...sources, labs: [{ id: '1', lab_file_id: 'f', marker: 'LDL', value: 147, unit: 'mg/dL', flag: 'high', date: '2026-07-20' }] },
      periodDays: 30, today,
    })
    const md = toMarkdown(withLabs, 'ru')
    const row = md.split('\n').find(l => l.startsWith('| LDL |'))!
    expect(row).toContain('выше диапазона лаборатории (по флагу лаборатории)')
  })

  it('never merges a percentage and an absolute count of the same marker into one delta', () => {
    const withLabs = buildReportModel({
      daily,
      sources: {
        ...sources,
        labs: [
          { id: '1', lab_file_id: 'f', marker: 'LINFOCITOS', value: 42.2, unit: '%', date: '2026-06-01' },
          { id: '2', lab_file_id: 'f', marker: 'LINFOCITOS', value: 40.1, unit: '%', date: '2026-06-20' },
          { id: '3', lab_file_id: 'f', marker: 'LINFOCITOS', value: 2.16, unit: '10E3/µL', date: '2026-06-20' },
        ],
      },
      periodDays: 30, today,
    })
    const md = toMarkdown(withLabs, 'ru')
    // Scope to the main labs table only — the "all measurements" table below
    // it also lists one row per series and would double-count the percentage.
    const mainTable = md.split('### ')[0]
    const rows = mainTable.split('\n').filter(l => l.startsWith('| LINFOCITOS |'))
    expect(rows).toHaveLength(2) // percentage and count stay two rows, never merged
    const countRow = rows.find(r => r.includes('10E3/µL'))!
    expect(countRow).not.toContain(' к ') // single measurement in its own unit — no delta to print
    const pctRow = rows.find(r => r.includes('%'))!
    expect(pctRow).toContain('к 2026-06-01') // the percentage series still gets its own real delta
    expect(md).toContain('Показатели с одинаковым названием в разных единицах показаны отдельными строками и не сравниваются между собой.')
    expect(md).toContain('Дата берётся из формы загрузки файла')
  })
})
