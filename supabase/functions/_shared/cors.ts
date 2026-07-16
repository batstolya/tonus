// Browser-origin allowlist for UI-facing Edge Functions (beta-safety PR 3).
// TONUS_ALLOWED_ORIGINS is a comma-separated origin list; unset → no browser
// origin is ever granted (fail closed). Non-browser clients (HAE, Scriptable,
// webhooks, cron) send no Origin header and are unaffected.
// Pure module (no Deno-URL imports) → tested by vitest.

export function resolveCorsOrigin(requestOrigin: string | null, allowlist: string): string | null {
  if (!requestOrigin) return null
  const allowed = allowlist.split(',').map(s => s.trim()).filter(Boolean)
  return allowed.includes(requestOrigin) ? requestOrigin : null
}

export function corsHeadersFor(requestOrigin: string | null, allowlist: string): Record<string, string> {
  const origin = resolveCorsOrigin(requestOrigin, allowlist)
  if (!origin) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, content-type, x-request-id',
    'Vary': 'Origin',
  }
}
