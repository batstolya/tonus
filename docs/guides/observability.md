# Privacy-safe observability

Tonus records a deliberately small technical event when the authenticated web
app crashes or when a critical Edge Function returns 5xx/throws. Events are
stored in `observability_events`; production failures can also notify a private
Telegram alert chat.

## Event contract

The only transported fields are:

- timestamp, `preview`/`production`, and `web`/`edge`;
- an allowlisted operation and error code;
- a UUID request ID shared by browser and Edge Function;
- outcome, optional duration, and the exact 40-character Git release SHA.

The adapter has no fields for an exception message, stack, user ID, email,
Telegram ID, token, request body, health value, lab result, medication, chat
text, or AI prompt. Unknown input fields are discarded before transport. The
table has RLS enabled, grants no browser role, and is written only by the Edge
adapter with the service role.

Demo mode never invokes the reporter. An invalid/missing release SHA also
fails closed so an event cannot be attributed to the wrong release. The Edge
endpoint rejects client environment/release values that do not exactly match
its server-side configuration.

## Runtime configuration

Set these only as Supabase Function secrets:

| Secret | Purpose |
|---|---|
| `TONUS_RELEASE_SHA` | Exact reviewed `main` SHA currently deployed as the complete production release |
| `TONUS_ENVIRONMENT` | `production` for production; `preview` suppresses Telegram alerts |
| `TONUS_ALERT_CHAT_ID` | Private owner-operated Telegram chat that receives safe production alerts |
| `TELEGRAM_BOT_TOKEN` | Existing Tonus bot token used to deliver the alert |

The frontend release/environment are compiled from Vercel's
`VERCEL_GIT_COMMIT_SHA`/`VERCEL_ENV` (or GitHub's `GITHUB_SHA` on CI).

`TONUS_RELEASE_SHA` is a release marker for the whole production environment.
Set it only to the clean reviewed `main` SHA being deployed, and deploy every
changed component from that same checkout. Never change it for an unmerged
branch.

## Post-merge deployment

From a clean checkout of the reviewed `main` commit:

1. Apply `20260716020000_observability_events.sql` and confirm no other pending
   migration is applied accidentally.
2. Set `TONUS_RELEASE_SHA`, `TONUS_ENVIRONMENT=production`, and the private
   `TONUS_ALERT_CHAT_ID` without copying their values into a log or receipt.
3. Deploy `report-client-error`, `ingest-health`, `send-reminders`, and
   `telegram-bot` from that checkout, preserving their `config.toml` JWT modes.
4. Let the green `main` workflow deploy the matching frontend release.
5. Confirm migration parity and deployed function/source parity.

This PR intentionally contains no production receipt: repository policy
forbids deploying an unmerged branch.

## Safe synthetic verification

While authenticated in the production web app, dispatch a synthetic browser
error that contains no personal data. Verify that:

- `report-client-error` returns `202`;
- one `observability_events` row contains the exact release and request ID;
- no other columns or payload exist;
- the private Telegram alert arrives within 15 minutes;
- demo mode produces no row or alert.

Then exercise a controlled 5xx substitute in an isolated environment and prove
the browser request header, Edge response header, and stored event share the
same request ID. Do not deliberately break a production health import, cron, or
Telegram webhook to create evidence.

## Failure and rollback

Observability is best-effort: storage/notification failures never replace a
product response. The client reporter returns `503` when durable storage fails
and does not recursively report that failure.

Rollback by redeploying the previous reviewed frontend/functions from `main`.
Do not drop the append-only table during an incident; it contains only safe
technical metadata and an unused table does not affect product paths. If alerts
are noisy, set `TONUS_ENVIRONMENT=preview` temporarily while investigating,
then restore `production` and repeat the safe synthetic check.
