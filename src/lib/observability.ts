import { isDemoActive } from './demo'

export type ClientOperation =
  | 'web.global_error'
  | 'web.unhandled_rejection'
  | 'web.edge_function_failure'

export type ClientErrorCode =
  | 'client_error'
  | 'unhandled_rejection'
  | 'edge_request_failed'

interface InvokeResult { error: unknown | null }
type InvokeFunction = (
  name: string,
  options: { body: Record<string, string> },
) => Promise<InvokeResult>

interface EventTargetLike {
  addEventListener(type: string, listener: EventListener): void
  removeEventListener(type: string, listener: EventListener): void
}

export interface ClientObservabilityDeps {
  environment: 'preview' | 'production'
  release: string
  isDemo: () => boolean
  randomUUID: () => string
  invoke: InvokeFunction
  target?: EventTargetLike
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const GIT_SHA = /^[0-9a-f]{40}$/i
const operations = new Set<ClientOperation>([
  'web.global_error',
  'web.unhandled_rejection',
  'web.edge_function_failure',
])
const errorCodes = new Set<ClientErrorCode>([
  'client_error',
  'unhandled_rejection',
  'edge_request_failed',
])
const installedTargets = new WeakSet<object>()

async function invokeReport(
  name: string,
  options: { body: Record<string, string> },
): Promise<InvokeResult> {
  const { supabase } = await import('./supabase')
  return supabase.functions.invoke(name, options)
}

function defaultDeps(): ClientObservabilityDeps {
  const release = typeof __TONUS_RELEASE_SHA__ === 'string' ? __TONUS_RELEASE_SHA__ : ''
  const environment = typeof __TONUS_ENVIRONMENT__ === 'string' && __TONUS_ENVIRONMENT__ === 'production'
    ? 'production'
    : 'preview'
  return {
    environment,
    release,
    isDemo: isDemoActive,
    randomUUID: () => crypto.randomUUID(),
    invoke: invokeReport,
    target: window,
  }
}

export async function captureClientFailure(
  operation: ClientOperation,
  errorCode: ClientErrorCode,
  requestId?: string,
  deps: ClientObservabilityDeps = defaultDeps(),
): Promise<boolean> {
  if (deps.isDemo()) return false
  if (!operations.has(operation) || !errorCodes.has(errorCode)) return false
  if (!GIT_SHA.test(deps.release)) return false
  if (deps.environment !== 'preview' && deps.environment !== 'production') return false

  const correlationId = requestId && UUID.test(requestId) ? requestId : deps.randomUUID()
  if (!UUID.test(correlationId)) return false
  try {
    const { error } = await deps.invoke('report-client-error', {
      body: {
        environment: deps.environment,
        operation,
        requestId: correlationId,
        errorCode,
        release: deps.release.toLowerCase(),
      },
    })
    return !error
  } catch {
    return false
  }
}

export function installClientObservability(
  deps: ClientObservabilityDeps = defaultDeps(),
): () => void {
  const target = deps.target ?? window
  if (installedTargets.has(target as object)) return () => {}
  installedTargets.add(target as object)

  const onError: EventListener = () => {
    void captureClientFailure('web.global_error', 'client_error', undefined, deps)
  }
  const onUnhandledRejection: EventListener = () => {
    void captureClientFailure('web.unhandled_rejection', 'unhandled_rejection', undefined, deps)
  }
  target.addEventListener('error', onError)
  target.addEventListener('unhandledrejection', onUnhandledRejection)

  return () => {
    target.removeEventListener('error', onError)
    target.removeEventListener('unhandledrejection', onUnhandledRejection)
    installedTargets.delete(target as object)
  }
}
