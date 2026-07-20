import { fetchWithTimeout } from './http.ts'

export type TonusEnvironment = 'preview' | 'production'
export type TonusService = 'web' | 'edge'
export type TonusOutcome = 'success' | 'failure' | 'delivery_unknown'

export const SAFE_OPERATIONS = [
  'web.global_error',
  'web.unhandled_rejection',
  'web.edge_function_failure',
  'edge.ingest_health',
  'edge.send_reminders',
  'edge.telegram_bot',
] as const

export type SafeOperation = typeof SAFE_OPERATIONS[number]

export const SAFE_ERROR_CODES = [
  'client_error',
  'unhandled_rejection',
  'edge_request_failed',
  'http_5xx',
  'handler_exception',
] as const

export type SafeErrorCode = typeof SAFE_ERROR_CODES[number]

export interface SafeEventInput {
  environment: TonusEnvironment
  service: TonusService
  operation: string
  requestId: string
  outcome: TonusOutcome
  durationMs?: number
  errorCode?: string
  release: string
}

export interface TonusEvent {
  timestamp: string
  environment: TonusEnvironment
  service: TonusService
  operation: SafeOperation
  requestId: string
  outcome: TonusOutcome
  durationMs?: number
  errorCode?: SafeErrorCode
  release: string
}

export type ObservabilityTransport = (event: TonusEvent) => Promise<void>
export type EdgeOperation = Extract<SafeOperation, `edge.${string}`>
export type ClientOperation = Extract<SafeOperation, `web.${string}`>

export interface EdgeFailureInput {
  operation: EdgeOperation
  requestId: string
  durationMs?: number
  errorCode: SafeErrorCode
}

export interface ClientFailurePayload {
  environment: TonusEnvironment
  operation: ClientOperation
  requestId: string
  errorCode: 'client_error' | 'unhandled_rejection' | 'edge_request_failed'
  release: string
}

export interface EdgeObservabilityDeps {
  environment?: TonusEnvironment
  release?: string
  now?: () => Date
  clockMs?: () => number
  randomUUID?: () => string
  persist?: ObservabilityTransport
  notify?: ObservabilityTransport
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const GIT_SHA = /^[0-9a-f]{40}$/i
const operations = new Set<string>(SAFE_OPERATIONS)
const errorCodes = new Set<string>(SAFE_ERROR_CODES)
const clientOperations = new Set<string>([
  'web.global_error',
  'web.unhandled_rejection',
  'web.edge_function_failure',
])
const clientErrorCodes = new Set<string>([
  'client_error',
  'unhandled_rejection',
  'edge_request_failed',
])

export function buildSafeEvent(
  input: SafeEventInput,
  now: () => Date = () => new Date(),
): TonusEvent | null {
  if (input.environment !== 'preview' && input.environment !== 'production') return null
  if (input.service !== 'web' && input.service !== 'edge') return null
  if (!operations.has(input.operation)) return null
  if (!input.operation.startsWith(`${input.service}.`)) return null
  if (!UUID.test(input.requestId)) return null
  if (!['success', 'failure', 'delivery_unknown'].includes(input.outcome)) return null
  if (!GIT_SHA.test(input.release)) return null
  if (input.errorCode !== undefined && !errorCodes.has(input.errorCode)) return null
  if (input.durationMs !== undefined && (
    !Number.isFinite(input.durationMs) || input.durationMs < 0 || input.durationMs > 300_000
  )) return null

  const event: TonusEvent = {
    timestamp: now().toISOString(),
    environment: input.environment,
    service: input.service,
    operation: input.operation as SafeOperation,
    requestId: input.requestId,
    outcome: input.outcome,
    release: input.release.toLowerCase(),
  }
  if (input.durationMs !== undefined) event.durationMs = Math.floor(input.durationMs)
  if (input.errorCode !== undefined) event.errorCode = input.errorCode as SafeErrorCode
  return event
}

export function requestIdFor(
  req: Request,
  randomUUID: () => string = () => crypto.randomUUID(),
): string {
  const incoming = req.headers.get('x-request-id') ?? ''
  return UUID.test(incoming) ? incoming : randomUUID()
}

function runtimeEnv(name: string): string {
  const runtime = globalThis as unknown as {
    Deno?: { env?: { get?: (key: string) => string | undefined } }
  }
  return runtime.Deno?.env?.get?.(name) ?? ''
}

function runtimeEnvironment(): TonusEnvironment | null {
  const value = runtimeEnv('TONUS_ENVIRONMENT')
  return value === 'preview' || value === 'production' ? value : null
}

function eventRow(event: TonusEvent): Record<string, unknown> {
  return {
    event_timestamp: event.timestamp,
    environment: event.environment,
    service: event.service,
    operation: event.operation,
    request_id: event.requestId,
    outcome: event.outcome,
    duration_ms: event.durationMs ?? null,
    error_code: event.errorCode ?? null,
    release: event.release,
  }
}

async function persistToSupabase(event: TonusEvent): Promise<void> {
  const url = runtimeEnv('SUPABASE_URL')
  const serviceKey = runtimeEnv('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) throw new Error('observability_storage_not_configured')

  const response = await fetchWithTimeout(`${url}/rest/v1/observability_events`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(eventRow(event)),
    signal: AbortSignal.timeout(1_500),
  })
  if (!response.ok) throw new Error('observability_storage_failed')
}

async function notifyTelegram(event: TonusEvent): Promise<void> {
  const token = runtimeEnv('TELEGRAM_BOT_TOKEN')
  const chatId = runtimeEnv('TONUS_ALERT_CHAT_ID')
  if (!token || !chatId) return

  const text = [
    'Tonus production error',
    `operation: ${event.operation}`,
    `code: ${event.errorCode ?? 'unknown'}`,
    `request: ${event.requestId}`,
    `release: ${event.release}`,
  ].join('\n')
  const response = await fetchWithTimeout(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
    timeoutMs: 1_500, // alerting must stay fast — never hold the main request path
  })
  if (!response.ok) throw new Error('observability_notification_failed')
}

