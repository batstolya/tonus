import { describe, expect, it } from 'vitest'
import { ensureIngestToken, ingestUrl, loadIngestToken, setIngestMode } from './ingestToken'

// Поддельный клиент: запоминает, что именно ушло в базу, — иначе «токен
// создался» и «токен создался с нужным user_id» неразличимы.
function fakeClient(existing: Record<string, unknown> | null) {
  const calls: { op: string; payload: unknown }[] = []
  const chain = () => {
    const self: Record<string, unknown> = {}
    for (const m of ['select', 'eq']) self[m] = () => self
    self.maybeSingle = () => Promise.resolve({ data: existing, error: null })
    self.insert = (payload: unknown) => { calls.push({ op: 'insert', payload }); return Promise.resolve({ error: null }) }
    self.update = (payload: unknown) => { calls.push({ op: 'update', payload }); return { eq: () => Promise.resolve({ error: null }) } }
    return self
  }
  return { client: { from: () => chain() }, calls }
}

const ROW = { token: 'abc', mode: 'live', last_ingest_at: '2026-07-26T10:00:00Z', last_status: 'ok' }

describe('loadIngestToken', () => {
  it('returns the row when the user has a token', async () => {
    const { client } = fakeClient(ROW)
    expect(await loadIngestToken(client as never, 'u')).toEqual(ROW)
  })

  it('returns null rather than throwing when there is none', async () => {
    const { client } = fakeClient(null)
    expect(await loadIngestToken(client as never, 'u')).toBeNull()
  })
})

describe('ensureIngestToken', () => {
  it('reuses the existing token instead of minting a second one', async () => {
    // Токен один на пользователя, и им уже пользуется HAE: выдать новый —
    // значит молча оборвать работающую синхронизацию.
    const { client, calls } = fakeClient(ROW)
    expect((await ensureIngestToken(client as never, 'u')).token).toBe('abc')
    expect(calls).toHaveLength(0)
  })

  it('creates a shadow-mode token when the user has none', async () => {
    const { client, calls } = fakeClient(null)
    const created = await ensureIngestToken(client as never, 'user-1')
    // Новый токен приходит в shadow: свежий отправитель сначала пишет в
    // staging, а в боевые таблицы — только после осознанного переключения.
    expect(created.mode).toBe('shadow')
    expect(calls).toEqual([{ op: 'insert', payload: { user_id: 'user-1', token: created.token, mode: 'shadow' } }])
  })

  it('mints an unguessable token', async () => {
    const { client } = fakeClient(null)
    const a = await ensureIngestToken(client as never, 'u')
    const b = await ensureIngestToken(client as never, 'u')
    expect(a.token).toMatch(/^[0-9a-f]{48}$/)
    expect(a.token).not.toBe(b.token)
  })
})

describe('setIngestMode', () => {
  it('writes the mode', async () => {
    const { client, calls } = fakeClient(ROW)
    await setIngestMode(client as never, 'u', 'live')
    expect(calls).toEqual([{ op: 'update', payload: { mode: 'live' } }])
  })
})

describe('ingestUrl', () => {
  it('points at the ingest function with the token in the query', () => {
    expect(ingestUrl('https://x.supabase.co', 'tok')).toBe(
      'https://x.supabase.co/functions/v1/ingest-health?token=tok',
    )
  })
})
