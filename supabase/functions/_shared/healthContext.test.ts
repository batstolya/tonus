import { describe, it, expect } from 'vitest'
import { buildHealthContext, healthContextToText, type HealthContext } from './healthContext'

// Стаб supabase: любая цепочка .from(...).select()... резолвится в { data }
// по имени таблицы. Достаточно для проверки маппинга и рендера текста.
function stubSupabase(dataByTable: Record<string, unknown[]>) {
  return {
    from(table: string) {
      const result = { data: dataByTable[table] ?? [] }
      const chain: Record<string, unknown> = {}
      const self = new Proxy(chain, {
        get(_t, prop: string) {
          if (prop === 'then') {
            return (resolve: (v: { data: unknown }) => void) => resolve(result)
          }
          if (prop === 'maybeSingle' || prop === 'single') {
            return () => Promise.resolve({ data: (dataByTable[table] ?? [])[0] ?? null })
          }
          return () => self
        },
      })
      return self
    },
  }
}

const emptyCtx: HealthContext = {
  periodDays: 14, timezone: 'Europe/Berlin', coachProfile: null, scores: null, metrics: [], sleep: [],
  labs: [], supplements: [], intake: [], supplementLogs: [], notes: [],
  calendar: [], goals: [], experiments: [], environment: [],
}

describe('buildHealthContext: goals & experiments', () => {
  it('loads goals and experiments into the context', async () => {
    const sb = stubSupabase({
      goals: [{ title: 'Сон 8ч', metric: 'sleepHours', baseline_value: 6.8, target_value: 8, direction: 'up', end_date: '2026-08-01', status: 'active' }],
      experiments: [{ hypothesis: 'Без кофе после 15:00', change_rule: 'no coffee', target_metric: 'hrv', start_date: '2026-07-01', end_date: '2026-07-14', status: 'active', result: null }],
    })
    const ctx = await buildHealthContext(sb, 'user-1')
    expect(ctx.goals).toHaveLength(1)
    expect(ctx.experiments).toHaveLength(1)
  })
})

describe('healthContextToText: goals & experiments', () => {
  it('renders active goal with direction and deadline', () => {
    const text = healthContextToText({
      ...emptyCtx,
      goals: [{ title: 'Сон 8ч', metric: 'sleepHours', baseline_value: 6.8, target_value: 8, direction: 'up', end_date: '2026-08-01', status: 'active' }],
    })
    expect(text).toContain('Цели пользователя')
    expect(text).toContain('Сон 8ч')
    expect(text).toContain('повысить')
    expect(text).toContain('2026-08-01')
  })

  it('renders active and completed experiments with effect', () => {
    const text = healthContextToText({
      ...emptyCtx,
      experiments: [
        { hypothesis: 'Без кофе после 15:00', change_rule: 'no coffee', target_metric: 'hrv', start_date: '2026-07-01', end_date: '2026-07-14', status: 'active', result: null },
        { hypothesis: 'Магний перед сном', change_rule: 'mg 400', target_metric: 'sleepHours', start_date: '2026-06-01', end_date: '2026-06-15', status: 'completed', result: { deltaPct: 7.2 } },
      ],
    })
    expect(text).toContain('Эксперименты пользователя')
    expect(text).toContain('Идёт: «Без кофе после 15:00»')
    expect(text).toContain('Завершён: «Магний перед сном»')
    expect(text).toContain('+7%')
  })

  it('omits sections when empty', () => {
    const text = healthContextToText(emptyCtx)
    expect(text).not.toContain('Цели пользователя')
    expect(text).not.toContain('Эксперименты пользователя')
  })
})

