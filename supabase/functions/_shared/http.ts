// Deadline + optional single retry for outbound HTTP. Every fetch leaving an
// Edge Function must go through here (guard: scripts/edge-fetch-guard.test.mjs)
// so a hung upstream can never hold a function until the platform kills it.
// Pure module: no Deno globals, usable from vitest node tests.

export const DEFAULT_TIMEOUT_MS = 10_000
export const AI_TIMEOUT_MS = 30_000

export interface FetchWithTimeoutInit extends RequestInit {
  timeoutMs?: number
  /** Retry once on 5xx or network error. Only honored for GET (idempotent). */
  retryOn5xx?: boolean
  /** Test seam. */
  fetchImpl?: typeof fetch
}

export async function fetchWithTimeout(
  url: RequestInfo | URL,
  init: FetchWithTimeoutInit = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, retryOn5xx = false, fetchImpl = fetch, ...rest } = init
  const method = (rest.method ?? 'GET').toUpperCase()
  const attempt = () => fetchImpl(url, { ...rest, signal: AbortSignal.timeout(timeoutMs) })

  if (!(retryOn5xx && method === 'GET')) return attempt()

  try {
    const res = await attempt()
    if (res.status < 500) return res
  } catch (err) {
    // TimeoutError falls through to the single retry, like a network error.
    if (!(err instanceof Error)) throw err
  }
  return attempt()
}
