import { describe, it, expect } from 'vitest'
import { toMarkdown } from './markdown'
import { buildReportModel } from './model'
import { addDays } from './metrics'
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
})