async function deliverEvent(event: TonusEvent, deps: EdgeObservabilityDeps): Promise<boolean> {
  const work: Promise<void>[] = [
    Promise.resolve().then(() => (deps.persist ?? persistToSupabase)(event)),
  ]
  if (event.environment === 'production') {
    work.push(Promise.resolve().then(() => (deps.notify ?? notifyTelegram)(event)))
  }
  const results = await Promise.allSettled(work)
  return results[0]?.status === 'fulfilled'
}

export async function captureEdgeFailure(
  input: EdgeFailureInput,
  deps: EdgeObservabilityDeps = {},
): Promise<boolean> {
  const environment = deps.environment ?? runtimeEnvironment()
  if (!environment) return false
  const event = buildSafeEvent({
    environment,
    service: 'edge',
    operation: input.operation,
    requestId: input.requestId,
    outcome: 'failure',
    durationMs: input.durationMs,
    errorCode: input.errorCode,
    release: deps.release ?? runtimeEnv('TONUS_RELEASE_SHA'),
  }, deps.now)
  if (!event) return false
  return deliverEvent(event, deps)
}

export function parseClientFailurePayload(input: unknown): ClientFailurePayload | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const value = input as Record<string, unknown>
  if (value.environment !== 'preview' && value.environment !== 'production') return null
  if (typeof value.operation !== 'string' || !clientOperations.has(value.operation)) return null
  if (typeof value.requestId !== 'string' || !UUID.test(value.requestId)) return null
  if (typeof value.errorCode !== 'string' || !clientErrorCodes.has(value.errorCode)) return null
  if (typeof value.release !== 'string' || !GIT_SHA.test(value.release)) return null
  return {
    environment: value.environment,
    operation: value.operation as ClientOperation,
    requestId: value.requestId,
    errorCode: value.errorCode as ClientFailurePayload['errorCode'],
    release: value.release.toLowerCase(),
  }
}

export async function captureClientReportedFailure(
  payload: ClientFailurePayload,
  deps: EdgeObservabilityDeps = {},
): Promise<boolean> {
  const event = buildSafeEvent({
    environment: payload.environment,
    service: 'web',
    operation: payload.operation,
    requestId: payload.requestId,
    outcome: 'failure',
    errorCode: payload.errorCode,
    release: payload.release,
  }, deps.now)
  if (!event) return false
  return deliverEvent(event, deps)
}

function responseWithRequestId(response: Response, requestId: string): Response {
  const headers = new Headers(response.headers)
  headers.set('x-request-id', requestId)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export function withObservability(
  operation: EdgeOperation,
  handler: (req: Request) => Response | Promise<Response>,
  deps: EdgeObservabilityDeps = {},
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    const clockMs = deps.clockMs ?? (() => Date.now())
    const startedAt = clockMs()
    const requestId = requestIdFor(req, deps.randomUUID)
    try {
      const response = await handler(req)
      if (response.status >= 500) {
        await captureEdgeFailure({
          operation,
          requestId,
          durationMs: clockMs() - startedAt,
          errorCode: 'http_5xx',
        }, deps)
      }
      return responseWithRequestId(response, requestId)
    } catch {
      await captureEdgeFailure({
        operation,
        requestId,
        durationMs: clockMs() - startedAt,
        errorCode: 'handler_exception',
      }, deps)
      return new Response(JSON.stringify({ error: 'internal_error', requestId }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'x-request-id': requestId },
      })
    }
  }
}
