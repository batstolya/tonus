import { describe, it, expect } from 'vitest'
import { toMarkdown, MISSING_LINES } from './markdown'
import { buildReportModel } from './model'
import { addDays } from './dates'
import type { DailyMetrics } from '../../types'

const today = '2026-07-31'
const daily: DailyMetrics[] = Array.from({ length: 30 }, (_, i) => ({
  date: addDays(today, -29 + i),
  restingHeartRate: 58, sleepHours: 7, steps: 9000,
}))
const sources = {
  labs: [], supplements: [], supplementLogs: [], concerns: [], concernLogs: [], notes: [], intake: [],
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

  it('names the age line instead of doubling the patient label', () => {
    const filled = buildReportModel({
      daily, periodDays: 30, today,
      sources: { ...sources, profile: { birth_year: 1988, sex: 'male' } },
    })
    const md = toMarkdown(filled, 'ru')
    expect(md).toContain('**Возраст (по году рождения):** 38 · Пол: мужской')
    expect(md).not.toContain('**Пациент:**')
  })

  it('always closes with what the data does not contain', () => {
    expect(toMarkdown(model, 'ru')).toContain('## Чего в этих данных нет')
  })

  it('names the data the app holds but the report leaves out', () => {
    const md = toMarkdown(model, 'ru')
    expect(md).toContain('События (болезнь, стресс, поездки), еду и воду')
    expect(md).toContain('Время и длительность')
  })

  it('no longer lists the intake it now prints', () => {
    const md = toMarkdown(model, 'ru')
    const closing = md.slice(md.indexOf('## Чего в этих данных нет'))
    expect(closing).not.toContain('Кофе, алкоголь, лекарства и события')
  })

  it('holds exactly these nine lines — a bad merge that drops one should fail here first', () => {
    // Written out rather than derived from the export: this is the
    // independent check that catches drift in MISSING_LINES itself.
    expect(MISSING_LINES).toEqual([
      'Артериального давления, веса, роста, температуры тела',
      'Диагнозов, назначений врача и рецептурных препаратов (учитываются только добавки, отмеченные пациентом)',
      'Питания',
      'ЭКГ, аритмий и любых клинических измерений',
      'Время и длительность эпизодов низкого или высокого пульса: в отчёте есть только суточные минимум, максимум и среднее',
      'Тип тренировки и пульс во время неё: есть только минуты упражнений и активные калории',
      'Время в постели, засыпание, ночные пробуждения и эффективность сна',
      'События (болезнь, стресс, поездки), еду и воду пациент отмечает в приложении, но в этот отчёт они не включены; кофе, алкоголь и лекарства — включены отдельной секцией',
      'Всё перечисленное отсутствует, а не равно нулю: не делай выводов о том, чего здесь нет.',
    ])
  })

  it('prints every "what this data does not contain" line in the rendered markdown', () => {
    const md = toMarkdown(model, 'ru')
    for (const line of MISSING_LINES) expect(md).toContain(line)
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

  it('prints the sleep time no phase accounts for, and the phase-coverage line', () => {
    // Same fixture as sleep.test.ts: 9.1 h total, 1.8 deep + 2.1 REM + 2.4 core
    // classify only 6.3 h — 2.8 h are sleep the source never attributed to a phase.
    const nightDaily: DailyMetrics[] = [{
      date: '2026-07-25', sleepHours: 9.1, sleepDeep: 1.8, sleepREM: 2.1, sleepCore: 2.4,
      sleepBedtime: '2026-07-25T01:00:00',
    }]
    const nightModel = buildReportModel({ daily: nightDaily, sources, periodDays: 30, today: '2026-07-31' })

    const md = toMarkdown(nightModel, 'ru')
    const header = md.split('\n').find(l => l.startsWith('| Дата |'))!
    const headerCells = header.split('|').map(c => c.trim())
    expect(headerCells[headerCells.indexOf('Не классифицировано, ч')]).toBe('Не классифицировано, ч')

    const row = md.split('\n').find(l => l.startsWith('| 2026-07-25 |'))!
    const cells = row.split('|').map(c => c.trim())
    // Same column index as the header's "Не классифицировано, ч" — pinned so
    // a column reorder fails here instead of a loose substring match passing.
    expect(cells[headerCells.indexOf('Не классифицировано, ч')]).toBe('2.8')
    expect(md).toContain('Разложено по фазам: 69% измеренного ночного сна.')
  })

  it('prints negative unclassified hours and the overshoot note when phases sum past the total', () => {
    const nightDaily: DailyMetrics[] = [
      { date: '2026-07-24', sleepHours: 8, sleepDeep: 2, sleepREM: 1.6, sleepCore: 4.4 }, // exact, no overshoot
      { date: '2026-07-25', sleepHours: 6, sleepDeep: 3, sleepREM: 3, sleepCore: 1 },     // 7 of 6 h — overshoots
    ]
    const nightModel = buildReportModel({ daily: nightDaily, sources, periodDays: 30, today: '2026-07-31' })
    expect(nightModel.sleep!.phasesOverTotal).toBe(1)

    const md = toMarkdown(nightModel, 'ru')
    const row = md.split('\n').find(l => l.startsWith('| 2026-07-25 |'))!
    expect(row).toContain('-1.0') // signed, not floored at 0
    expect(md).toContain('Ночей, где сумма фаз больше общего сна: 1. Источник записал фазы и общий сон независимо; значения показаны как есть, без правки.')
  })

  it('never mentions phase overshoot when no night has one', () => {
    const md = toMarkdown(model, 'ru')
    expect(md).not.toContain('Ночей, где сумма фаз больше общего сна')
  })

  it('shows the "Доля дней с отметкой" adherence header and note when the supplements section actually renders', () => {
    // markdown.test.ts's shared fixture always passes supplements: [] — the
    // `if (model.supplements.length)` branch has never executed here. A
    // logged intake exercises the real branch and pins the new wording.
    const supplementsSources = {
      ...sources,
      supplements: [{
        id: 's1', user_id: 'u1', name: 'Магний', default_dose: '400', unit: 'мг',
        active: true, sort_order: 0, created_at: '2026-07-01', stock_count: null,
      }],
      supplementLogs: [{ supplement_id: 's1', date: today, taken: true }],
    }
    const supplementsModel = buildReportModel({ daily, sources: supplementsSources, periodDays: 30, today })
    expect(supplementsModel.supplements.length).toBeGreaterThan(0) // the branch actually runs

    const md = toMarkdown(supplementsModel, 'ru')
    expect(md).toContain('Магний')
    expect(md).toContain('Доля дней с отметкой')
    expect(md).toContain('Показана доля дней с отметкой о приёме, считая от первого отмеченного приёма внутри периода. Отсутствие отметки не означает, что приём не состоялся.')
    expect(md).not.toContain('Соблюдение в периоде')
  })

  it('dates a bedtime that spans midnight and reports median bed/wake times', () => {
    // A real midnight-spanning night: to bed at 23:40, up at 07:10 next day.
    const nightDaily: DailyMetrics[] = [{
      date: '2026-06-13', sleepHours: 7.3,
      sleepBedtime: '2026-06-12T23:40:00', sleepWakeTime: '2026-06-13T07:10:00',
    }]
    const nightModel = buildReportModel({ daily: nightDaily, sources, periodDays: 1, today: '2026-06-13' })

    const md = toMarkdown(nightModel, 'ru')
    const row = md.split('\n').find(l => l.startsWith('| 2026-06-13 |'))!
    expect(row).toContain('23:40 (12.06)') // bedtime lands on the previous day
    expect(row).not.toContain('07:10 (')   // wake time is the row's own day

    expect(md).toContain('Время отбоя (медиана) | 23:40 | половина ночей 23:40–23:40')
    expect(md).toContain('Время подъёма (медиана) | 07:10 | половина ночей 07:10–07:10')

    // The bedtime/wake rows carry coverage too, same as every metric row —
    // "N из M" against the period's calendar days, not a dash.
    const bedtimeRow = md.split('\n').find(l => l.startsWith('| Время отбоя (медиана) |'))!
    const wakeRow = md.split('\n').find(l => l.startsWith('| Время подъёма (медиана) |'))!
    expect(bedtimeRow).toContain('1 из 1')
    expect(wakeRow).toContain('1 из 1')
  })

  it('marks the night whose bed window cannot hold it, and leaves it out of the medians', () => {
    // The production row for 2026-06-13: bedtime 02:14, wake 01:55 the next
    // day — a 23h41m window around 7.3h of sleep. Printing a median bedtime
    // of 02:14 from it would launder a broken session into a sleep habit.
    const broken: DailyMetrics = {
      date: '2026-06-13', sleepHours: 7.3,
      sleepBedtime: '2026-06-12T02:14:00', sleepWakeTime: '2026-06-13T01:55:00',
    }
    const sane: DailyMetrics = {
      date: '2026-06-14', sleepHours: 7.1,
      sleepBedtime: '2026-06-13T23:30:00', sleepWakeTime: '2026-06-14T06:40:00',
    }
    const m = buildReportModel({ daily: [broken, sane], sources, periodDays: 2, today: '2026-06-14' })

    expect(m.sleep!.suspiciousNights).toBe(1)
    expect(m.sleep!.bedtime!.count).toBe(1)

    const md = toMarkdown(m, 'ru')
    expect(md.split('\n').find(l => l.startsWith('| 2026-06-13 |'))).toContain('⚠')
    expect(md.split('\n').find(l => l.startsWith('| 2026-06-14 |'))).not.toContain('⚠')
    expect(md).toContain('Ночей, где промежуток между отбоем и подъёмом не может вместить записанный сон')
    expect(md).toContain('Время отбоя (медиана) | 23:30')
  })

  it('describes recovery renormalising around a missing input, instead of claiming the day is excluded', () => {
    // The old wording ("a day without HRV does not lower recovery, it's
    // simply not in it") was false: _shared/scores.ts renormalises the
    // remaining weight, so a day with only resting heart rate still yields a
    // recovery score — it's counted, just on a smaller input set.
    const md = toMarkdown(model, 'ru')
    expect(md).toContain('Если одного из показателей не хватает, вес пересчитывается на оставшиеся: день с одним лишь пульсом покоя (без HRV) всё равно даёт оценку восстановления.')
    expect(md).not.toContain('он в него не входит')
  })

  it('drops the load row and prints day counts on the scores that remain', () => {
    const md = toMarkdown(model, 'ru')
    expect(md).not.toContain('| Нагрузка |')
    expect(md).toContain('| Оценка | Среднее за период | Начало периода | Конец периода | Тренд | Дней с данными |')
    const sleepRow = md.split('\n').find(l => l.startsWith('| Сон |'))!
    const cells = sleepRow.split('|').map(c => c.trim())
    expect(cells[1]).toBe('Сон')
    // "Дней с данными" column — printed as "N из M" against the period's
    // calendar days, same as every metric row.
    expect(cells[6]).toMatch(/^\d+ из \d+$/)
    expect(Number(cells[6].split(' из ')[0])).toBeGreaterThan(0)
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

  it('never prints an unparsed reference range next to a claim that none was given', () => {
    const withLabs = buildReportModel({
      daily,
      sources: { ...sources, labs: [{ id: '1', lab_file_id: 'f', marker: 'TSH', value: 2.1, unit: 'мЕд/л', ref_range: '0.4-4.0 мЕд/л', date: '2026-07-20' }] },
      periodDays: 30, today,
    })
    const md = toMarkdown(withLabs, 'ru')
    const row = md.split('\n').find(l => l.startsWith('| TSH |'))!
    expect(row).toContain('0.4-4.0 мЕд/л') // the range still prints in its own column
    expect(row).toContain('референс лаборатории не распознан')
    expect(row).not.toContain('лаборатория не указала референс')
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

  it('hides the weekly table for a single week and shows a formatted one for two or more', () => {
    // '2026-07-20' is a Monday, so 7 consecutive days is exactly one ISO
    // week and 14 is exactly two — no ambiguity from where the week starts.
    const oneWeek: DailyMetrics[] = Array.from({ length: 7 }, (_, i) => ({
      date: addDays('2026-07-20', i), sleepHours: 7, restingHeartRate: 58,
    }))
    const oneWeekModel = buildReportModel({ daily: oneWeek, sources, periodDays: 7, today: '2026-07-26' })
    expect(oneWeekModel.weekly.rows).toHaveLength(1)
    expect(toMarkdown(oneWeekModel, 'ru')).not.toContain('## Динамика по неделям')

    const twoWeeks: DailyMetrics[] = Array.from({ length: 14 }, (_, i) => ({
      date: addDays('2026-07-20', i), sleepHours: 7, restingHeartRate: 58,
    }))
    const twoWeekModel = buildReportModel({ daily: twoWeeks, sources, periodDays: 14, today: '2026-08-02' })
    expect(twoWeekModel.weekly.rows.length).toBeGreaterThan(1)
    const mdTwo = toMarkdown(twoWeekModel, 'ru')
    expect(mdTwo).toContain('## Динамика по неделям')

    // weeklyRows() pre-rounds to the metric's own digits (sleep: 1) — the
    // cell has to print through the same toFixed, or a value the model
    // already rounded to 7 would print bare instead of "7.0".
    const weeklySection = mdTwo.split('## Сон по дням')[0]
    const weekRow = weeklySection.split('\n').find(l => l.startsWith('| 2026-07-20 |'))!
    expect(weekRow).toContain('7.0')
  })

  it('never merges a percentage and an absolute count of the same marker into one delta', () => {
    const withLabs = buildReportModel({
      daily,
      sources: {
        ...sources,
        labs: [
          // sample_date mirrors date, the shape every stored row now has.
          { id: '1', lab_file_id: 'f', marker: 'LINFOCITOS', value: 42.2, unit: '%', date: '2026-06-01', sample_date: '2026-06-01', sample_date_precision: 'day' },
          { id: '2', lab_file_id: 'f', marker: 'LINFOCITOS', value: 40.1, unit: '%', date: '2026-06-20', sample_date: '2026-06-20', sample_date_precision: 'day' },
          { id: '3', lab_file_id: 'f', marker: 'LINFOCITOS', value: 2.16, unit: '10E3/µL', date: '2026-06-20', sample_date: '2026-06-20', sample_date_precision: 'day' },
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
    expect(md).toContain('Дата — это дата забора материала, а не загрузки файла')
  })
})

describe('toMarkdown — lab sample dates', () => {
  const labModel = (labs: unknown[]) => buildReportModel({
    daily, sources: { ...sources, labs } as typeof sources, periodDays: 30, today,
  })

  it('prints a month-precision date as the month, not as its first day', () => {
    const md = toMarkdown(labModel([
      { id: '1', lab_file_id: 'f', marker: 'FERRITINA', value: 85, unit: 'ng/mL',
        date: '2026-06-20', sample_date: '2024-09-01', sample_date_precision: 'month', analyte_key: 'ferritin' },
    ]), 'ru')
    expect(md).toContain('09.2024')
    expect(md).not.toContain('2024-09-01')
  })

  it('says the sample date is unknown instead of printing the upload date', () => {
    const md = toMarkdown(labModel([
      { id: '1', lab_file_id: 'f', marker: 'FERRITINA', value: 85, unit: 'ng/mL',
        date: '2026-06-20', sample_date: null, sample_date_precision: 'unknown', analyte_key: 'ferritin' },
    ]), 'ru')
    expect(md).toContain('дата сдачи неизвестна')
    expect(md).not.toContain('2026-06-20')
  })

  it('names the order as unknown when two results share one month', () => {
    const md = toMarkdown(labModel([
      { id: '1', lab_file_id: 'f', marker: 'FERRITINA', value: 85, unit: 'ng/mL',
        date: '2026-06-20', sample_date: '2025-09-01', sample_date_precision: 'month', analyte_key: 'ferritin' },
      { id: '2', lab_file_id: 'f', marker: 'Ferrytyna (L05)', value: 68, unit: 'ng/mL',
        date: '2026-06-20', sample_date: '2025-09-01', sample_date_precision: 'month', analyte_key: 'ferritin' },
    ]), 'ru')
    expect(md).toContain('порядок внутри месяца неизвестен')
  })

  it('no longer claims the date comes from the upload form', () => {
    const md = toMarkdown(labModel([
      { id: '1', lab_file_id: 'f', marker: 'FERRITINA', value: 85, unit: 'ng/mL',
        date: '2026-06-20', sample_date: '2024-09-01', sample_date_precision: 'month', analyte_key: 'ferritin' },
    ]), 'ru')
    expect(md).not.toContain('Дата берётся из формы загрузки файла')
  })

  it('counts the markers the analyte dictionary did not recognise', () => {
    const md = toMarkdown(labModel([
      { id: '1', lab_file_id: 'f', marker: 'Неведомый маркер', value: 1, unit: 'ед',
        date: '2026-06-20', sample_date: '2025-01-01', sample_date_precision: 'day', analyte_key: null },
      { id: '2', lab_file_id: 'f', marker: 'FERRITINA', value: 85, unit: 'ng/mL',
        date: '2026-06-20', sample_date: '2024-09-01', sample_date_precision: 'month', analyte_key: 'ferritin' },
    ]), 'ru')
    expect(md).toContain('Показателей без распознанного названия: 1')
  })
})