describe('healthContextToText: sleep timing', () => {
  it('renders bedtime and wake time per night, converted to the given timezone', () => {
    const text = healthContextToText({
      ...emptyCtx,
      timezone: 'Europe/Berlin',
      sleep: [
        { date: '2026-07-05', duration_hours: 7.2, deep_hours: 1.1, rem_hours: 1.7, core_hours: 4.4, bedtime: '2026-07-04T21:47:00Z', wake_time: '2026-07-05T05:10:00Z' },
      ],
    })
    // Europe/Berlin в июле — UTC+2, значит 21:47 UTC = 23:47 локально, 05:10 UTC = 07:10 локально
    expect(text).toContain('засыпание 23:47')
    expect(text).toContain('подъём 07:10')
  })

  it('renders average bedtime across nights', () => {
    const text = healthContextToText({
      ...emptyCtx,
      timezone: 'Europe/Berlin',
      sleep: [
        { date: '2026-07-05', duration_hours: 7.2, deep_hours: 1.1, rem_hours: 1.7, core_hours: 4.4, bedtime: '2026-07-04T21:40:00Z', wake_time: null },
        { date: '2026-07-04', duration_hours: 7.0, deep_hours: 1.0, rem_hours: 1.6, core_hours: 4.2, bedtime: '2026-07-03T22:00:00Z', wake_time: null },
      ],
    })
    // 23:40 и 00:00 локально → среднее 23:50
    expect(text).toContain('Среднее время засыпания: 23:50')
  })

  it('omits per-night time when bedtime/wake_time are null, without breaking the line', () => {
    const text = healthContextToText({
      ...emptyCtx,
      timezone: 'Europe/Berlin',
      sleep: [{ date: '2026-07-05', duration_hours: 7.2, deep_hours: 1.1, rem_hours: 1.7, core_hours: 4.4, bedtime: null, wake_time: null }],
    })
    expect(text).toContain('2026-07-05: всего 7.2ч')
    expect(text).not.toContain('засыпание')
    expect(text).not.toContain('Среднее время засыпания')
  })
})

// Полнота контекста: каждая секция реально попадает в текст для ИИ —
// «молчаливое» выпадение секции регрессией не пройдёт (гарантия переехала
// из клиентского buildContextSnapshot, удалённого в F2).
describe('healthContextToText: full coverage', () => {
  it('renders every populated section', () => {
    const text = healthContextToText({
      periodDays: 14,
      timezone: 'Europe/Berlin',
      coachProfile: { summary: 'Похудеть к лету', facts: ['не ест глютен'] },
      scores: { date: '2026-07-05', readiness: 82, recovery_score: 78, sleep_score: 90, stress_score: 22, hrv_baseline: 48, rhr_baseline: 55, sleep_baseline: 7.4, steps_baseline: 9000 },
      metrics: [{ date: '2026-07-05', resting_heart_rate: 56, hrv: 47, sleep_hours: 7.2, steps: 9500, active_energy: 480, oxygen_saturation: 0.97 }],
      sleep: [{ date: '2026-07-05', duration_hours: 7.2, deep_hours: 1.1, rem_hours: 1.7, core_hours: 4.4 }],
      labs: [{ marker: 'Ферритин', value: 88, unit: 'нг/мл', ref_range: '30-400', flag: null, date: '2026-06-20' }],
      supplements: ['Магний'],
      intake: [{ ts: '2026-07-05T09:00:00Z', type: 'coffee', amount: 200, unit: 'мл', note: null, calories: null }],
      supplementLogs: [{ date: '2026-07-05', taken: true, supplements: { name: 'Магний' } }],
      notes: [{ date: '2026-07-05', note: 'тяжёлый день', wellbeing: 3 }],
      calendar: [{ start_ts: '2026-07-05T10:00:00Z' }],
      goals: [{ title: 'Сон 8ч', metric: 'sleepHours', baseline_value: 6.8, target_value: 8, direction: 'up', end_date: '2026-08-01', status: 'active' }],
      experiments: [{ hypothesis: 'Магний перед сном', change_rule: 'mg', target_metric: 'sleepHours', start_date: '2026-06-01', end_date: '2026-06-15', status: 'completed', result: { deltaPct: 7.2 } }],
      environment: [
        { date: '2026-07-05', temp_c: 24.3, pressure_hpa: 1008, daylight_minutes: 950, precipitation_mm: 0 },
        { date: '2026-07-04', temp_c: 22.1, pressure_hpa: 1015, daylight_minutes: 952, precipitation_mm: 2 },
      ],
    })
    for (const marker of [
      'ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ', 'ОЦЕНКИ', 'Персональная норма', 'ЧСС покоя',
      'Фазы сна', 'Анализы', 'Ферритин', 'Препараты: Магний', 'кофе',
      'Приём препаратов', 'Заметки дня', 'Календарь',
      'Цели пользователя', 'Эксперименты пользователя',
      'Погода (2026-07-05)', 'давление 1008 гПа (-7 за сутки)',
    ]) {
      expect(text, `секция «${marker}» выпала из контекста`).toContain(marker)
    }
  })
})
