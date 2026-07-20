# Security secrets & deploy runbook

Все секреты живут в **Supabase Function secrets** (не Vercel env, не SQL, не git).

## Required secrets

| Secret | Используется | Заголовок |
|---|---|---|
| `TELEGRAM_WEBHOOK_SECRET` | telegram-bot, register-webhook | `X-Telegram-Bot-Api-Secret-Token` |
| `TONUS_CRON_SECRET` | send-reminders, coach-weekly, sync-cal, football fns | `x-cron-secret` |
| `TONUS_ADMIN_SECRET` | register-webhook | `x-admin-secret` |
| `TONUS_RELEASE_SHA` | privacy-safe observability | server-side release metadata |
| `TONUS_ENVIRONMENT` | privacy-safe observability | `production` enables private alerts |
| `TONUS_ALERT_CHAT_ID` | privacy-safe observability | private owner Telegram alert target |
| `TONUS_INTERNAL_SECRET` | telegram-bot, send-reminders → coach-profile, biweekly-report, suggest-experiments | `x-internal-secret` |
| `TONUS_ALLOWED_ORIGINS` | all UI-facing functions (CORS allowlist) | comma-separated browser origins |

Временные алиасы при переходе (можно удалить после того, как все cron job'ы
переведены на `TONUS_CRON_SECRET`): `CRON_SECRET` (sync-cal),
`FOOTBALL_INTERNAL_SECRET` (football fns).

## Set secrets

    npx supabase secrets set TONUS_CRON_SECRET=<random> TONUS_ADMIN_SECRET=<random> --project-ref <ref>
    # TELEGRAM_WEBHOOK_SECRET уже задан; проверь, что не пустой.

Observability secrets must be set only after its PR is merged. Use the exact
clean `main` SHA and keep the private alert chat ID out of deployment receipts:

    npx supabase secrets set TONUS_RELEASE_SHA="$(git rev-parse HEAD)" TONUS_ENVIRONMENT=production TONUS_ALERT_CHAT_ID=<private-chat-id> --project-ref <ref>

See `docs/guides/observability.md` for the migration, grouped function deploy,
safe synthetic event, and rollback procedure.

Abuse-control secrets (beta-safety PR 3; see `docs/guides/abuse-controls.md`):

    npx supabase secrets set TONUS_INTERNAL_SECRET="$(openssl rand -hex 32)" \
      TONUS_ALLOWED_ORIGINS="https://tonus-nu.vercel.app" --project-ref <ref>

`TONUS_INTERNAL_SECRET` unset → internal calls fail closed (401).
`TONUS_ALLOWED_ORIGINS` unset → browsers get no CORS grant, so the UI breaks
until the production origin is listed; non-browser clients are unaffected.

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
