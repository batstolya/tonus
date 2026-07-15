# Security Boundaries Implementation Plan

> [!CAUTION]
> Historical execution record. Do not run deployment commands from this file.
> Use `docs/guides/edge-function-deployments.md` and `npm run deploy:functions`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every side-effecting Tonus endpoint behind a mandatory, fail-closed secret check, and stop tracking the Chromium browser profile / runtime state in git.

**Architecture:** Introduce one pure, vitest-testable auth helper (`_shared/auth.ts`) that fails closed (missing/empty secret ⇒ deny). Every cron/webhook/admin endpoint reads its secret and calls the helper *before* reading the body, creating a service client, or calling Telegram/Gemini. Browser profile + runtime files leave the working tree via `.gitignore` + `git rm --cached`, guarded by a repo-hygiene test.

**Tech Stack:** Deno edge functions (Supabase), TypeScript, vitest (node env). Secrets live in Supabase Function secrets, never in SQL/Vercel/git.

**Source spec:** `docs/superpowers/specs/architecture-hardening/2026-07-09-security-boundaries-design.md`

**Scope reminders from the spec review (2026-07-10):**
- Do the whole security spec, *first* of the three hardening specs.
- `register-webhook`: keep as a protected endpoint guarded by `TONUS_ADMIN_SECRET` (not deleted).
- Git history rewrite (§4.2 steps 3–5) is **deferred** — this plan only does `.gitignore` + `git rm --cached` and flags session rotation for the owner.
- One canonical `TONUS_CRON_SECRET`; existing `CRON_SECRET` / `FOOTBALL_INTERNAL_SECRET` accepted as temporary deploy-time aliases.

---

## File Structure

- **Create** `supabase/functions/_shared/auth.ts` — pure secret-comparison helpers (fail closed, timing-safe compare). No Deno-URL imports so vitest can load it.
- **Create** `supabase/functions/_shared/auth.test.ts` — unit tests for the helper.
- **Create** `tests/repo-hygiene.test.ts` — asserts `git ls-files` tracks no browser profile / pid / state.json.
- **Modify** `.gitignore` — ignore browser profile + runtime files.
- **Modify** `supabase/functions/telegram-bot/index.ts` — enforce Telegram secret header before any side effect.
- **Modify** `supabase/functions/send-reminders/index.ts` — take `req`, require cron secret.
- **Modify** `supabase/functions/coach-weekly/index.ts` — explicit cron-secret / JWT / 401 split; drop service-key partial match.
- **Modify** `supabase/functions/sync-cal/index.ts` — fail-closed cron check via helper.
- **Modify** `supabase/functions/send-football-reminders/index.ts` — fail-closed cron check via helper.
- **Modify** `supabase/functions/sync-football-fixtures/index.ts` — fail-closed cron check via helper.
- **Modify** `supabase/functions/register-webhook/index.ts` — require admin secret; trim `info` response.
- **Create** `docs/guides/security-secrets-runbook.md` — secrets list, deploy order, webhook re-registration, session rotation.

---

## Task 1: Remove browser profile & runtime state from git

**Files:**
- Modify: `.gitignore`
- Test: `tests/repo-hygiene.test.ts`
- Untrack (working tree kept): `claude-monitor/browser-profile/`, `claude-monitor/data/state.json`, `claude-monitor/data/*.pid`

- [ ] **Step 1: Write the failing repo-hygiene test**

Create `tests/repo-hygiene.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { execSync } from 'node:child_process'

// Runtime artifacts (Chromium cookies/cache/history, PID, state snapshot) must
// never be tracked. Spec §4.1 / acceptance "repository test".
describe('repo hygiene', () => {
  const tracked = execSync('git ls-files', { encoding: 'utf8' }).split('\n')

  it('does not track the claude-monitor browser profile', () => {
    const leaked = tracked.filter(f => f.startsWith('claude-monitor/browser-profile/'))
    expect(leaked).toEqual([])
  })

  it('does not track runtime pid or state snapshots', () => {
    const leaked = tracked.filter(
      f => f.endsWith('.pid') || f === 'claude-monitor/data/state.json',
    )
    expect(leaked).toEqual([])
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- repo-hygiene`
Expected: FAIL — 374 `browser-profile/` files + `claude-monitor/data/state.json` still tracked.

