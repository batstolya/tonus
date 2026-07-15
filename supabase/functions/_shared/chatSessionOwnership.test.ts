import { describe, expect, it, vi } from 'vitest'
import {
  findOwnedChatSession,
  isValidChatSessionId,
  loadOwnedChatHistory,
  resolveOrCreateOwnedChatSession,
} from './chatSessionOwnership.ts'

describe('findOwnedChatSession', () => {
  it('accepts canonical UUID session IDs only', () => {
    expect(isValidChatSessionId('11111111-1111-4111-8111-111111111111')).toBe(true)
    expect(isValidChatSessionId('not-a-session')).toBe(false)
    expect(isValidChatSessionId({ id: '11111111-1111-4111-8111-111111111111' })).toBe(false)
  })

  it('scopes the service-role lookup by both session and authenticated user', async () => {
    const calls: Array<[string, string?]> = []
    const query = {
      select(columns: string) {
        calls.push(['select', columns])
        return this
      },
      eq(column: string, value: string) {
        calls.push([column, value])
        return this
      },
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'session-id' }, error: null }),
    }
    const client = {
      from(table: string) {
        calls.push(['from', table])
        return query
      },
    }

    const result = await findOwnedChatSession(client, 'session-id', 'user-id')

    expect(calls).toEqual([
      ['from', 'chat_sessions'],
      ['select', 'id'],
      ['id', 'session-id'],
      ['user_id', 'user-id'],
    ])
    expect(query.maybeSingle).toHaveBeenCalledOnce()
    expect(result).toEqual({ data: { id: 'session-id' }, error: null })
  })

  it('replaces a foreign Telegram session with a new session owned by the linked user', async () => {
    const calls: Array<[string, string?]> = []
    let inserting = false
    const table = {
      select(columns: string) {
        calls.push([inserting ? 'insert-select' : 'select', columns])
        return this
      },
      eq(column: string, value: string) {
        calls.push([column, value])
        return this
      },
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert(values: { user_id: string }) {
        inserting = true
        calls.push(['insert-user', values.user_id])
        return this
      },
      single: vi.fn().mockResolvedValue({ data: { id: 'new-owned-session' }, error: null }),
    }
    const client = {
      from(tableName: string) {
        calls.push(['from', tableName])
        return table
      },
    }

    const result = await resolveOrCreateOwnedChatSession(
      client,
      '11111111-1111-4111-8111-111111111111',
      'linked-user',
    )

    expect(result).toEqual({ id: 'new-owned-session' })
    expect(calls).toEqual([
      ['from', 'chat_sessions'],
      ['select', 'id'],
      ['id', '11111111-1111-4111-8111-111111111111'],
      ['user_id', 'linked-user'],
      ['from', 'chat_sessions'],
      ['insert-user', 'linked-user'],
      ['insert-select', 'id'],
    ])
  })

  it('loads service-role history by both session and authenticated user', async () => {
    const calls: Array<[string, string | number]> = []
    const query = {
      select(columns: string) {
        calls.push(['select', columns])
        return this
      },
      eq(column: string, value: string) {
        calls.push([column, value])
        return this
      },
      order(column: string, options: { ascending: boolean }) {
        calls.push(['order', `${column}:${options.ascending}`])
        return this
      },
      limit: vi.fn().mockImplementation((count: number) => {
        calls.push(['limit', count])
        return Promise.resolve({ data: [{ role: 'user', content: 'safe' }], error: null })
      }),
    }
    const client = {
      from(table: string) {
        calls.push(['from', table])
        return query
      },
    }

    const result = await loadOwnedChatHistory(client, 'owned-session', 'linked-user', 6)

    expect(result.data).toEqual([{ role: 'user', content: 'safe' }])
    expect(calls).toEqual([
      ['from', 'chat_messages'],
      ['select', 'role, content'],
      ['session_id', 'owned-session'],
      ['user_id', 'linked-user'],
      ['order', 'created_at:false'],
      ['limit', 6],
    ])
  })
})
