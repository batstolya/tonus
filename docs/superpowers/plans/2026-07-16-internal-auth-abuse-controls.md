# Internal Authentication and Minimum Abuse Controls Implementation Plan (PR 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the service-role key as an inter-function bearer with a dedicated `TONUS_INTERNAL_SECRET`, restrict browser CORS on UI endpoints to an explicit origin allowlist, and add durable Postgres-backed rate limits to public token endpoints and the costliest AI endpoint.

**Architecture:** Callees (`coach-profile`, `biweekly-report`, `suggest-experiments`) first accept the new `x-internal-secret` header alongside the existing PR 0 service-role check (dual-accept); callers (`telegram-bot`, `send-reminders`) then switch to the new secret; a follow-up PR 3b removes the service-role acceptance. CORS becomes a per-request allowlist echo driven by `TONUS_ALLOWED_ORIGINS` (fail closed when unset). Rate limiting is one atomic SECURITY DEFINER RPC over a `rate_limit_counters` table, keyed by user id or SHA-256 token hash.

**Tech Stack:** Deno Edge Functions (Supabase), pure `_shared` modules tested by vitest (node project), Postgres migration + regenerated `database.types.ts` (CI compares against live prod schema), security inventory generator (`scripts/security-inventory-lib.mjs`).

**Spec:** `docs/superpowers/specs/2026-07-14-beta-safety-minimum-design.md` §4 "PR 3".

---

## Design decisions locked here

- **Internal auth transport:** callee-side check is `x-internal-secret` header compared via `secretMatches` (fail closed). Callers keep an `Authorization: Bearer <SUPABASE_ANON_KEY>` header only so the Supabase gateway (`verify_jwt = true` on `biweekly-report`/`suggest-experiments`) admits the request; the anon key is public and carries no authority in the handler. `config.toml` JWT modes do not change.
- **CORS:** `TONUS_ALLOWED_ORIGINS` is a comma-separated origin list in Supabase Function secrets. Production value: `https://tonus-anatolii-s-projects6.vercel.app` (repo homepage). Unset/empty → no `Access-Control-Allow-Origin` is ever emitted (browsers blocked, non-browser clients unaffected). Documented exceptions keep their current CORS: `ingest-health` (HAE native app), `widget-data` (Scriptable widget); `telegram-bot`, `send-reminders`, `register-webhook` already emit no CORS. `sync-football-fixtures` and `send-football-reminders` are cron-only; their wildcard CORS is replaced by the allowlist helper too (harmless — они не браузерные, header просто не выдаётся).
- **Rate limits (initial values, documented in the guide):**
  - `ingest-health`: 120 requests/hour per token hash (covers frequent HAE auto-sync).
  - `widget-data`: 120 requests/hour per token hash.
  - `chat-health`: 40 requests/hour per user (costliest interactive AI op; monthly AI budget stays as defense-in-depth).
  - `report-client-error`: 120 events/hour per user (protects `observability_events` from a runaway client).
  - Rate-limit RPC/database errors → request denied (fail closed).
- **Zero-downtime rollout:** PR 3 (this plan) merges with dual-accept callees. Deploy order: secrets → migration → callees → callers → verify. PR 3b (small follow-up, Task 12) removes `isServiceRoleCall` usage and deletes `_shared/serviceRoleAuth.ts`; callees redeployed. Rollback never restores the service-role bearer path once PR 3b lands.

---

### Task 1: Internal secret helper in `_shared/auth.ts`

**Files:**
- Modify: `supabase/functions/_shared/auth.ts`
- Test: `supabase/functions/_shared/auth.test.ts`

- [ ] **Step 1: Write failing tests** — append to `auth.test.ts` (match existing test style in that file):

