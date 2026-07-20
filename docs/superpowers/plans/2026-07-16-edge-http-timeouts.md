# Edge Functions HTTP Timeouts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every outbound HTTP call in Edge Functions gets a deadline (and one retry for idempotent GETs), enforced by a guard test.

**Architecture:** One pure helper `_shared/http.ts` (`fetchWithTimeout`) built on `AbortSignal.timeout`. Two choke points get it first — `fetchGeminiWithConsent` (all AI calls) and a new shared `sendTelegram` (all bot sends). Remaining raw `fetch` call sites migrate file-by-file, driven by a guard test with a shrinking allowlist (ratchet pattern, like `.lint-ceiling`).

**Tech Stack:** Deno-compatible TypeScript (no Deno-only APIs — the module is also imported by vitest node tests), vitest for tests.

**Spec:** `docs/superpowers/specs/2026-07-16-tech-debt-workstream-b.md` (item B1)

---

### Task 1: `fetchWithTimeout` helper

**Files:**
- Create: `supabase/functions/_shared/http.ts`
- Test: `supabase/functions/_shared/http.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// supabase/functions/_shared/http.test.ts
import { describe, expect, it, vi } from 'vitest'
import { fetchWithTimeout } from './http.ts'

const okResponse = () => new Response('ok', { status: 200 })

describe('fetchWithTimeout', () => {
  it('passes url, init and an abort signal to the underlying fetch', async () => {
    const impl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal)
      expect(init?.method).toBe('POST')
      return okResponse()
    })
    const res = await fetchWithTimeout('https://x.test/api', { method: 'POST', timeoutMs: 5000, fetchImpl: impl })
    expect(res.status).toBe(200)
    expect(impl).toHaveBeenCalledTimes(1)
  })

  it('rejects when the deadline fires', async () => {
    const impl = (_url: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal!.reason))
      })
    await expect(
      fetchWithTimeout('https://x.test/slow', { timeoutMs: 20, fetchImpl: impl }),
    ).rejects.toThrow(/timed out|timeout/i)
  })

  it('retries a GET once on 5xx and returns the second response', async () => {
    const impl = vi.fn()
      .mockResolvedValueOnce(new Response('boom', { status: 503 }))
      .mockResolvedValueOnce(okResponse())
    const res = await fetchWithTimeout('https://x.test/api', { retryOn5xx: true, fetchImpl: impl })
    expect(res.status).toBe(200)
    expect(impl).toHaveBeenCalledTimes(2)
  })

  it('retries a GET once on network error', async () => {
    const impl = vi.fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(okResponse())
    const res = await fetchWithTimeout('https://x.test/api', { retryOn5xx: true, fetchImpl: impl })
    expect(res.status).toBe(200)
    expect(impl).toHaveBeenCalledTimes(2)
  })

  it('does not retry non-GET methods even with retryOn5xx', async () => {
    const impl = vi.fn().mockResolvedValue(new Response('boom', { status: 503 }))
    const res = await fetchWithTimeout('https://x.test/api', { method: 'POST', retryOn5xx: true, fetchImpl: impl })
    expect(res.status).toBe(503)
    expect(impl).toHaveBeenCalledTimes(1)
  })

  it('does not retry by default', async () => {
    const impl = vi.fn().mockResolvedValue(new Response('boom', { status: 503 }))
    const res = await fetchWithTimeout('https://x.test/api', { fetchImpl: impl })
    expect(res.status).toBe(503)
    expect(impl).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && VITE_DEMO=0 npx vitest run supabase/functions/_shared/http.test.ts`
Expected: FAIL — `Cannot find module './http.ts'`

- [ ] **Step 3: Write the implementation**

```ts
// supabase/functions/_shared/http.ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `VITE_DEMO=0 npx vitest run supabase/functions/_shared/http.test.ts`
Expected: 6 passed

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/http.ts supabase/functions/_shared/http.test.ts
git commit -m "feat(edge): fetchWithTimeout helper with deadline and idempotent retry"
```

---

### Task 2: Wire the AI choke point (`fetchGeminiWithConsent`)

**Files:**
- Modify: `supabase/functions/_shared/aiConsent.ts` (function `fetchGeminiWithConsent`, ~line 70)
- Test: `supabase/functions/_shared/aiConsent.test.ts` (append)

- [ ] **Step 1: Write the failing test** — append to `aiConsent.test.ts`, matching its existing mock style for the consent client:

```ts
it('applies an abort deadline to the provider call', async () => {
  let sawSignal: AbortSignal | undefined
  const providerFetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    sawSignal = init?.signal ?? undefined
    return new Response('{}', { status: 200 })
  }) as typeof fetch
  await fetchGeminiWithConsent(consentedClient(), 'user-1', 'https://ai.test', { method: 'POST' }, providerFetch)
  expect(sawSignal).toBeInstanceOf(AbortSignal)
})
```