- [ ] **Step 3: Add ignore rules**

Append to `.gitignore`:

```gitignore
# claude-monitor runtime artifacts (never commit sessions/cache/state)
claude-monitor/browser-profile/
claude-monitor/data/*.pid
claude-monitor/data/state.json
```

- [ ] **Step 4: Untrack the files (working copies stay on disk)**

Run:
```bash
git rm -r --cached claude-monitor/browser-profile
git rm --cached claude-monitor/data/state.json
git ls-files 'claude-monitor/**/*.pid' | xargs -r git rm --cached
```
Expected: `rm` lines for ~374 + 1 files; no deletions from the working tree.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- repo-hygiene`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add .gitignore tests/repo-hygiene.test.ts
git add -u claude-monitor/
git commit -m "chore(security): stop tracking browser profile & runtime state"
```

> **Owner action (manual, not a commit):** any Telegram/Google/Supabase session that lived in `claude-monitor/browser-profile/` should be rotated — see `docs/guides/security-secrets-runbook.md` (Task 9). History rewrite is deferred per scope.

---

## Task 2: Pure fail-closed auth helper

**Files:**
- Create: `supabase/functions/_shared/auth.ts`
- Test: `supabase/functions/_shared/auth.test.ts`

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/_shared/auth.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { secretMatches, isValidCronSecret, isValidTelegramSecret, isValidAdminSecret } from './auth.ts'

const reqWith = (headers: Record<string, string>) =>
  new Request('https://x/', { method: 'POST', headers })

describe('secretMatches (fail closed)', () => {
  it('denies when expected secret is missing/empty', () => {
    expect(secretMatches('anything', undefined)).toBe(false)
    expect(secretMatches('anything', '')).toBe(false)
  })
  it('denies when provided value is missing/empty', () => {
    expect(secretMatches(null, 'topsecret')).toBe(false)
    expect(secretMatches('', 'topsecret')).toBe(false)
  })
  it('denies on mismatch', () => {
    expect(secretMatches('wrong', 'topsecret')).toBe(false)
  })
  it('denies on length-only prefix match (no partial credit)', () => {
    expect(secretMatches('topsecret', 'topsecretXYZ')).toBe(false)
  })
  it('accepts an exact match', () => {
    expect(secretMatches('topsecret', 'topsecret')).toBe(true)
  })
})

describe('request header readers', () => {
  it('cron: reads x-cron-secret', () => {
    expect(isValidCronSecret(reqWith({ 'x-cron-secret': 's' }), 's')).toBe(true)
    expect(isValidCronSecret(reqWith({}), 's')).toBe(false)
    expect(isValidCronSecret(reqWith({ 'x-cron-secret': 's' }), '')).toBe(false)
  })
  it('telegram: reads X-Telegram-Bot-Api-Secret-Token (case-insensitive)', () => {
    expect(isValidTelegramSecret(reqWith({ 'x-telegram-bot-api-secret-token': 't' }), 't')).toBe(true)
    expect(isValidTelegramSecret(reqWith({}), 't')).toBe(false)
  })
  it('admin: reads x-admin-secret', () => {
    expect(isValidAdminSecret(reqWith({ 'x-admin-secret': 'a' }), 'a')).toBe(true)
    expect(isValidAdminSecret(reqWith({}), 'a')).toBe(false)
  })
})
```

- [ ] **Step 2: Run it and verify it fails**

Run: `npm test -- _shared/auth`
Expected: FAIL — `Cannot find module './auth.ts'`.

- [ ] **Step 3: Implement the helper**

Create `supabase/functions/_shared/auth.ts`:

```ts
// Границы авторизации Tonus. Fail closed: пустой/незаданный секрет = отказ.
// Чистый модуль (без Deno-URL импортов) → тестируется vitest.
// Спека: docs/superpowers/specs/architecture-hardening/2026-07-09-security-boundaries-design.md §2, §3.

// Сравнение постоянного времени (не зависит от места первого различия).
// Разная длина → сразу false, но без раннего выхода по содержимому.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// Единственная точка правды для «этот секрет верный?».
export function secretMatches(
  provided: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  if (!expected) return false // нет секрета в runtime → отказ (fail closed)
  if (!provided) return false
  return timingSafeEqual(provided, expected)
}

