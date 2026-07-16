import { describe, expect, it, vi } from 'vitest'
import {
  buildSafeEvent,
  captureClientReportedFailure,
  captureEdgeFailure,
  parseClientFailurePayload,
  requestIdFor,
  withObservability,
  type SafeEventInput,
  type TonusEvent,
} from './observability.ts'

const RELEASE = 'a'.repeat(40)
const REQUEST_ID = '018f6f5e-6d4a-7fd1-9d0f-9c3d0f834eee'

function validInput(): SafeEventInput {
  return {
    environment: 'production',
    service: 'edge',
    operation: 'edge.ingest_health',
    requestId: REQUEST_ID,
    outcome: 'failure',
    durationMs: 42.9,
    errorCode: 'http_5xx',
    release: RELEASE,
  }
}

describe('buildSafeEvent', () => {
  it('builds the strict technical event contract', () => {
    expect(buildSafeEvent(validInput(), () => new Date('2026-07-16T07:00:00.000Z'))).toEqual({
      timestamp: '2026-07-16T07:00:00.000Z',
      environment: 'production',
      service: 'edge',
      operation: 'edge.ingest_health',
      requestId: REQUEST_ID,
      outcome: 'failure',
      durationMs: 42,
      errorCode: 'http_5xx',
      release: RELEASE,
    })
  })

  it('drops every unknown field instead of transporting sensitive values', () => {
    const input = {
      ...validInput(),
      token: 'secret-token',
      email: 'person@example.com',
      body: { prompt: 'private health prompt', medication: 'metformin' },
      telegram_chat_id: '123456789',
      error: new Error('lab result 99'),
      stack: 'private stack',
    } as SafeEventInput

    const serialized = JSON.stringify(buildSafeEvent(input))

    for (const prohibited of ['secret-token', 'person@example.com', 'health prompt', 'metformin', '123456789', 'lab result', 'private stack']) {
      expect(serialized).not.toContain(prohibited)
    }
    expect(Object.keys(JSON.parse(serialized))).toEqual([
      'timestamp', 'environment', 'service', 'operation', 'requestId',
      'outcome', 'release', 'durationMs', 'errorCode',
    ])
  })

  it('fails closed for non-allowlisted operations, error codes, or releases', () => {
    expect(buildSafeEvent({ ...validInput(), operation: 'edge.metformin' })).toBeNull()
    expect(buildSafeEvent({ ...validInput(), errorCode: 'person@example.com' })).toBeNull()
    expect(buildSafeEvent({ ...validInput(), release: 'main' })).toBeNull()
    expect(buildSafeEvent({ ...validInput(), service: 'web' })).toBeNull()
  })

  it('rejects invalid durations and identifiers', () => {
    expect(buildSafeEvent({ ...validInput(), durationMs: -1 })).toBeNull()
    expect(buildSafeEvent({ ...validInput(), durationMs: 300_001 })).toBeNull()
    expect(buildSafeEvent({ ...validInput(), requestId: 'person@example.com' })).toBeNull()
  })
})

describe('requestIdFor', () => {
  it('reuses an incoming UUID request ID', () => {
    const randomUUID = vi.fn(() => crypto.randomUUID())
    const req = new Request('https://example.test', { headers: { 'x-request-id': REQUEST_ID } })

    expect(requestIdFor(req, randomUUID)).toBe(REQUEST_ID)
    expect(randomUUID).not.toHaveBeenCalled()
  })

  it('replaces unsafe correlation input with a generated UUID', () => {
    const generated = '018f6f5e-6d4a-7fd1-9d0f-9c3d0f834eef'
    const req = new Request('https://example.test', { headers: { 'x-request-id': 'person@example.com' } })

    expect(requestIdFor(req, () => generated)).toBe(generated)
  })
})

describe('captureEdgeFailure', () => {
  it('persists and notifies with the same allowlisted production event', async () => {
    const persisted: TonusEvent[] = []
    const persist = vi.fn(async (event: TonusEvent) => { persisted.push(event) })
    const notify = vi.fn(async () => {})

    const captured = await captureEdgeFailure({
      operation: 'edge.ingest_health',
      requestId: REQUEST_ID,
      durationMs: 17,
      errorCode: 'http_5xx',
      error: new Error('private lab result'),
    } as never, {
      environment: 'production',
      release: RELEASE,
      now: () => new Date('2026-07-16T07:00:00.000Z'),
      persist,
      notify,
    })

    expect(captured).toBe(true)
    expect(persist).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith(persisted[0])
    expect(JSON.stringify(persisted[0])).not.toContain('private lab result')
  })

  it('persists preview failures without sending production alerts', async () => {
    const persist = vi.fn(async () => {})
    const notify = vi.fn(async () => {})

    await captureEdgeFailure({
      operation: 'edge.send_reminders',
      requestId: REQUEST_ID,
      errorCode: 'handler_exception',
    }, { environment: 'preview', release: RELEASE, persist, notify })

    expect(persist).toHaveBeenCalledTimes(1)
    expect(notify).not.toHaveBeenCalled()
  })

  it('fails closed instead of transporting an event without an exact release', async () => {
    const persist = vi.fn(async () => {})

    expect(await captureEdgeFailure({
      operation: 'edge.telegram_bot',
      requestId: REQUEST_ID,
      errorCode: 'http_5xx',
    }, { environment: 'production', release: '', persist })).toBe(false)
    expect(persist).not.toHaveBeenCalled()
  })

  it('fails closed when the runtime environment is not configured', async () => {
    const persist = vi.fn(async () => {})

    expect(await captureEdgeFailure({
      operation: 'edge.telegram_bot',
      requestId: REQUEST_ID,
      errorCode: 'http_5xx',
    }, { release: RELEASE, persist })).toBe(false)
    expect(persist).not.toHaveBeenCalled()
  })

  it('reports delivery failure when the durable store rejects the event', async () => {
    const persist = vi.fn(async () => { throw new Error('offline') })

    expect(await captureEdgeFailure({
      operation: 'edge.ingest_health',
      requestId: REQUEST_ID,
      errorCode: 'http_5xx',
    }, { environment: 'production', release: RELEASE, persist, notify: async () => {} })).toBe(false)
  })
})

