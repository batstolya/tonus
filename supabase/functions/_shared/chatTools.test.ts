import { describe, it, expect } from 'vitest'
import { executeChatTool, CHAT_TOOL_DECLARATIONS } from './chatTools'

function stubSupabase(dataByTable: Record<string, unknown[]>) {
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
      return self
    },
  }
}

describe('CHAT_TOOL_DECLARATIONS', () => {
  it('declares exactly the three range/history tools', () => {
    const names = CHAT_TOOL_DECLARATIONS.map((t: any) => t.name)
    expect(names).toEqual(['get_metrics_range', 'get_sleep_range', 'get_lab_history'])
  })
})

describe('executeChatTool', () => {
  it('returns metrics rows for a valid range', async () => {
    const sb = stubSupabase({ daily_metrics: [{ date: '2026-06-01', sleep_hours: 7.1 }] })
    const result: any = await executeChatTool(sb, 'user-1', 'get_metrics_range', { start_date: '2026-06-01', end_date: '2026-06-10' })
    expect(result.rows).toHaveLength(1)
  })

  it('rejects a metrics range longer than 60 days without throwing', async () => {
    const sb = stubSupabase({ daily_metrics: [] })
    const result: any = await executeChatTool(sb, 'user-1', 'get_metrics_range', { start_date: '2026-01-01', end_date: '2026-06-01' })
    expect(result.error).toBeTruthy()
  })

  it('rejects a metrics call missing dates', async () => {
    const sb = stubSupabase({ daily_metrics: [] })
    const result: any = await executeChatTool(sb, 'user-1', 'get_metrics_range', {})
    expect(result.error).toBeTruthy()
  })

  it('returns sleep rows for a valid range', async () => {
    const sb = stubSupabase({ sleep_sessions: [{ date: '2026-06-01', bedtime: '2026-05-31T21:40:00Z' }] })
    const result: any = await executeChatTool(sb, 'user-1', 'get_sleep_range', { start_date: '2026-06-01', end_date: '2026-06-10' })
    expect(result.rows).toHaveLength(1)
  })

  it('returns lab history for a marker', async () => {
    const sb = stubSupabase({ lab_results: [{ date: '2026-01-15', value: 60 }, { date: '2026-04-15', value: 88 }] })
    const result: any = await executeChatTool(sb, 'user-1', 'get_lab_history', { marker: 'Ферритин' })
    expect(result.rows).toHaveLength(2)
  })

  it('rejects a lab history call missing marker', async () => {
    const sb = stubSupabase({ lab_results: [] })
    const result: any = await executeChatTool(sb, 'user-1', 'get_lab_history', {})
    expect(result.error).toBeTruthy()
  })

  it('returns an error for an unknown tool name', async () => {
    const sb = stubSupabase({})
    const result: any = await executeChatTool(sb, 'user-1', 'delete_everything', {})
    expect(result.error).toContain('delete_everything')
  })
})