export function isValidCronSecret(req: Request, expected: string | undefined): boolean {
  return secretMatches(req.headers.get('x-cron-secret'), expected)
}

export function isValidTelegramSecret(req: Request, expected: string | undefined): boolean {
  return secretMatches(req.headers.get('x-telegram-bot-api-secret-token'), expected)
}

export function isValidAdminSecret(req: Request, expected: string | undefined): boolean {
  return secretMatches(req.headers.get('x-admin-secret'), expected)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- _shared/auth`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/auth.ts supabase/functions/_shared/auth.test.ts
git commit -m "feat(security): fail-closed auth helper for edge functions"
```

---

## Task 3: Enforce Telegram secret in telegram-bot

**Files:**
- Modify: `supabase/functions/telegram-bot/index.ts:15` (import + secret), `:638` (serve entry)

- [ ] **Step 1: Add the import**

At the top of `supabase/functions/telegram-bot/index.ts`, after the existing `_shared` imports (near line 10), add:

```ts
import { isValidTelegramSecret } from '../_shared/auth.ts'
```

- [ ] **Step 2: Guard the handler before any side effect**

Replace the start of the `serve` block (currently at line 638):

```ts
serve(async (req) => {

  const body = await req.json().catch(() => null)
  if (!body) return new Response('ok')

  // Setup commands on every request (idempotent, fast)
  setupCommands().catch(() => {})

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
```

with:

```ts
serve(async (req) => {
  // Fail closed: секрет обязателен в runtime (спека §3.1).
  if (!WEBHOOK_SECRET) return new Response('webhook secret not configured', { status: 503 })
  // Проверяем заголовок Telegram ДО чтения тела, setupCommands и createClient.
  if (!isValidTelegramSecret(req, WEBHOOK_SECRET)) return new Response('unauthorized', { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return new Response('ok')

  // Setup commands on every request (idempotent, fast)
  setupCommands().catch(() => {})

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
```

- [ ] **Step 3: Static check**

Run: `grep -n "isValidTelegramSecret\|WEBHOOK_SECRET" supabase/functions/telegram-bot/index.ts`
Expected: import present; `WEBHOOK_SECRET` now referenced in the guard (no longer dead).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/telegram-bot/index.ts
git commit -m "feat(security): reject telegram-bot requests without valid secret header"
```

> Deploy note (Task 9): after deploy, webhook MUST be re-registered so Telegram starts sending `X-Telegram-Bot-Api-Secret-Token`.

---

## Task 4: Require cron secret in send-reminders

**Files:**
- Modify: `supabase/functions/send-reminders/index.ts:1-7` (imports/env), `:35` (serve entry)

- [ ] **Step 1: Add import + secret env**

In `supabase/functions/send-reminders/index.ts`, after the existing imports/env (around line 3–7), add:

```ts
import { isValidCronSecret } from '../_shared/auth.ts'
const CRON_SECRET = Deno.env.get('TONUS_CRON_SECRET') ?? Deno.env.get('CRON_SECRET') ?? ''
```

- [ ] **Step 2: Take `req` and guard before touching the DB**

Replace the current entry (line 35):

```ts
serve(async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
```

with:

```ts
serve(async (req) => {
  // Fail closed: без корректного cron-секрета не читаем таблицы и не шлём (спека §3.2).
  if (!isValidCronSecret(req, CRON_SECRET)) return new Response('unauthorized', { status: 401 })
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
```

- [ ] **Step 3: Static check**

Run: `grep -n "isValidCronSecret\|serve(async (req)\|TONUS_CRON_SECRET" supabase/functions/send-reminders/index.ts`
Expected: import, `TONUS_CRON_SECRET`, and `serve(async (req)` all present.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/send-reminders/index.ts
git commit -m "feat(security): require cron secret for send-reminders"
```

---

## Task 5: Explicit auth split in coach-weekly

**Files:**
- Modify: `supabase/functions/coach-weekly/index.ts:1-10` (import/env/CORS), `:162-167` (auth logic)

- [ ] **Step 1: Add import + cron secret; expose header in CORS**

In `supabase/functions/coach-weekly/index.ts`, after the imports (line 3) add:

```ts
import { isValidCronSecret } from '../_shared/auth.ts'
```

After the env block (line 8) add:

```ts
const CRON_SECRET = Deno.env.get('TONUS_CRON_SECRET') ?? ''
```

Update the CORS constant (line 10) to allow the header:

```ts
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, x-cron-secret' }
```

- [ ] **Step 2: Replace the trust logic**

Replace these lines (currently ~162–167):

```ts
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const authHeader = req.headers.get('Authorization') ?? ''
    const body = await req.json().catch(() => ({}))
    // нет токена пользователя → режим cron (всем); есть → конкретному пользователю
    const cronMode = !authHeader || authHeader.includes(SUPABASE_SERVICE_KEY.slice(0, 20))
```

with:

```ts
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const authHeader = req.headers.get('Authorization') ?? ''
    const body = await req.json().catch(() => ({}))
    // Явные пути (спека §3.2): cron-секрет → массовый режим; JWT → свой юзер; иначе 401.
    // Отсутствие Authorization больше НЕ означает доверие, и service key не является маркером.
    const cronMode = isValidCronSecret(req, CRON_SECRET)
    if (!cronMode && !authHeader) {
      return new Response('unauthorized', { status: 401, headers: CORS })
    }
```

- [ ] **Step 3: Static check**

Run: `grep -n "isValidCronSecret\|slice(0, 20)\|cronMode" supabase/functions/coach-weekly/index.ts`
Expected: `isValidCronSecret` present; `slice(0, 20)` **gone**; `cronMode` derived from the helper. The existing `if (cronMode && !body.userId)` branch and the JWT `supabase.auth.getUser` branch below are unchanged.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/coach-weekly/index.ts
git commit -m "feat(security): explicit cron-secret/JWT/401 split in coach-weekly"
```

---

## Task 6: Fail-closed cron check in sync-cal & football functions

These already read `x-cron-secret` but with a fail-*open* guard (`if (SECRET && header === SECRET)` — empty secret disables the check). Route them through the helper and accept `TONUS_CRON_SECRET` with the old secret as a temporary alias.

**Files:**
- Modify: `supabase/functions/sync-cal/index.ts:9,124`
- Modify: `supabase/functions/send-football-reminders/index.ts:6,25`
- Modify: `supabase/functions/sync-football-fixtures/index.ts:19,36`

- [ ] **Step 1: sync-cal — helper + alias**

Add import near the top of `supabase/functions/sync-cal/index.ts`:

```ts
import { isValidCronSecret } from '../_shared/auth.ts'
```

Change the secret env (line 9):

```ts
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? ''
```
to:
```ts
const CRON_SECRET = Deno.env.get('TONUS_CRON_SECRET') ?? Deno.env.get('CRON_SECRET') ?? ''
```

Change the cron branch condition (line 124):

```ts
    if (CRON_SECRET && req.headers.get('x-cron-secret') === CRON_SECRET) {
```
to:
```ts
    if (isValidCronSecret(req, CRON_SECRET)) {
```

(The user-JWT path below the cron branch stays as-is.)

- [ ] **Step 2: send-football-reminders — helper + alias + fail closed**

Add import at the top of `supabase/functions/send-football-reminders/index.ts`:

```ts
import { isValidCronSecret } from '../_shared/auth.ts'
```

Change the secret env (line 6):

```ts
const FOOTBALL_INTERNAL_SECRET = Deno.env.get('FOOTBALL_INTERNAL_SECRET') ?? ''
```
to:
```ts
const CRON_SECRET = Deno.env.get('TONUS_CRON_SECRET') ?? Deno.env.get('FOOTBALL_INTERNAL_SECRET') ?? ''
```

Replace the guard (line 25), which currently passes when the secret is empty:

```ts
  if (FOOTBALL_INTERNAL_SECRET && req.headers.get('x-cron-secret') !== FOOTBALL_INTERNAL_SECRET) {
```
with a fail-closed check (keep the same body/response that follows the brace):

```ts
  if (!isValidCronSecret(req, CRON_SECRET)) {
```

- [ ] **Step 3: sync-football-fixtures — helper + alias + fail closed**

Add import at the top of `supabase/functions/sync-football-fixtures/index.ts`:

```ts
import { isValidCronSecret } from '../_shared/auth.ts'
```

Change the secret env (line 19) the same way:

```ts
const CRON_SECRET = Deno.env.get('TONUS_CRON_SECRET') ?? Deno.env.get('FOOTBALL_INTERNAL_SECRET') ?? ''
```

Replace the guard (line 36):

```ts
  if (FOOTBALL_INTERNAL_SECRET && req.headers.get('x-cron-secret') !== FOOTBALL_INTERNAL_SECRET) {
```
with:

```ts
  if (!isValidCronSecret(req, CRON_SECRET)) {
```

- [ ] **Step 4: Static check — no fail-open guards remain**

Run: `grep -rn "SECRET &&\|=== CRON_SECRET\|!== FOOTBALL_INTERNAL_SECRET" supabase/functions/`
Expected: no matches (all fail-open guards replaced).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/sync-cal/index.ts supabase/functions/send-football-reminders/index.ts supabase/functions/sync-football-fixtures/index.ts
git commit -m "feat(security): fail-closed cron check for sync-cal & football functions"
```

---

## Task 7: Protect register-webhook with admin secret

**Files:**
- Modify: `supabase/functions/register-webhook/index.ts`

- [ ] **Step 1: Rewrite with admin guard + trimmed info response**

Replace the whole file `supabase/functions/register-webhook/index.ts` with:

```ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { isValidAdminSecret } from '../_shared/auth.ts'

const ADMIN_SECRET = Deno.env.get('TONUS_ADMIN_SECRET') ?? ''

serve(async (req) => {
  // Не пользовательская функция: только закрытая operational-команда (спека §3.3).
  if (!ADMIN_SECRET) return new Response('admin secret not configured', { status: 503 })
  if (!isValidAdminSecret(req, ADMIN_SECRET)) return new Response('unauthorized', { status: 401 })

  const token = Deno.env.get('TELEGRAM_BOT_TOKEN')!
  const webhookUrl = 'https://mxnmubakfzqoosgsqmhh.supabase.co/functions/v1/telegram-bot'
  const secret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET') ?? ''

  const body = await req.json().catch(() => ({}))

  if (body.action === 'info') {
    const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`)
    const data = await res.json()
    // Только безопасный минимум, не весь ответ Telegram (спека §3.3).
    const r = data?.result ?? {}
    const safe = {
      url: r.url ?? null,
      pending_update_count: r.pending_update_count ?? null,
      last_error_date: r.last_error_date ?? null,
      last_error_message: r.last_error_message ?? null,
    }
    return new Response(JSON.stringify(safe), { headers: { 'Content-Type': 'application/json' } })
  }

  if (body.action === 'commands') {
    const res = await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commands: [
          { command: 'menu', description: '🏠 Главное меню' },
          { command: 'report', description: '📊 Двухнедельный отчёт' },
          { command: 'status', description: '📈 Статус за сегодня' },
          { command: 'sync', description: '📲 Дата последней синхронизации' },
          { command: 'pause', description: '⏸ Приостановить отчёты' },
          { command: 'resume', description: '▶️ Возобновить отчёты' },
        ],
      }),
    })
    const data = await res.json()
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: webhookUrl, secret_token: secret }),
  })
  const data = await res.json()
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
})
```

- [ ] **Step 2: Static check**

Run: `grep -n "isValidAdminSecret\|ADMIN_SECRET\|getWebhookInfo" supabase/functions/register-webhook/index.ts`
Expected: admin guard present before body read; info branch returns only the 4 safe fields.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/register-webhook/index.ts
git commit -m "feat(security): gate register-webhook behind admin secret, trim info response"
```