(`consentedClient()` — reuse the existing helper/mock in that test file that satisfies `requireAiConsent`; if it's named differently, use the local name.)

- [ ] **Step 2: Run to verify it fails**

Run: `VITE_DEMO=0 npx vitest run supabase/functions/_shared/aiConsent.test.ts`
Expected: FAIL — `sawSignal` is `undefined`

- [ ] **Step 3: Implement** — in `aiConsent.ts`, import and use the helper:

```ts
import { AI_TIMEOUT_MS, fetchWithTimeout } from './http.ts'

export async function fetchGeminiWithConsent(
  client: unknown,
  userId: string,
  input: RequestInfo | URL,
  init?: RequestInit,
  providerFetch: ProviderFetch = fetch,
): Promise<Response> {
  await requireAiConsent(client as AiConsentClient, userId)
  return fetchWithTimeout(input, { ...init, timeoutMs: AI_TIMEOUT_MS, fetchImpl: providerFetch as typeof fetch })
}
```

- [ ] **Step 4: Run the whole `_shared` test set**

Run: `VITE_DEMO=0 npx vitest run supabase/functions/_shared/`
Expected: all pass (existing aiConsent tests must not break — the signature is unchanged)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/aiConsent.ts supabase/functions/_shared/aiConsent.test.ts
git commit -m "feat(edge): deadline on all Gemini calls via fetchGeminiWithConsent"
```

---

### Task 3: Shared `sendTelegram` with timeout

**Files:**
- Create: `supabase/functions/_shared/telegram.ts`
- Test: `supabase/functions/_shared/telegram.test.ts`
- Modify: `supabase/functions/biweekly-report/index.ts` (delete local `sendTelegram`, ~line 86; import shared)

- [ ] **Step 1: Write the failing tests**

```ts
// supabase/functions/_shared/telegram.test.ts
import { describe, expect, it, vi } from 'vitest'
import { sendTelegram } from './telegram.ts'

describe('sendTelegram', () => {
  it('posts sendMessage with chat_id and text and a deadline', async () => {
    const impl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe('https://api.telegram.org/botTOKEN/sendMessage')
      expect(init?.method).toBe('POST')
      expect(init?.signal).toBeInstanceOf(AbortSignal)
      expect(JSON.parse(String(init?.body))).toEqual({ chat_id: '42', text: 'hi' })
      return new Response('{"ok":true}', { status: 200 })
    })
    const res = await sendTelegram('TOKEN', '42', 'hi', { fetchImpl: impl })
    expect(res?.status).toBe(200)
  })

  it('returns null without calling fetch when the token is empty', async () => {
    const impl = vi.fn()
    const res = await sendTelegram('', '42', 'hi', { fetchImpl: impl })
    expect(res).toBeNull()
    expect(impl).not.toHaveBeenCalled()
  })

  it('merges extra payload fields (parse_mode, reply_markup)', async () => {
    const impl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body)).parse_mode).toBe('HTML')
      return new Response('{"ok":true}', { status: 200 })
    })
    await sendTelegram('TOKEN', '42', 'hi', { payload: { parse_mode: 'HTML' }, fetchImpl: impl })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `VITE_DEMO=0 npx vitest run supabase/functions/_shared/telegram.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```ts
// supabase/functions/_shared/telegram.ts
// Single Telegram Bot API send path with a deadline. Empty token is a no-op
// (test environments run without the bot configured).

import { fetchWithTimeout } from './http.ts'

export interface SendTelegramOptions {
  payload?: Record<string, unknown>
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

export async function sendTelegram(
  token: string,
  chatId: string,
  text: string,
  opts: SendTelegramOptions = {},
): Promise<Response | null> {
  if (!token) return null
  return fetchWithTimeout(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, ...opts.payload }),
    timeoutMs: opts.timeoutMs,
    fetchImpl: opts.fetchImpl,
  })
}
```

- [ ] **Step 4: Run tests**

Run: `VITE_DEMO=0 npx vitest run supabase/functions/_shared/telegram.test.ts`
Expected: 3 passed

- [ ] **Step 5: Migrate `biweekly-report`** — delete its local `sendTelegram` (lines ~86–94) and replace call sites:

```ts
import { sendTelegram } from '../_shared/telegram.ts'
```

Call sites change from `sendTelegram(chatId, text)` to `sendTelegram(TG_TOKEN, chatId, text)`. Remove the now-unused local `TG_TOKEN` guard inside the deleted function (the shared helper handles the empty token).

- [ ] **Step 6: Type-check functions and run full tests**

Run: `export PATH="$HOME/.deno/bin:$PATH" && npm run check:functions && VITE_DEMO=0 npm test`
Expected: deno errors ≤ ceiling 16; all vitest pass

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/telegram.ts supabase/functions/_shared/telegram.test.ts supabase/functions/biweekly-report/index.ts
git commit -m "feat(edge): shared sendTelegram with deadline; migrate biweekly-report"
```

---

### Task 4: Guard test with a shrinking allowlist

**Files:**
- Create: `scripts/edge-fetch-guard.test.mjs`
- Modify: `package.json` only if `test:scripts` doesn't already glob `scripts/*.test.mjs` (check first: `grep test:scripts package.json`)

- [ ] **Step 1: Write the guard (it must FAIL-list the current raw call sites, i.e. pass today with the allowlist, fail when a new raw fetch appears or when an allowlisted file is cleaned but not removed from the list)**

