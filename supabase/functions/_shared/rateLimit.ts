// Durable request rate limiting over public.consume_rate_limit (beta-safety
// PR 3). Buckets are '<scope>:<subject>' where subject is a user id or a
// SHA-256 token hash — raw tokens never key the store. Any RPC failure denies
// the request (fail closed). Pure module (no Deno-URL imports) → vitest.

export interface RateLimitRule {
  bucket: string
  limit: number
  windowSeconds: number
}

// Structural subset of SupabaseClient.rpc so the module stays vitest-testable.
interface RateLimitRpcClient {
  rpc(fn: 'consume_rate_limit', args: { p_bucket: string; p_limit: number; p_window_seconds: number }):
    PromiseLike<{ data: boolean | null; error: { message: string } | null }>
}

export async function consumeRateLimit(client: RateLimitRpcClient, rule: RateLimitRule): Promise<boolean> {
  try {
    const { data, error } = await client.rpc('consume_rate_limit', {
      p_bucket: rule.bucket,
      p_limit: rule.limit,
      p_window_seconds: rule.windowSeconds,
    })
    if (error) return false
    return data === true
  } catch {
    return false
  }
}

export async function hashRateLimitSubject(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

export function rateLimitedResponse(headers: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: 'rate_limited' }), {
    status: 429,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}