```ts
describe('isValidInternalSecret', () => {
  it('accepts a matching x-internal-secret header', () => {
    const req = new Request('http://x', { headers: { 'x-internal-secret': 's3cret' } })
    expect(isValidInternalSecret(req, 's3cret')).toBe(true)
  })
  it('rejects a wrong secret', () => {
    const req = new Request('http://x', { headers: { 'x-internal-secret': 'nope' } })
    expect(isValidInternalSecret(req, 's3cret')).toBe(false)
  })
  it('rejects a missing header', () => {
    expect(isValidInternalSecret(new Request('http://x'), 's3cret')).toBe(false)
  })
  it('fails closed when the expected secret is unset or empty', () => {
    const req = new Request('http://x', { headers: { 'x-internal-secret': '' } })
    expect(isValidInternalSecret(req, undefined)).toBe(false)
    expect(isValidInternalSecret(req, '')).toBe(false)
  })
})
```

- [ ] **Step 2: Run** `npx vitest run supabase/functions/_shared/auth.test.ts` → FAIL (`isValidInternalSecret` not exported).
- [ ] **Step 3: Implement** — append to `auth.ts`:

```ts
// Dedicated inter-function secret (PR 3). Replaces the service-role key as an
// internal bearer; spec: docs/superpowers/specs/2026-07-14-beta-safety-minimum-design.md §4 PR 3.
export function isValidInternalSecret(req: Request, expected: string | undefined): boolean {
  return secretMatches(req.headers.get('x-internal-secret'), expected)
}
```

- [ ] **Step 4: Run the test again** → PASS.
- [ ] **Step 5: Commit** `feat(security): add dedicated internal-call secret helper`.

### Task 2: Callees dual-accept the internal secret

**Files:**
- Modify: `supabase/functions/coach-profile/index.ts:23`
- Modify: `supabase/functions/biweekly-report/index.ts:120`
- Modify: `supabase/functions/suggest-experiments/index.ts:62`

- [ ] **Step 1:** In each file add env + import:

```ts
import { isValidInternalSecret } from '../_shared/auth.ts'
const INTERNAL_SECRET = Deno.env.get('TONUS_INTERNAL_SECRET') ?? ''
```

- [ ] **Step 2:** Change each internal-path condition from

```ts
if (serviceUserId && isServiceRoleCall(req, SUPABASE_SERVICE_KEY)) {
```

to

```ts
if (serviceUserId && (isValidInternalSecret(req, INTERNAL_SECRET) || isServiceRoleCall(req, SUPABASE_SERVICE_KEY))) {
```

Keep the `isServiceRoleCall` import — it is removed in PR 3b, not here. Never weaken the existing check.

- [ ] **Step 3: Verify** `npx vitest run supabase/functions/_shared` → PASS; `npm run check:functions` → errors ≤ `.deno-check-ceiling`.
- [ ] **Step 4: Commit** `feat(security): callees accept dedicated internal secret (dual-accept)`.

### Task 3: Callers send the internal secret instead of the service-role key

**Files:**
- Modify: `supabase/functions/telegram-bot/index.ts:130-136` (handleReport) and `:685-692` (handleExperimentSuggest)
- Modify: `supabase/functions/send-reminders/index.ts:300-307`

- [ ] **Step 1:** In both files add:

```ts
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const INTERNAL_SECRET = Deno.env.get('TONUS_INTERNAL_SECRET') ?? ''
```

(reuse existing env consts if already present).

- [ ] **Step 2:** In all three call sites replace the headers object

```ts
headers: {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
  'x-user-id': userId,
},
```

with

```ts
// Gateway needs any valid JWT (verify_jwt=true); authority comes from x-internal-secret.
headers: {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  'x-internal-secret': INTERNAL_SECRET,
  'x-user-id': userId,
},
```

(`send-reminders` uses `l.user_id`; keep the existing body/`x-user-id` values.)

- [ ] **Step 3: Verify** `npm run check:functions` ≤ ceiling.
- [ ] **Step 4: Commit** `feat(security): internal callers authenticate with dedicated secret`.

### Task 4: CORS allowlist helper (pure module)

