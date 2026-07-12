import { describe, it, expect } from 'vitest'
import { executeChatTool, CHAT_TOOL_DECLARATIONS, toLocalDateTime, effectiveWakeIso, numericAverages, formatHoursDuration, type SupabaseLike } from './chatTools'

function stubSupabase(dataByTable: Record<string, unknown[]>): SupabaseLike {
  return {
    from(table: string) {
      const result = { data: dataByTable[table] ?? [] }
      const chain: Record<string, unknown> = {}
      const self = new Proxy(chain, {
        get(_t, prop: string) {
          if (prop === 'then') return (resolve: (v: { data: unknown }) => void) => resolve(result)
          return () => self
        },
      })
      return self as unknown as ReturnType<SupabaseLike['from']>
    },
  }
}

describe('CHAT_TOOL_DECLARATIONS', () => {
  it('declares exactly the range/history/correlation/extreme tools', () => {
    const names = CHAT_TOOL_DECLARATIONS.map((t) => t.name)
    expect(names).toEqual(['get_metrics_range', 'get_sleep_range', 'get_lab_history', 'get_correlations', 'get_extreme_days'])
  })
})

describe('executeChatTool', () => {
  it('returns metrics rows for a valid range', async () => {
    const sb = stubSupabase({ daily_metrics: [{ date: '2026-06-01', sleep_hours: 7.1 }] })
    const result: Record<string, unknown> = await executeChatTool(sb, 'user-1', 'get_metrics_range', { start_date: '2026-06-01', end_date: '2026-06-10' })
    expect(result.rows).toHaveLength(1)
  })

  it('rejects a metrics range longer than 60 days without throwing', async () => {
    const sb = stubSupabase({ daily_metrics: [] })
    const result: Record<string, unknown> = await executeChatTool(sb, 'user-1', 'get_metrics_range', { start_date: '2026-01-01', end_date: '2026-06-01' })
    expect(result.error).toBeTruthy()
  })

  it('rejects a metrics call missing dates', async () => {
    const sb = stubSupabase({ daily_metrics: [] })
    const result: Record<string, unknown> = await executeChatTool(sb, 'user-1', 'get_metrics_range', {})
    expect(result.error).toBeTruthy()
  })

  it('returns sleep rows for a valid range', async () => {
    const sb = stubSupabase({ sleep_sessions: [{ date: '2026-06-01', bedtime: '2026-05-31T21:40:00Z' }] })
    const result: Record<string, unknown> = await executeChatTool(sb, 'user-1', 'get_sleep_range', { start_date: '2026-06-01', end_date: '2026-06-10' })
    expect(result.rows).toHaveLength(1)
  })

  it('returns server-computed sleep averages in summary (не модель считает)', async () => {
    // 3 из реальных июльских ночей: deep 1.67, 1.42, 1.61 → avg 1.567
    const sb = stubSupabase({
      sleep_sessions: [
        { date: '2026-07-01', bedtime: '2026-06-30T23:35:00Z', wake_time: '2026-07-01T06:48:00Z', duration_hours: 6.99, deep_hours: 1.67, rem_hours: 2.1, core_hours: 3.2 },
        { date: '2026-07-02', bedtime: '2026-07-01T23:10:00Z', wake_time: '2026-07-02T06:12:00Z', duration_hours: 7.02, deep_hours: 1.42, rem_hours: 1.5, core_hours: 4.1 },
        { date: '2026-07-03', bedtime: '2026-07-02T22:25:00Z', wake_time: '2026-07-03T06:52:00Z', duration_hours: 8.43, deep_hours: 1.61, rem_hours: 1.82, core_hours: 5.0 },
      ],
      profiles: [{ timezone: 'Europe/Berlin' }],
    })
    const result: Record<string, unknown> = await executeChatTool(sb, 'user-1', 'get_sleep_range', { start_date: '2026-07-01', end_date: '2026-07-03' })
    const rows = result.rows as Array<Record<string, unknown>>
    const summary = result.summary as { nights: number; averages: Record<string, { avg: number; n: number; display?: string }> }
    expect(summary.nights).toBe(3)
    expect(rows[0].deep_hours).toBe(1.67)
    expect(rows[0].deep_hours_display).toBe('1 год 40 хв')
    expect(summary.averages.deep_hours).toEqual({ avg: 1.567, n: 3, display: '1 год 34 хв' })
    expect(summary.averages.duration_hours.avg).toBe(7.48)
  })

  it('converts sleep bedtime/wake_time to the user timezone (UTC → local)', async () => {
    const sb = stubSupabase({
      sleep_sessions: [{ date: '2026-07-01', bedtime: '2026-06-30T23:35:00Z', wake_time: '2026-07-01T06:48:00Z' }],
      profiles: [{ timezone: 'Europe/Berlin' }],
    })
    const result: Record<string, unknown> = await executeChatTool(sb, 'user-1', 'get_sleep_range', { start_date: '2026-07-01', end_date: '2026-07-01' })
    const row = (result.rows as Array<{ bedtime: string; wake_time: string }>)[0]
    expect(row.bedtime).toBe('2026-07-01 01:35') // 23:35 UTC + 2 (CEST) — как в таблице приложения
    expect(row.wake_time).toBe('2026-07-01 08:48')
  })

  it('returns lab history for a marker', async () => {
    const sb = stubSupabase({ lab_results: [{ date: '2026-01-15', value: 60 }, { date: '2026-04-15', value: 88 }] })
    const result: Record<string, unknown> = await executeChatTool(sb, 'user-1', 'get_lab_history', { marker: 'Ферритин' })
    expect(result.rows).toHaveLength(2)
  })

  it('rejects a lab history call missing marker', async () => {
    const sb = stubSupabase({ lab_results: [] })
    const result: Record<string, unknown> = await executeChatTool(sb, 'user-1', 'get_lab_history', {})
    expect(result.error).toBeTruthy()
  })

  it('get_extreme_days: best deep sleep maps to {date, value} from sleep_sessions', async () => {
    const sb = stubSupabase({ sleep_sessions: [{ date: '2025-07-17', deep_hours: 2.06 }, { date: '2025-05-11', deep_hours: 1.97 }] })
    const result: Record<string, unknown> = await executeChatTool(sb, 'user-1', 'get_extreme_days', { metric: 'deep_hours', direction: 'highest', limit: 5 })
    expect(result.metric).toBe('deep_hours')
    expect(result.days).toEqual([{ date: '2025-07-17', value: 2.06 }, { date: '2025-05-11', value: 1.97 }])
  })

  it('get_extreme_days: hrv reads from daily_metrics', async () => {
    const sb = stubSupabase({ daily_metrics: [{ date: '2026-03-01', hrv: 140 }] })
    const result: Record<string, unknown> = await executeChatTool(sb, 'user-1', 'get_extreme_days', { metric: 'hrv', direction: 'highest' })
    expect(result.days).toEqual([{ date: '2026-03-01', value: 140 }])
  })

  it('get_extreme_days: rejects unknown metric or missing direction', async () => {
    const sb = stubSupabase({})
    expect((await executeChatTool(sb, 'user-1', 'get_extreme_days', { metric: 'nonsense', direction: 'highest' }) as Record<string, unknown>).error).toBeTruthy()
    expect((await executeChatTool(sb, 'user-1', 'get_extreme_days', { metric: 'hrv' }) as Record<string, unknown>).error).toBeTruthy()
  })

  it('returns an error for an unknown tool name', async () => {
    const sb = stubSupabase({})
    const result: Record<string, unknown> = await executeChatTool(sb, 'user-1', 'delete_everything', {})
    expect(result.error).toContain('delete_everything')
  })

  it('forwards a DB query error instead of returning empty rows', async () => {
    // стаб, у которого запрос резолвится с error (напр. невалидная дата в БД)
    const sb: SupabaseLike = {
      from() {
        const self = new Proxy({}, {
          get(_t, prop: string) {
            if (prop === 'then') return (resolve: (v: unknown) => void) => resolve({ data: null, error: { message: 'invalid input syntax for type date' } })
            return () => self
          },
        })
        return self as unknown as ReturnType<SupabaseLike['from']>
      },
    }
    const result: Record<string, unknown> = await executeChatTool(sb, 'user-1', 'get_metrics_range', { start_date: '2026-06-01', end_date: '2026-06-10' })
    expect(result.rows).toBeUndefined()
    expect(result.error).toContain('invalid input syntax')
  })
})

