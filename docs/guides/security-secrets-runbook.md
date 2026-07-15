# Security secrets and deploy runbook

Application secrets belong in Supabase Function secrets. Do not store them in
Vercel environment variables, SQL, repository files, receipts, issues, pull
requests, or terminal transcripts.

## Authentication-boundary secrets covered here

This table is intentionally limited to credentials that authenticate inbound
webhook, cron, and administrator requests. It is not a complete runtime-secret
inventory. Provider, bot, encryption, and platform credentials such as
`GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `API_FOOTBALL_KEY`, `CAL_ENC_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` remain part of the private credential inventory and
rotation work; never infer their presence or status from this table.

| Secret | Used by | Request boundary |
|---|---|---|
| `TELEGRAM_WEBHOOK_SECRET` | `telegram-bot`, `register-webhook` | `X-Telegram-Bot-Api-Secret-Token` |
| `TONUS_CRON_SECRET` | reminder, coaching, calendar, environment and football workers | `x-cron-secret` |
| `TONUS_ADMIN_SECRET` | `register-webhook` | `x-admin-secret` |

Temporary migration aliases may still exist: `CRON_SECRET` for calendar sync
and `FOOTBALL_INTERNAL_SECRET` for football workers. Remove them only after
every live caller has moved to `TONUS_CRON_SECRET` and its smoke check passes.

## Setting or rotating secrets

Use the Supabase dashboard or an authenticated local CLI session. Never put the
value on a command line that will be retained in a public transcript. Record
only the secret name, owner, rotation time, affected callers, and sanitized
verification result.

Rotate callers and callees in a reviewed order that keeps at least one valid
credential boundary throughout the transition. A missing runtime secret must
fail closed before any side effect.

## Deploying affected functions

Use only the explicit wrapper, smoke, and receipt workflow in
[Edge Function Deployment Guide](edge-function-deployments.md). Do not copy old
multi-function commands or add `--no-verify-jwt` manually. JWT modes come from
the complete `supabase/config.toml` manifest and must match live metadata after
each named deployment.

After changing a shared secret contract, list every caller and callee in the
review and deployment record. Deploy one function at a time and stop on the
first failure.

## Telegram webhook rotation

After `TELEGRAM_WEBHOOK_SECRET` changes, register the webhook again through the
reviewed `register-webhook` boundary. Do not put the admin secret or webhook
secret in a public command, log, screenshot, receipt, or PR. Verify with a
sanitized real-bot action only when that action cannot expose user data.

## Required post-change checks

- `telegram-bot` rejects a request without the webhook secret.
- `send-reminders` rejects a request without the cron secret.
- `coach-weekly` rejects a request without its documented user or cron
  credential.
- a trusted scheduled call with the rotated secret still succeeds exactly
  once;
- the Telegram webhook accepts one expected update;
- logs and receipts contain no secret value, header, payload, response body,
  user identifier, or health data;
- all synthetic fixtures and temporary credentials are removed.

Attach only the sanitized smoke result to the change record.

## Historical browser-session rotation

The removed `claude-monitor/browser-profile/` directory once contained browser
session material. Treat any session or credential that could have existed
there as exposed until its revocation or rotation is privately verified.
Record credential family, status, date, and owner, never the value. Repository
history cleanup does not replace session revocation.