**Files:**
- Create: `supabase/functions/_shared/cors.ts`
- Test: `supabase/functions/_shared/cors.test.ts`

- [ ] **Step 1: Failing tests** (`cors.test.ts`, vitest):

```ts
import { describe, expect, it } from 'vitest'
import { corsHeadersFor, resolveCorsOrigin } from './cors'

const ALLOW = 'https://tonus-anatolii-s-projects6.vercel.app, http://localhost:5173'

describe('resolveCorsOrigin', () => {
  it('echoes an allowlisted origin', () => {
    expect(resolveCorsOrigin('http://localhost:5173', ALLOW)).toBe('http://localhost:5173')
  })
  it('rejects an unknown origin', () => {
    expect(resolveCorsOrigin('https://evil.example', ALLOW)).toBeNull()
  })
  it('fails closed on empty allowlist or missing origin', () => {
    expect(resolveCorsOrigin('http://localhost:5173', '')).toBeNull()
    expect(resolveCorsOrigin(null, ALLOW)).toBeNull()
  })
})

describe('corsHeadersFor', () => {
  it('grants headers only to allowlisted origins', () => {
    const h = corsHeadersFor('http://localhost:5173', ALLOW)
    expect(h['Access-Control-Allow-Origin']).toBe('http://localhost:5173')
    expect(h['Vary']).toBe('Origin')
  })
  it('returns no grant otherwise', () => {
    expect(corsHeadersFor('https://evil.example', ALLOW)).toEqual({})
    expect(corsHeadersFor(null, '')).toEqual({})
  })
})
```

- [ ] **Step 2: Run** → FAIL (module missing).
- [ ] **Step 3: Implement** `cors.ts`:

```ts
// Browser-origin allowlist for UI-only Edge Functions (PR 3 abuse controls).
// TONUS_ALLOWED_ORIGINS is a comma-separated origin list; unset → no browser
// origin is granted (fail closed). Non-browser clients send no Origin and are
// unaffected. Pure module (no Deno imports) → tested by vitest.

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
```

- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `feat(security): CORS origin-allowlist helper`.

### Task 5: Apply the allowlist to UI-facing functions

**Files (18 functions currently emitting wildcard CORS; keep `ingest-health` and `widget-data` wildcard as documented exceptions):**
`analyze-health`, `biweekly-report`, `chat-health`, `classify-meal`, `coach-profile`, `coach-weekly`, `deep-research`, `extract-lab`, `fetch-cal`, `fetch-environment`, `fetch-ics`, `generate-recommendations`, `report-client-error`, `send-football-reminders`, `suggest-experiments`, `supplement-schedule`, `sync-cal`, `sync-football-fixtures` — each `supabase/functions/<name>/index.ts`.

- [ ] **Step 1:** Enumerate the exact current constants: `grep -rn "Access-Control-Allow-Origin" supabase/functions --include="index.ts"`.
- [ ] **Step 2:** In each listed function replace the module-level wildcard constant, e.g.

```ts
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, x-request-id' }
```

with a per-request computation at the top of the `serve` handler (before the OPTIONS branch), preserving the local name the file already uses (`CORS`, `corsHeaders`, …):

```ts
import { corsHeadersFor } from '../_shared/cors.ts'
const ALLOWED_ORIGINS = Deno.env.get('TONUS_ALLOWED_ORIGINS') ?? ''

serve(async (req) => {
  const CORS = corsHeadersFor(req.headers.get('Origin'), ALLOWED_ORIGINS)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  ...
```

If a file builds derived constants (e.g. `JSON_HEADERS = { ...CORS, 'Content-Type': 'application/json' }`) move that derivation inside the handler too. If CORS is referenced by helper functions outside `serve`, pass the computed headers down as an argument.

- [ ] **Step 3: Verify** no UI function still hardcodes the wildcard: `grep -rln "Allow-Origin': '\*'" supabase/functions --include="index.ts"` → only `ingest-health` and `widget-data`.
- [ ] **Step 4:** `npm run check:functions` ≤ ceiling; `npm test` green.
- [ ] **Step 5: Commit** `feat(security): restrict UI function CORS to origin allowlist`.