describe('client failure payload boundary', () => {
  it('accepts only the fixed browser contract and discards extra fields', async () => {
    const payload = parseClientFailurePayload({
      environment: 'production',
      operation: 'web.global_error',
      requestId: REQUEST_ID,
      errorCode: 'client_error',
      release: RELEASE,
      email: 'person@example.com',
      body: { health: 'private' },
    })

    expect(payload).toEqual({
      environment: 'production',
      operation: 'web.global_error',
      requestId: REQUEST_ID,
      errorCode: 'client_error',
      release: RELEASE,
    })
    expect(JSON.stringify(payload)).not.toContain('person@example.com')
    expect(JSON.stringify(payload)).not.toContain('private')
  })

  it('rejects edge operations, demo-like environments, and malformed identifiers', () => {
    const valid = {
      environment: 'production',
      operation: 'web.global_error',
      requestId: REQUEST_ID,
      errorCode: 'client_error',
      release: RELEASE,
    }
    expect(parseClientFailurePayload({ ...valid, operation: 'edge.ingest_health' })).toBeNull()
    expect(parseClientFailurePayload({ ...valid, environment: 'demo' })).toBeNull()
    expect(parseClientFailurePayload({ ...valid, requestId: 'person@example.com' })).toBeNull()
  })

  it('persists a rebuilt web event and alerts only in production', async () => {
    const persisted: TonusEvent[] = []
    const persist = vi.fn(async (event: TonusEvent) => { persisted.push(event) })
    const notify = vi.fn(async () => {})
    const payload = parseClientFailurePayload({
      environment: 'production',
      operation: 'web.unhandled_rejection',
      requestId: REQUEST_ID,
      errorCode: 'unhandled_rejection',
      release: RELEASE,
    })!

    expect(await captureClientReportedFailure(payload, { persist, notify })).toBe(true)
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({ service: 'web' }))
    expect(notify).toHaveBeenCalledWith(persisted[0])
  })
})

describe('withObservability', () => {
  const deps = () => ({
    environment: 'production' as const,
    release: RELEASE,
    randomUUID: () => REQUEST_ID,
    persist: vi.fn(async () => {}),
    notify: vi.fn(async () => {}),
  })

  it('correlates and captures a 5xx response without changing its body', async () => {
    const d = deps()
    const handler = withObservability(
      'edge.ingest_health',
      async () => new Response('original body', { status: 503 }),
      d,
    )

    const response = await handler(new Request('https://example.test'))

    expect(response.status).toBe(503)
    expect(await response.text()).toBe('original body')
    expect(response.headers.get('x-request-id')).toBe(REQUEST_ID)
    expect(d.persist).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'edge.ingest_health',
      requestId: REQUEST_ID,
      errorCode: 'http_5xx',
    }))
  })

  it('does not let a failed observability transport replace the product response', async () => {
    const d = deps()
    d.persist.mockRejectedValueOnce(new Error('transport unavailable'))
    const handler = withObservability(
      'edge.send_reminders',
      async () => new Response('business response', { status: 500 }),
      d,
    )

    const response = await handler(new Request('https://example.test'))

    expect(response.status).toBe(500)
    expect(await response.text()).toBe('business response')
  })

  it('turns an uncaught exception into a safe correlated response', async () => {
    const d = deps()
    const handler = withObservability('edge.telegram_bot', async () => {
      throw new Error('private Telegram message')
    }, d)

    const response = await handler(new Request('https://example.test'))
    const body = await response.text()

    expect(response.status).toBe(500)
    expect(response.headers.get('x-request-id')).toBe(REQUEST_ID)
    expect(body).toContain('internal_error')
    expect(body).not.toContain('private Telegram message')
    expect(d.persist).toHaveBeenCalledWith(expect.objectContaining({ errorCode: 'handler_exception' }))
  })

  it('does not emit an event for a successful response', async () => {
    const d = deps()
    const handler = withObservability(
      'edge.ingest_health',
      async () => new Response('ok'),
      d,
    )

    const response = await handler(new Request('https://example.test'))

    expect(response.status).toBe(200)
    expect(response.headers.get('x-request-id')).toBe(REQUEST_ID)
    expect(d.persist).not.toHaveBeenCalled()
  })
})