---

## Task 8: Full test + build gate

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: PASS, including `_shared/auth` and `tests/repo-hygiene`. No previously-green test regresses.

- [ ] **Step 2: Type-check / build**

Run: `npm run build`
Expected: `tsc -b && vite build` succeeds (edge functions are Deno, not part of `tsc -b`, but this confirms the frontend is unaffected).

- [ ] **Step 3: Lint ceiling**

Run: `npm run lint`
Expected: no *new* eslint errors beyond the pre-existing baseline.

---

## Task 9: Secrets runbook & deploy checklist

**Files:**
- Create: `docs/guides/security-secrets-runbook.md`

- [ ] **Step 1: Write the runbook**

Create `docs/guides/security-secrets-runbook.md`:

```markdown
# Security secrets & deploy runbook

Все секреты живут в **Supabase Function secrets** (не Vercel env, не SQL, не git).

## Required secrets

| Secret | Используется | Заголовок |
|---|---|---|
| `TELEGRAM_WEBHOOK_SECRET` | telegram-bot, register-webhook | `X-Telegram-Bot-Api-Secret-Token` |
| `TONUS_CRON_SECRET` | send-reminders, coach-weekly, sync-cal, football fns | `x-cron-secret` |
| `TONUS_ADMIN_SECRET` | register-webhook | `x-admin-secret` |

Временные алиасы при переходе (можно удалить после того, как все cron job'ы
переведены на `TONUS_CRON_SECRET`): `CRON_SECRET` (sync-cal),
`FOOTBALL_INTERNAL_SECRET` (football fns).

## Set secrets

    npx supabase secrets set TONUS_CRON_SECRET=<random> TONUS_ADMIN_SECRET=<random> --project-ref <ref>
    # TELEGRAM_WEBHOOK_SECRET уже задан; проверь, что не пустой.

## Deploy order

1. Задать секреты (выше).
2. Задеплоить функции:

       npx supabase functions deploy telegram-bot send-reminders coach-weekly sync-cal send-football-reminders sync-football-fixtures register-webhook --no-verify-jwt --project-ref <ref>

   (`--no-verify-jwt` — как и раньше; эти функции сами проверяют секреты.)
3. **Заново зарегистрировать webhook** (иначе Telegram шлёт без нового header):

       curl -X POST https://<ref>.supabase.co/functions/v1/register-webhook \
         -H 'x-admin-secret: <TONUS_ADMIN_SECRET>' -H 'content-type: application/json' -d '{}'

4. Обновить `x-cron-secret` в pg_cron / планировщике на значение `TONUS_CRON_SECRET`.

## Manual verification (spec §6 «перед релизом»)

- Настоящий Telegram update проходит (напиши боту).
- `curl` в telegram-bot без header → 401.
- `curl` в send-reminders без `x-cron-secret` → 401.
- `curl` в coach-weekly без Authorization и без cron secret → 401.
- cron с правильным `x-cron-secret` отрабатывает.
- Логи функций не печатают значения токенов/заголовков.

## Session rotation (после удаления browser-profile из git)

Профиль `claude-monitor/browser-profile/` лежал в git. Ротировать всё, что там
могло быть: залогиненные сессии в Chromium (Telegram web, Google/Supabase),
cookies. History rewrite отложен (репо приватное) — при первом расширении
доступа к репозиторию выполнить очистку истории и force-push.
```