### Task 6: Durable rate-limit migration (+ live types)

**Files:**
- Create: `supabase/migrations/20260716120000_rate_limit_counters.sql`
- Regenerate: `src/lib/database.types.ts` (CI `gen:types:check` compares against live prod schema — apply the migration to prod in the same task).

- [ ] **Step 1: Write the migration** (style mirrors `20260716020000_observability_events.sql`):

```sql
-- Durable request rate limiting (beta-safety PR 3).
-- One row per (bucket, window); consume_rate_limit() increments atomically and
-- reports whether the request is still within the limit. Service-role only.

create table if not exists public.rate_limit_counters (
  bucket text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (bucket, window_start)
);

alter table public.rate_limit_counters enable row level security;
revoke all on table public.rate_limit_counters from public, anon, authenticated;

create or replace function public.consume_rate_limit(p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_count integer;
begin
  if p_limit <= 0 or p_window_seconds <= 0 then
    return false; -- fail closed on nonsense configuration
  end if;
  v_window_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  delete from rate_limit_counters
    where bucket = p_bucket and window_start < v_window_start;
  insert into rate_limit_counters (bucket, window_start, count)
    values (p_bucket, v_window_start, 1)
    on conflict (bucket, window_start)
    do update set count = rate_limit_counters.count + 1
    returning count into v_count;
  return v_count <= p_limit;
end $$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
```

The revoke line must match the inventory guard format exactly: `revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated` (see `findServiceRpcPermissionFindings` in `scripts/security-inventory-lib.mjs`).

- [ ] **Step 2: Apply to prod:** `npx supabase db push` (or MCP `apply_migration`). Verify with a live probe: `select public.consume_rate_limit('plan-smoke', 2, 60)` twice → `true,true`, third → `false`; then `delete from rate_limit_counters where bucket = 'plan-smoke'`.
- [ ] **Step 3: Regenerate types** with the repo's `gen:types` script (see package.json) and confirm `npm run gen:types:check` passes.
- [ ] **Step 4: Commit** `feat(db): durable rate-limit counters and atomic consume RPC`.

### Task 7: `_shared/rateLimit.ts` helper (pure module)

**Files:**
- Create: `supabase/functions/_shared/rateLimit.ts`
- Test: `supabase/functions/_shared/rateLimit.test.ts`

- [ ] **Step 1: Failing tests:**

