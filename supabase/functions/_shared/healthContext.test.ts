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
  calendar: [], goals: [], experiments: [], environment: [], concerns: [], hairEntries: [],
  alerts: [], recommendations: [],
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

  it('falls back to Europe/Berlin instead of throwing when given an invalid timezone', async () => {
    const sb = stubSupabase({})
    const ctx = await buildHealthContext(sb, 'user-1', { timezone: 'not-a-real-timezone' })
    expect(ctx.timezone).toBe('Europe/Berlin')
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

describe('buildHealthContext: goal progress', () => {
  it('attaches recent progress rows to each goal by id', async () => {
    const sb = stubSupabase({
      goals: [{ id: 'g1', title: 'Сон 8ч', metric: 'sleepHours', baseline_value: 6.8, target_value: 8, direction: 'up', end_date: '2026-08-01', status: 'active' }],
      goal_progress: [
        { goal_id: 'g1', date: '2026-07-04', value: 7.4, on_target: true },
        { goal_id: 'g1', date: '2026-07-05', value: 7.6, on_target: true },
      ],
    })
    const ctx = await buildHealthContext(sb, 'user-1')
    expect(ctx.goals[0].recentProgress).toHaveLength(2)
  })

  it('does not query goal_progress when there are no goals', async () => {
    const sb = stubSupabase({ goals: [] })
    const ctx = await buildHealthContext(sb, 'user-1')
    expect(ctx.goals).toHaveLength(0)
  })
})

describe('healthContextToText: goal progress', () => {
  it('renders recent progress line under the goal', () => {
    const text = healthContextToText({
      ...emptyCtx,
      goals: [{
        title: 'Сон 8ч', metric: 'sleepHours', baseline_value: 6.8, target_value: 8, direction: 'up', end_date: '2026-08-01', status: 'active',
        recentProgress: [{ date: '2026-07-04', value: 7.4, on_target: true }, { date: '2026-07-05', value: 7.6, on_target: true }],
      }],
    })
    expect(text).toContain('Последние 2 дн.: 7.4, 7.6 (на цели: 2/2 дней)')
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

  it('rounds average bedtime to a valid HH:MM at an hour boundary (regression: no "HH:60")', () => {
    const text = healthContextToText({
      ...emptyCtx,
      timezone: 'Europe/Berlin',
      sleep: [
        { date: '2026-07-05', duration_hours: 7.2, deep_hours: 1.1, rem_hours: 1.7, core_hours: 4.4, bedtime: '2026-07-04T19:59:00Z', wake_time: null },
        { date: '2026-07-04', duration_hours: 7.0, deep_hours: 1.0, rem_hours: 1.6, core_hours: 4.2, bedtime: '2026-07-04T20:00:00Z', wake_time: null },
      ],
    })
    // 21:59 и 22:00 локально → среднее 21:59.5, округляется до 22:00, а не "21:60"
    expect(text).toContain('Среднее время засыпания: 22:00')
    expect(text).not.toContain('21:60')
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

describe('healthContextToText: weekly comparison blocks', () => {
  const day = (n: number) => `2026-07-${String(n).padStart(2, '0')}`

  it('renders last-7 and previous-7 day metric aggregates when 14+ days present', () => {
    const metrics = []
    for (let i = 1; i <= 14; i++) {
      metrics.push({ date: day(i), resting_heart_rate: 55, hrv: 45, sleep_hours: i <= 7 ? 7.0 : 7.4, steps: 9000, active_energy: 400, oxygen_saturation: 0.97 })
    }
    const text = healthContextToText({ ...emptyCtx, metrics })
    expect(text).toContain('Последние 7 дней: сон 7.4ч')
    expect(text).toContain('Предыдущие 7 дней: сон 7.0ч')
    // недельный блок несёт те же метрики, что и агрегат за весь период
    expect(text).toContain('ккал 400')
    expect(text).toContain('SpO2 97%')
  })

  it('renders only last-7 when fewer than 14 days present', () => {
    const metrics = []
    for (let i = 1; i <= 9; i++) {
      metrics.push({ date: day(i), resting_heart_rate: 55, hrv: 45, sleep_hours: 7.2, steps: 9000, active_energy: 400, oxygen_saturation: 0.97 })
    }
    const text = healthContextToText({ ...emptyCtx, metrics })
    expect(text).toContain('Последние 7 дней: сон 7.2ч')
    expect(text).not.toContain('Предыдущие 7 дней')
  })

  it('renders last-7 and previous-7 sleep aggregates when 14+ nights present', () => {
    const sleep = []
    for (let i = 1; i <= 14; i++) {
      sleep.push({ date: day(i), duration_hours: 7.2, deep_hours: i <= 7 ? 1.3 : 1.0, rem_hours: 1.7, core_hours: 4.2, bedtime: null, wake_time: null })
    }
    // ctx.sleep идёт по убыванию даты (новые первые) — slice(0,7) должен быть 14..8, slice(7,14) — 7..1
    const text = healthContextToText({ ...emptyCtx, sleep: sleep.reverse() })
    expect(text).toContain('Последние 7 ночей: сон 7.2ч, глубокий 1.0ч')
    expect(text).toContain('Предыдущие 7 ночей: сон 7.2ч, глубокий 1.3ч')
  })

  it('renders average bedtime per week in the weekly sleep aggregates', () => {
    const sleep = []
    for (let i = 1; i <= 14; i++) {
      // старая неделя (дни 1–7): 19:30 UTC = 21:30 в Берлине (июль, UTC+2);
      // новая неделя (дни 8–14): 21:00 UTC = 23:00 локально
      sleep.push({
        date: day(i), duration_hours: 7.2, deep_hours: i <= 7 ? 1.3 : 1.0, rem_hours: 1.7, core_hours: 4.2,
        bedtime: `${day(i)}T${i <= 7 ? '19:30' : '21:00'}:00Z`, wake_time: null,
      })
    }
    // ctx.sleep идёт по убыванию даты (новые первые)
    const text = healthContextToText({ ...emptyCtx, sleep: sleep.reverse() })
    expect(text).toContain('Последние 7 ночей: сон 7.2ч, глубокий 1.0ч, REM 1.7ч, засыпание в среднем 23:00')
    expect(text).toContain('Предыдущие 7 ночей: сон 7.2ч, глубокий 1.3ч, REM 1.7ч, засыпание в среднем 21:30')
  })
})

describe('buildHealthContext: concerns & hair entries', () => {
  it('loads active concerns with their latest log, and recent hair entries', async () => {
    const sb = stubSupabase({
      health_concerns: [{ id: 'c1', name: 'Высыпания', category: 'skin', status: 'active' }],
      concern_logs: [
        { concern_id: 'c1', date: '2026-07-04', severity: 3, note: 'после кофе хуже' },
        { concern_id: 'c1', date: '2026-06-20', severity: 4, note: null },
      ],
      hair_entries: [{ date: '2026-06-15', shedding_level: 2, density_rating: 3, hairline_rating: 4, scalp_note: null }],
    })
    const ctx = await buildHealthContext(sb, 'user-1')
    expect(ctx.concerns).toHaveLength(1)
    expect(ctx.concerns[0].lastLog).toEqual({ date: '2026-07-04', severity: 3, note: 'после кофе хуже' })
    expect(ctx.hairEntries).toHaveLength(1)
  })
})

describe('healthContextToText: concerns & hair entries', () => {
  it('renders concerns with latest log', () => {
    const text = healthContextToText({
      ...emptyCtx,
      concerns: [{ name: 'Высыпания', category: 'skin', status: 'active', lastLog: { date: '2026-07-04', severity: 3, note: 'после кофе хуже' } }],
    })
    expect(text).toContain('Отслеживаемые симптомы')
    expect(text).toContain('Высыпания (skin, active)')
    expect(text).toContain('severity 3/5')
    expect(text).toContain('после кофе хуже')
  })

  it('renders a period-scoped fallback for concerns without recent logs (not "no logs ever")', () => {
    const text = healthContextToText({
      ...emptyCtx,
      concerns: [{ name: 'Высыпания', category: 'skin', status: 'active', lastLog: null }],
    })
    expect(text).toContain('нет логов за последние 14 дн.')
    expect(text).not.toContain('логов пока нет')
  })

  it('renders latest hair entry', () => {
    const text = healthContextToText({
      ...emptyCtx,
      hairEntries: [{ date: '2026-06-15', shedding_level: 2, density_rating: 3, hairline_rating: 4, scalp_note: null }],
    })
    expect(text).toContain('Замеры волос (2026-06-15)')
    expect(text).toContain('выпадение 2/5')
  })

  it('omits sections when empty', () => {
    const text = healthContextToText(emptyCtx)
    expect(text).not.toContain('Отслеживаемые симптомы')
    expect(text).not.toContain('Замеры волос')
  })
})

describe('buildHealthContext: health alerts', () => {
  it('loads anomaly alerts and drops legacy reminder-dedup rows without a level', async () => {
    const sb = stubSupabase({
      health_alerts: [
        { date: '2026-07-03', level: 'red', message: 'Резкий рост пульса покоя и падение HRV' },
        { date: null, level: null, message: null }, // легаси dedup-строка (hair_photo_reminder и т.п.)
      ],
    })
    const ctx = await buildHealthContext(sb, 'user-1')
    expect(ctx.alerts).toHaveLength(1)
    expect(ctx.alerts[0].level).toBe('red')
  })
})

describe('healthContextToText: health alerts', () => {
  it('renders red alerts with a warning mark', () => {
    const text = healthContextToText({
      ...emptyCtx,
      alerts: [{ date: '2026-07-03', level: 'red', message: 'Резкий рост пульса покоя и падение HRV' }],
    })
    expect(text).toContain('Алерты стража здоровья')
    expect(text).toContain('⚠️ 2026-07-03 Резкий рост пульса покоя и падение HRV')
  })

  it('flattens Telegram-formatted messages (HTML + multi-line) into a plain single line', () => {
    const text = healthContextToText({
      ...emptyCtx,
      alerts: [{ date: '2026-07-03', level: 'red', message: '<b>Рост пульса покоя</b>\nHRV упал ниже нормы.\n<i>Это не диагноз.</i>' }],
    })
    expect(text).toContain('— ⚠️ 2026-07-03 Рост пульса покоя HRV упал ниже нормы. Это не диагноз.')
    expect(text).not.toContain('<b>')
    expect(text).not.toContain('Рост пульса покоя\n')
  })

  it('renders alerts without a date with a single space after the mark', () => {
    const text = healthContextToText({
      ...emptyCtx,
      alerts: [{ date: null, level: 'red', message: 'Сообщение' }],
    })
    expect(text).toContain('— ⚠️ Сообщение')
    expect(text).not.toContain('⚠️  ') // без двойного пробела при date = null
  })

  it('omits section when empty', () => {
    const text = healthContextToText(emptyCtx)
    expect(text).not.toContain('Алерты стража здоровья')
  })
})

describe('buildHealthContext: recommendations', () => {
  it('loads accepted/dismissed/snoozed recommendations', async () => {
    const sb = stubSupabase({
      recommendations: [{ metric: 'sleepHours', text: 'Ложиться на 30 мин раньше', status: 'dismissed', created_at: '2026-06-01T00:00:00Z' }],
    })
    const ctx = await buildHealthContext(sb, 'user-1')
    expect(ctx.recommendations).toHaveLength(1)
    expect(ctx.recommendations[0].status).toBe('dismissed')
  })
})

describe('healthContextToText: recommendations', () => {
  it('renders past recommendations with status', () => {
    const text = healthContextToText({
      ...emptyCtx,
      recommendations: [{ metric: 'sleepHours', text: 'Ложиться на 30 мин раньше', status: 'dismissed', created_at: '2026-06-01T00:00:00Z' }],
    })
    expect(text).toContain('Прошлые рекомендации ИИ')
    expect(text).toContain('[dismissed] Ложиться на 30 мин раньше (метрика sleepHours)')
  })

  it('omits section when empty', () => {
    const text = healthContextToText(emptyCtx)
    expect(text).not.toContain('Прошлые рекомендации ИИ')
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
        { date: '2026-07-05', temp_c: 24.3, pressure_hpa: 1008, daylight_minutes: 950, precipitation_mm: 0, kp_index: 6 },
        { date: '2026-07-04', temp_c: 22.1, pressure_hpa: 1015, daylight_minutes: 952, precipitation_mm: 2, kp_index: 2 },
      ],
      concerns: [{ name: 'Высыпания', category: 'skin', status: 'active', lastLog: { date: '2026-07-04', severity: 3, note: null } }],
      hairEntries: [{ date: '2026-06-15', shedding_level: 2, density_rating: 3, hairline_rating: 4, scalp_note: null }],
      alerts: [{ date: '2026-07-03', level: 'red', message: 'Рост пульса покоя' }],
      recommendations: [{ metric: 'sleepHours', text: 'Ложиться на 30 мин раньше', status: 'dismissed', created_at: '2026-06-01T00:00:00Z' }],
    })
    for (const marker of [
      'ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ', 'ОЦЕНКИ', 'Персональная норма', 'ЧСС покоя',
      'Фазы сна', 'Анализы', 'Ферритин', 'Препараты: Магний', 'кофе',
      'Приём препаратов', 'Заметки дня', 'Календарь',
      'Цели пользователя', 'Эксперименты пользователя',
      'Погода (2026-07-05)', 'давление 1008 гПа (-7 за сутки)', 'магнитная буря (Kp 6)',
      'Отслеживаемые симптомы', 'Замеры волос (2026-06-15)',
      'Алерты стража здоровья', 'Прошлые рекомендации ИИ',
    ]) {
      expect(text, `секция «${marker}» выпала из контекста`).toContain(marker)
    }
  })
})