describe('executeChatTool: get_correlations', () => {
  const day = (i: number) => new Date(Date.UTC(2026, 4, 1 + i)).toISOString().slice(0, 10)

  it('returns correlations when there is enough data', async () => {
    const n = 30
    const coffee = (i: number) => (i % 2 === 0 ? 4 : 0)
    const metrics = Array.from({ length: n }, (_, i) => ({
      date: day(i),
      hrv: i > 0 && coffee(i - 1) > 2 ? 35 : 55,
      resting_heart_rate: 55,
      sleep_hours: 7.5,
      steps: 9000,
    }))
    const intake = Array.from({ length: n }, (_, i) => coffee(i) > 0 ? { ts: `${day(i)}T08:00:00Z`, type: 'coffee' } : null).filter(Boolean)
    const sb = stubSupabase({
      daily_metrics: metrics,
      sleep_sessions: [],
      metrics_daily: [],
      daily_scores: [],
      intake_events: intake as unknown[],
      environment_daily: [],
    })
    const result: Record<string, unknown> = await executeChatTool(sb, 'user-1', 'get_correlations', {})
    expect(result.correlations).toBeTruthy()
    const correlations = result.correlations as Array<Record<string, unknown>>
    expect(correlations.some((c) => c.factor === 'coffee' && c.outcome === 'hrv')).toBe(true)
  })

  it('filters by outcome when provided', async () => {
    const n = 30
    const coffee = (i: number) => (i % 2 === 0 ? 4 : 0)
    const metrics = Array.from({ length: n }, (_, i) => ({
      date: day(i),
      hrv: i > 0 && coffee(i - 1) > 2 ? 35 : 55,
      resting_heart_rate: i > 0 && coffee(i - 1) > 2 ? 65 : 55,
      sleep_hours: 7.5,
      steps: 9000,
    }))
    const intake = Array.from({ length: n }, (_, i) => coffee(i) > 0 ? { ts: `${day(i)}T08:00:00Z`, type: 'coffee' } : null).filter(Boolean)
    const sb = stubSupabase({
      daily_metrics: metrics, sleep_sessions: [], metrics_daily: [], daily_scores: [],
      intake_events: intake as unknown[], environment_daily: [],
    })
    const result: Record<string, unknown> = await executeChatTool(sb, 'user-1', 'get_correlations', { outcome: 'hrv' })
    // сначала убеждаемся, что фильтр не просто выдал пустой массив (что тривиально
    // прошло бы .every() на []), а реально нашёл и оставил hrv-корреляцию
    const correlations = result.correlations as Array<Record<string, unknown>>
    expect(correlations.length).toBeGreaterThan(0)
    expect(correlations.every((c) => c.outcome === 'hrv')).toBe(true)
  })

  it('returns a plain error, not a throw, when there is too little data', async () => {
    const sb = stubSupabase({
      daily_metrics: [{ date: '2026-05-01', hrv: 50, resting_heart_rate: 55, sleep_hours: 7, steps: 9000 }],
      sleep_sessions: [], metrics_daily: [], daily_scores: [], intake_events: [], environment_daily: [],
    })
    const result: Record<string, unknown> = await executeChatTool(sb, 'user-1', 'get_correlations', {})
    expect(result.error).toBeTruthy()
  })

  it('surfaces a DB query error instead of masking it as insufficient data', async () => {
    // один из шести запросов резолвится с error — не должно превратиться в needMoreDays
    const sb: SupabaseLike = {
      from() {
        const self = new Proxy({}, {
          get(_t, prop: string) {
            if (prop === 'then') return (resolve: (v: unknown) => void) => resolve({ data: null, error: { message: 'db down' } })
            return () => self
          },
        })
        return self as unknown as ReturnType<SupabaseLike['from']>
      },
    }
    const result: Record<string, unknown> = await executeChatTool(sb, 'user-1', 'get_correlations', {})
    expect(result.correlations).toBeUndefined()
    expect(result.error).toContain('Ошибка запроса данных')
  })
})

