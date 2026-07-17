# Monthly backup-copy reminder — design

Date: 2026-07-17. Status: approved (owner: "пусть мне раз в месяц в бот приходит
напоминание сделать бекап и инструкция").

## Problem

Nightly encrypted backups are automated (launchd) and healthchecked, but the
offsite copy (archive → iCloud) is a manual monthly habit with no trigger. The
beta checklist lists it as a recommended practice; habits without reminders die.

## Decision

Smallest thing on existing rails:

- **New edge function `ops-reminder`** (verify_jwt=false in config.toml, gated
  by `x-cron-secret` — same pattern and env fallback as `fetch-environment`:
  `OPS_CRON_SECRET ?? TONUS_CRON_SECRET`). It sends one fixed Russian message
  (product content) with the copy instructions to `TONUS_ALERT_CHAT_ID` via
  `_shared/telegram.ts` and answers `{ ok: true }`.
- **Message lives in a pure module** `ops-reminder/message.ts` (vitest-tested:
  instructions mention the archive glob, iCloud, the encryption reassurance and
  the quarterly decrypt-check commands).
- **Schedule via pg_cron**, same helper pattern as `schedule_env_sync`:
  migration adds `public.schedule_backup_reminder(p_secret)` which
  (re)schedules job `ops-backup-reminder-monthly`, cron `0 8 1 * *`
  (1st of month, 08:00 UTC ≈ 09:00–10:00 Berlin), POSTing to the function with
  the secret header. Helper is `security definer`, execute granted to
  `service_role` only; called once after `db push` via PostgREST rpc.

No delivery-state machinery: a monthly nudge that could theoretically be lost
once does not justify claim/retry infrastructure (unlike user health reminders).

## Ops / deploy

1. `supabase db push` (migration).
2. `npx supabase secrets set OPS_CRON_SECRET=<random>` .
3. Deploy `ops-reminder`.
4. `select public.schedule_backup_reminder('<secret>')` via PostgREST rpc
   (service key).
5. Smoke: POST with wrong secret → 401; with right secret → message arrives in
   the owner's Telegram.
6. Security inventory regenerated (new surface) — CI drift guard enforces it.

## Out of scope

- Generalizing to more ops reminders (YAGNI — first second reminder pays for
  the generalization).
- Checking whether the copy actually happened (healthcheck could later verify
  an iCloud path mtime; separate idea).
