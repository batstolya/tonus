import { describe, it, expect } from 'vitest'
import { executeChatTool, CHAT_TOOL_DECLARATIONS, type SupabaseLike } from './chatTools'

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
  it('declares exactly the four range/history/correlation tools', () => {
    const names = CHAT_TOOL_DECLARATIONS.map((t) => t.name)
    expect(names).toEqual(['get_metrics_range', 'get_sleep_range', 'get_lab_history', 'get_correlations'])
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
