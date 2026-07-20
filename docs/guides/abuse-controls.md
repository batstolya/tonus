# Abuse controls: internal auth, CORS allowlist, rate limits

Beta-safety PR 3 (spec: `docs/superpowers/specs/2026-07-14-beta-safety-minimum-design.md` §4).
Companion secrets: `docs/guides/security-secrets-runbook.md`.

## Internal service-to-service authentication

Trusted internal calls (`telegram-bot` and `send-reminders` calling
`coach-profile`, `biweekly-report`, `suggest-experiments`) authenticate with a
dedicated secret instead of the Supabase service-role key:

- **Headers:** `x-internal-secret: <TONUS_INTERNAL_SECRET>` plus
  `x-user-id: <target user>`. The `Authorization: Bearer <anon key>` header is
  sent only so the Supabase gateway (`verify_jwt = true`) admits the request;
  the anon key is public and carries no authority in the handler.
- **Callee check:** `isValidInternalSecret()` in
  `supabase/functions/_shared/auth.ts` — full-value, constant-time,
  fail-closed (`TONUS_INTERNAL_SECRET` unset → every internal call is denied).
- **Transition state:** during the PR 3 rollout callees also accept the exact
  PR 0 service-role comparison (dual-accept). PR 3b removes that path; after
  it no internal HTTP caller may present the service-role key as a credential.

**Rotation:** generate a new value (`openssl rand -hex 32`), set it via
`npx supabase secrets set TONUS_INTERNAL_SECRET=<value> --project-ref <ref>`,
then redeploy nothing — functions read the secret at invocation. Rotation
causes at most a brief window of denied internal calls, which fail closed.

## Browser CORS allowlist

UI-facing functions compute CORS per request via `corsHeadersFor()`
(`supabase/functions/_shared/cors.ts`) against `TONUS_ALLOWED_ORIGINS`
(comma-separated origins). An origin not on the list — or an unset variable —
receives no `Access-Control-Allow-Origin` header (fail closed for browsers).

Production value: `https://tonus-nu.vercel.app`. Add new origins (e.g. a
custom domain) to the secret; no redeploy required.

Note: `https://tonus-anatolii-s-projects6.vercel.app` was the value
originally documented here, but it does not match the actual Vercel
production alias — this mismatch left `TONUS_ALLOWED_ORIGINS` pointed at the
wrong origin from the PR 3 rollout (2026-07-16) until fixed on 2026-07-20,
silently breaking browser calls to every UI-facing function (chat, AI
analysis, etc.) while curl-based smoke tests — which send no `Origin` header
— stayed green.

Documented exceptions (see `security/inventory.generated.json` for the derived
`cors` classification of every function):

| Function | CORS | Why |
|---|---|---|
| `ingest-health` | `wildcard` | Health Auto Export native app; no browser Origin |
| `widget-data` | `wildcard` | Scriptable iPhone widget; no browser Origin |
| `telegram-bot`, `send-reminders`, `register-webhook` | `none` | webhook/cron/admin only |
| `send-football-reminders`, `sync-football-fixtures` | `none` | cron only |

## Durable rate limits

Requests consume counters in `public.rate_limit_counters` through the
service-role-only RPC `consume_rate_limit(bucket, limit, window_seconds)`
(atomic upsert per fixed window; expired windows for the bucket are purged on
touch). Helper: `supabase/functions/_shared/rateLimit.ts` — any RPC error
denies the request (fail closed). Exceeded limits return
`429 { "error": "rate_limited" }`.

| Endpoint | Bucket key | Limit | Window |
|---|---|---|---|
| `ingest-health` | `ingest:<sha256(token)>` | 120 | 1 h |
| `widget-data` | `widget:<sha256(token)>` | 120 | 1 h |
| `chat-health` | `chat:<user id>` | 40 | 1 h |
| `report-client-error` | `client-error:<user id>` | 120 | 1 h |

Long-lived tokens are keyed by SHA-256 hash — raw tokens never reach the
rate-limit store or logs. The monthly AI cost budget (`_shared/costGuard.ts`)
remains defense-in-depth on AI endpoints and is not a request rate limit.

Other AI endpoints (`analyze-health`, `biweekly-report`, `classify-meal`,
`coach-profile`, `coach-weekly`, `deep-research`, `extract-lab`,
`generate-recommendations`, `suggest-experiments`, `supplement-schedule`) are
once-per-action user flows behind JWT auth plus the AI budget; add durable
limits there when usage evidence shows abuse pressure.