```ts
import { describe, expect, it } from 'vitest'
import { consumeRateLimit, hashRateLimitSubject, rateLimitedResponse } from './rateLimit'

function fakeClient(results: Array<{ data: boolean | null; error: { message: string } | null }>) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = []
  return {
    calls,
    rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args })
      return Promise.resolve(results[calls.length - 1] ?? { data: null, error: { message: 'exhausted' } })
    },
  }
}

describe('consumeRateLimit', () => {
  it('allows traffic within the limit', async () => {
    const client = fakeClient([{ data: true, error: null }])
    await expect(consumeRateLimit(client, { bucket: 'chat:u1', limit: 40, windowSeconds: 3600 })).resolves.toBe(true)
    expect(client.calls[0]).toEqual({
      fn: 'consume_rate_limit',
      args: { p_bucket: 'chat:u1', p_limit: 40, p_window_seconds: 3600 },
    })
  })
  it('denies once the limit is exceeded', async () => {
    const client = fakeClient([{ data: false, error: null }])
    await expect(consumeRateLimit(client, { bucket: 'chat:u1', limit: 40, windowSeconds: 3600 })).resolves.toBe(false)
  })
  it('fails closed on database errors and null data', async () => {
    await expect(consumeRateLimit(fakeClient([{ data: null, error: { message: 'boom' } }]), { bucket: 'b', limit: 1, windowSeconds: 60 })).resolves.toBe(false)
    await expect(consumeRateLimit(fakeClient([{ data: null, error: null }]), { bucket: 'b', limit: 1, windowSeconds: 60 })).resolves.toBe(false)
  })
  it('keeps subjects isolated via distinct buckets', async () => {
    const client = fakeClient([{ data: true, error: null }, { data: true, error: null }])
    await consumeRateLimit(client, { bucket: 'ingest:aaa', limit: 120, windowSeconds: 3600 })
    await consumeRateLimit(client, { bucket: 'ingest:bbb', limit: 120, windowSeconds: 3600 })
    expect(client.calls.map(c => c.args.p_bucket)).toEqual(['ingest:aaa', 'ingest:bbb'])
  })
})

describe('hashRateLimitSubject', () => {
  it('hashes tokens so raw values never key the store', async () => {
    const h = await hashRateLimitSubject('secret-token')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(h).not.toContain('secret-token')
    await expect(hashRateLimitSubject('secret-token')).resolves.toBe(h)
    await expect(hashRateLimitSubject('other')).resolves.not.toBe(h)
  })
})

describe('rateLimitedResponse', () => {
  it('returns a 429 JSON body with given headers', async () => {
    const res = rateLimitedResponse({ 'Access-Control-Allow-Origin': 'https://x' })
    expect(res.status).toBe(429)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://x')
    await expect(res.json()).resolves.toEqual({ error: 'rate_limited' })
  })
})
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement:**

```ts
// Durable request rate limiting over public.consume_rate_limit (PR 3).
// Bucket format: '<scope>:<subject>' where subject is a user id or a SHA-256
// token hash (never a raw token). Any RPC failure denies the request (fail
// closed). Pure module (no Deno imports) → tested by vitest.