```js
// scripts/edge-fetch-guard.test.mjs
// Ratchet: every outbound fetch in Edge Functions must use _shared/http.ts.
// Files listed below still contain raw fetch calls; migrate a file, then
// REMOVE it from the list. Adding new raw fetch anywhere fails this test.
import { test } from 'node:test'
import assert from 'node:assert'
import { execSync } from 'node:child_process'

const ALLOWLIST = new Set([
  'supabase/functions/telegram-bot/index.ts',
  'supabase/functions/sync-football-fixtures/index.ts',
  'supabase/functions/sync-cal/index.ts',
  'supabase/functions/send-reminders/index.ts',
  'supabase/functions/register-webhook/index.ts',
  'supabase/functions/fetch-environment/index.ts',
  'supabase/functions/send-football-reminders/index.ts',
  'supabase/functions/ingest-health/index.ts',
  'supabase/functions/fetch-ics/index.ts',
  'supabase/functions/fetch-cal/index.ts',
  'supabase/functions/coach-weekly/index.ts',
  'supabase/functions/_shared/observability.ts',
  'supabase/functions/_shared/reminderDelivery.ts',
  'supabase/functions/_shared/football.ts',
])

const grep = () => {
  try {
    return execSync(
      String.raw`grep -rln --include='*.ts' -E '(^|[^.\w])fetch\(' supabase/functions | grep -v '\.test\.' | grep -v '_shared/http\.ts'`,
      { encoding: 'utf8' },
    ).trim().split('\n').filter(Boolean)
  } catch { return [] }
}

test('raw fetch in edge functions only where allowlisted', () => {
  const offenders = grep()
  const newRaw = offenders.filter((f) => !ALLOWLIST.has(f))
  assert.deepEqual(newRaw, [], `raw fetch outside allowlist (use _shared/http.ts): ${newRaw.join(', ')}`)
  const stale = [...ALLOWLIST].filter((f) => !offenders.includes(f))
  assert.deepEqual(stale, [], `allowlist entries now clean — remove them: ${stale.join(', ')}`)
})
```

Before committing, adjust `ALLOWLIST` to the actual grep output at that moment (Tasks 2–3 may already have cleaned files): run the grep from the test manually and copy the file list verbatim.

- [ ] **Step 2: Run it**

Run: `npm run test:scripts`
Expected: PASS (list matches reality exactly)

- [ ] **Step 3: Commit**

```bash
git add scripts/edge-fetch-guard.test.mjs
git commit -m "test(edge): ratchet guard — outbound fetch must use _shared/http.ts"
```

---

### Task 5: Migrate remaining call sites, shrinking the allowlist

**Files (one commit per file, any order):** every file remaining in `ALLOWLIST`.

For each file:

- [ ] **Step 1:** Add `import { fetchWithTimeout } from '../_shared/http.ts'` (or `'./http.ts'` from `_shared`) and replace each `fetch(url, init)` with:
  - external GET (ESPN, GFZ, weather, ICS, calendar): `fetchWithTimeout(url, { ...init, retryOn5xx: true })`
  - POST / webhook / internal function call: `fetchWithTimeout(url, init)` (default 10 s, no retry — not idempotent)
  - Telegram `sendMessage` bodies: prefer replacing the whole call with `sendTelegram(...)` from `_shared/telegram.ts` where the payload is chat_id+text(+parse_mode); keep `fetchWithTimeout` for other Bot API methods (`editMessageText`, `answerCallbackQuery`, `setWebhook`).
- [ ] **Step 2:** Remove the file from `ALLOWLIST` in `scripts/edge-fetch-guard.test.mjs`.
- [ ] **Step 3:** Run: `npm run test:scripts && npm run check:functions && VITE_DEMO=0 npm test` — all green, deno ≤ 16.
- [ ] **Step 4:** Commit: `git commit -m "refactor(<fn-name>): outbound fetch via fetchWithTimeout"`

Note for `_shared/observability.ts` and `_shared/reminderDelivery.ts`: they already implement their own guards; migrate them onto `fetchWithTimeout` only if it simplifies the code — otherwise keep their logic and just remove them from the allowlist by switching their inner `fetch` to `fetchImpl`-injected `fetchWithTimeout`. If a genuine exception must remain, document it with a comment and keep it allowlisted.

---

### Task 6: PR, merge, deploy

- [ ] **Step 1:** Full gate: `VITE_DEMO=0 npm test && npm run test:scripts && npm run lint:ceiling && npm run check:functions && npm run build`
- [ ] **Step 2:** Branch was `feat/edge-http-timeouts`; push, open PR titled `feat(edge): outbound HTTP deadlines and retry`, body links the spec. Merge on green (`gh pr update-branch` first if base moved).
- [ ] **Step 3:** Deploy every function whose files changed, respecting `supabase/config.toml` verify_jwt split (see `docs/guides/security-secrets-runbook.md` deploy order; `--no-verify-jwt` for the false-list only).
- [ ] **Step 4:** Smoke: `/report` in Telegram (owner) or check `get_logs`-equivalent via Management API for a clean cron cycle of `send-reminders` within 10 min.