- [ ] **Step 2: Commit**

```bash
git add docs/guides/security-secrets-runbook.md
git commit -m "docs(security): secrets & deploy runbook"
```

---

## Deployment (manual, after all tasks — not a code step)

Frontend has no user-facing change, so no Vercel deploy is needed. Edge functions
and secrets are deployed manually per `docs/guides/security-secrets-runbook.md`.
This is a side-effecting, outward-facing operation — confirm with the user before
running secret-set / deploy / webhook re-registration.

---

## Self-Review (done while writing)

- **Spec coverage:** §3.1 telegram secret → Task 3; §3.2 cron secret + coach-weekly split → Tasks 4, 5, 6; §3.3 register-webhook admin secret + trimmed info → Task 7; §4.1 gitignore + rm --cached + repo test → Task 1; §4.2 session rotation flagged, history rewrite deferred → Task 1 note + Task 9; §6 automatic tests → Tasks 1, 2 + manual checklist in Task 9. §3.4 (token-in-URL) is contract-only/out of this release per spec — no task, intentionally.
- **Fail-closed everywhere:** helper denies on empty `expected`; every endpoint returns 503 (no secret configured) or 401 (mismatch) before side effects.
- **Handler-level unit tests** (spec §6 "не вызывает createClient") are not runnable in vitest because handlers import Deno-URL modules; coverage is provided by the pure helper tests plus the manual curl checklist. This is an accepted, documented tradeoff.
- **Type consistency:** helper exports `secretMatches`, `isValidCronSecret`, `isValidTelegramSecret`, `isValidAdminSecret` — names used identically in Tasks 3–7.
```