export interface RateLimitRule {
  bucket: string
  limit: number
  windowSeconds: number
}

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
```

If the real `SupabaseClient.rpc` is not structurally assignable to `RateLimitRpcClient` under deno check, call sites may pass `supabase as unknown as RateLimitRpcClient` — never loosen the interface itself.

- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `feat(security): durable rate-limit helper (fail closed)`.

### Task 8: Enforce rate limits at the four endpoints

**Files:**
- Modify: `supabase/functions/ingest-health/index.ts` (after token extraction, before token lookup)
- Modify: `supabase/functions/widget-data/index.ts` (after token extraction, before token lookup)
- Modify: `supabase/functions/chat-health/index.ts` (after user auth, before any Gemini/tool work)
- Modify: `supabase/functions/report-client-error/index.ts` (after user auth, before insert)

- [ ] **Step 1:** Shared import per file:

```ts
import { consumeRateLimit, hashRateLimitSubject, rateLimitedResponse } from '../_shared/rateLimit.ts'
```

- [ ] **Step 2:** Token endpoints (`ingest-health`, `widget-data`), right after the token is read:

```ts
const subject = await hashRateLimitSubject(token)
if (!await consumeRateLimit(supabase, { bucket: `ingest:${subject}`, limit: 120, windowSeconds: 3600 })) {
  return rateLimitedResponse(JSON_HEADERS)
}
```

(`widget:` prefix in widget-data; reuse each file's existing JSON headers constant. In `ingest-health` create the service client before this check if it is currently created later.)

- [ ] **Step 3:** User endpoints, right after `userId` is established:

```ts
if (!await consumeRateLimit(supabase, { bucket: `chat:${userId}`, limit: 40, windowSeconds: 3600 })) {
  return rateLimitedResponse(CORS)
}
```

(`client-error:${userId}`, limit 120 in `report-client-error`.)

- [ ] **Step 4:** `npm test` + `npm run check:functions` ≤ ceiling.
- [ ] **Step 5: Commit** `feat(security): durable rate limits on token and costly endpoints`.

### Task 9: Inventory generator + classification + regenerate

**Files:**
- Modify: `scripts/security-inventory-lib.mjs` (`discoverEdgeFunctions`)
- Modify: `scripts/security-inventory-lib.test.mjs`
- Modify: `security/inventory-classification.json`
- Regenerate: `security/inventory.generated.json` (`node scripts/generate-security-inventory.mjs`)

- [ ] **Step 1: Failing lib tests** — extend the existing `discoverEdgeFunctions` cases: a source containing `corsHeadersFor(` classifies `cors: 'allowlist'` (even without a literal `Access-Control-Allow-Origin`); a source containing `consumeRateLimit(` classifies `rateLimit: 'durable'`; one containing both `checkBudget(` and `consumeRateLimit(` → `'ai-budget+durable'`.
- [ ] **Step 2: Implement detection** in `discoverEdgeFunctions`:

```js
const usesAllowlist = /\bcorsHeadersFor\s*\(/.test(source)
const cors = usesAllowlist
  ? 'allowlist'
  : !hasCors
    ? 'none'
    : /Access-Control-Allow-Origin['"]?\s*[:=]\s*['"]\*['"]/.test(source) ? 'wildcard' : 'restricted'
const budget = /\bcheckBudget\s*\(/.test(source)
const durable = /\bconsumeRateLimit\s*\(/.test(source)
const rateLimit = budget && durable ? 'ai-budget+durable' : durable ? 'durable' : budget ? 'ai-budget' : 'none'
```

- [ ] **Step 3: Update classification** (`security/inventory-classification.json`):
  - `tables.serviceOnly` += `rate_limit_counters`;
  - `rpcs` += `"consume_rate_limit": { "signature": "consume_rate_limit(text, integer, integer)", "authOwner": "service-role", "credentialType": "service-role", "dataSensitivity": "internal" }`;
  - update `cors`/`rateLimit` for every function changed in Tasks 5 and 8 to the newly derived values;
  - `biweekly-report`/`suggest-experiments`/`coach-profile` `credentialType`: `user-or-internal-secret` (and `telegram-bot`/`send-reminders` descriptions if their classification mentions the service key).
- [ ] **Step 4: Regenerate** `security/inventory.generated.json`; run `node scripts/check-security-inventory.mjs` and `npm run test:scripts` → green.
- [ ] **Step 5: Commit** `chore(security): track allowlist CORS and durable rate limits in inventory`.

### Task 10: Documentation

**Files:**
- Create: `docs/guides/abuse-controls.md`
- Modify: `docs/guides/security-secrets-runbook.md`

- [ ] **Step 1:** `abuse-controls.md` documents (in English): the internal-call contract (`x-internal-secret` + `x-user-id`, anon-key bearer for the gateway, fail-closed helper), the CORS allowlist env and per-function exceptions table (HAE/Scriptable/webhooks/cron), the rate-limit table (endpoint, bucket key, limit, window, 429 shape), and rotation steps for `TONUS_INTERNAL_SECRET`.
- [ ] **Step 2:** Runbook: add `TONUS_INTERNAL_SECRET` (generation: `openssl rand -hex 32`; set via `npx supabase secrets set`) and `TONUS_ALLOWED_ORIGINS` entries.
- [ ] **Step 3: Commit** `docs(security): abuse-controls guide and new secrets`.

### Task 11: Full gate, PR, deploy, smoke

- [ ] **Step 1: Full Phase 0 gate:** `npm test && npm run build && npm run lint:ceiling && npm run check:functions && npm run test:scripts && npm run test:readme && npm run test:e2e` (Node 24).
- [ ] **Step 2:** Push branch `feat/internal-auth-abuse-controls`, open PR titled `feat(security): dedicated internal auth and minimum abuse controls`, wait for green CI, merge.
- [ ] **Step 3: Secrets first:** `npx supabase secrets set TONUS_INTERNAL_SECRET=<openssl rand -hex 32> TONUS_ALLOWED_ORIGINS=https://tonus-anatolii-s-projects6.vercel.app --project-ref mxnmubakfzqoosgsqmhh` (never record the secret value).
- [ ] **Step 4: Deploy from clean main checkout, callees before callers:** `coach-profile`, `biweekly-report`, `suggest-experiments`, then `telegram-bot`, `send-reminders`, then the CORS/rate-limit set: `analyze-health chat-health classify-meal coach-weekly deep-research extract-lab fetch-cal fetch-environment fetch-ics generate-recommendations report-client-error send-football-reminders supplement-schedule sync-cal sync-football-fixtures ingest-health widget-data` (ingest-health with `--no-verify-jwt`).
- [ ] **Step 5: Smoke (black box, no credentials recorded):**
  - internal path denied: `curl -X POST .../biweekly-report -H 'Authorization: Bearer <anon>' -H 'x-user-id: <uuid>' -H 'x-internal-secret: wrong'` → 401;
  - service-role-as-bearer still works during dual-accept (expected until PR 3b);
  - CORS: `curl -i -X OPTIONS .../analyze-health -H 'Origin: https://evil.example'` → no `Access-Control-Allow-Origin`; with the prod origin → echoed;
  - rate limit: >120 GETs to `widget-data?token=<invalid>` → 429 after the limit;
  - positive: Telegram `/report` flow and the production UI still function.
- [ ] **Step 6:** Deployment receipt (functions, ref, SHA, operator, time, smoke result) as a PR comment.

### Task 12: PR 3b — remove the service-role bearer path

**Files:**
- Modify: `supabase/functions/coach-profile/index.ts`, `biweekly-report/index.ts`, `suggest-experiments/index.ts` (drop `|| isServiceRoleCall(...)` and the import)
- Delete: `supabase/functions/_shared/serviceRoleAuth.ts`, `supabase/functions/_shared/serviceRoleAuth.test.ts`

- [ ] **Step 1:** Only after Task 11 smoke confirms callers use the new secret. Remove the dual-accept branch so the condition reads `if (serviceUserId && isValidInternalSecret(req, INTERNAL_SECRET))`. Delete `serviceRoleAuth.ts` + test; `grep -rn "isServiceRoleCall\|serviceRoleAuth" supabase/` → empty.
- [ ] **Step 2:** Update `security/inventory-classification.json` credential notes if they still mention the service role for these functions; regenerate the inventory.
- [ ] **Step 3:** Full gate (Step 1 of Task 11) → green.
- [ ] **Step 4:** Branch `feat/internal-auth-cleanup`, PR `feat(security): drop service-role bearer from internal calls`, merge on green.
- [ ] **Step 5:** Redeploy `coach-profile`, `biweekly-report`, `suggest-experiments`. Smoke: service-role-as-bearer now → 401; internal secret path → works; Telegram `/report` → works. Receipt as PR comment.

---

## Acceptance mapping (spec §4 PR 3)

- "No internal HTTP caller sends the service-role key" → Tasks 3 + 12.
- "Missing/wrong internal secrets fail closed before side effects" → `secretMatches` fail-closed + Task 11/12 smoke.
- "UI-only CORS rejects unapproved origins while documented non-browser clients still work" → Tasks 4, 5, 10 + smoke.
- "Rate-limit tests cover allowed traffic, exceeded limits, reset behavior, and isolation" → Task 7 unit tests (allowed/exceeded/isolation/fail-closed) + Task 6 live RPC probe (reset = window rollover in SQL, verified by the two-window probe) + Task 11 smoke.

## Rollback

- Secrets misconfigured (`TONUS_INTERNAL_SECRET` unset): internal calls 401 fail closed; set the secret, no redeploy needed.
- Broken CORS (UI blocked): fix `TONUS_ALLOWED_ORIGINS` secret value; no redeploy needed.
- A callee breaking before PR 3b: keep dual-accept deployed and forward-fix; never redeploy a pre-PR 0 version.
- After PR 3b, rollback may disable an internal workflow but never restores the service-role bearer path.