describe('numericAverages', () => {
  it('среднее по числовым колонкам, null пропускает', () => {
    const rows = [{ a: 2, b: 10 }, { a: 4, b: null }, { a: 6, b: 20 }]
    const r = numericAverages(rows, ['a', 'b'])
    expect(r.a).toEqual({ avg: 4, n: 3 })
    expect(r.b).toEqual({ avg: 15, n: 2 }) // null не в счёте
  })
  it('точное среднее, где модель ошибается (даёт 7.834, а не «примерно 7.78»)', () => {
    const july = [6.99, 7.02, 8.43, 7.98, 7.36, 8.63, 8.949, 7.909, 7.234]
    const r = numericAverages(july.map((v) => ({ d: v })), ['d'])
    expect(r.d.avg).toBe(7.834)
    expect(r.d.n).toBe(9)
  })
  it('нет числовых значений — ключа нет', () => {
    expect(numericAverages([{ a: null }], ['a'])).toEqual({})
  })
})

describe('formatHoursDuration', () => {
  it.each([
    [1.67, '1 год 40 хв'],
    [1.03, '1 год 2 хв'],
    [0.8, '48 хв'],
    [2, '2 год'],
    [1.999, '2 год'],
    [0, '0 хв'],
  ])('formats %s hours as %s', (hours, expected) => {
    expect(formatHoursDuration(hours)).toBe(expected)
  })

  it('returns null for missing or invalid values', () => {
    expect(formatHoursDuration(null)).toBeNull()
    expect(formatHoursDuration(undefined)).toBeNull()
    expect(formatHoursDuration(Number.NaN)).toBeNull()
  })
})

describe('effectiveWakeIso', () => {
  it('нормальную ночь не трогает', () => {
    expect(effectiveWakeIso('2026-06-21T00:00:00Z', '2026-06-21T08:00:00Z', 7.5)).toBe('2026-06-21T08:00:00Z')
  })
  it('битый wake → отбой + длительность', () => {
    const w = effectiveWakeIso('2026-06-13T00:14:24Z', '2026-06-13T23:55:33Z', 7.3178)
    expect(w!.slice(0, 16)).toBe('2026-06-13T07:33')
  })
})

describe('toLocalDateTime', () => {
  it('переводит UTC в пояс пользователя', () => {
    expect(toLocalDateTime('2026-06-30T23:35:00Z', 'Europe/Berlin')).toBe('2026-07-01 01:35')
    expect(toLocalDateTime('2026-07-02T22:25:00Z', 'Europe/Berlin')).toBe('2026-07-03 00:25')
  })
  it('битый и пустой вход → null', () => {
    expect(toLocalDateTime(null, 'Europe/Berlin')).toBeNull()
    expect(toLocalDateTime(undefined, 'Europe/Berlin')).toBeNull()
    expect(toLocalDateTime('не-дата', 'Europe/Berlin')).toBeNull()
  })
})
