---
name: debugging-prod-data
description: Use when inspecting production database data, edge function logs, or debugging live Tonus issues (missing metrics, sync failures, bot errors)
---

# Отладка прода Tonus (БД и логи)

**По умолчанию — только чтение.** Мутации в проде (UPDATE/DELETE/apply_migration)
— только по явной просьбе пользователя.

## Путь 1: Supabase MCP (если подключён)

- `execute_sql` — запросы к прод-БД (SELECT).
- `get_logs` — логи edge-функций по имени (ingest-health, telegram-bot…).
- `get_advisors` — проверки безопасности/производительности.
- `list_tables` — схема перед запросом.

## Путь 2: PostgREST + service key (fallback без MCP-токена)

Ключи лежат в `claude-monitor/.env` (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`):

```bash
source claude-monitor/.env
curl -s "$SUPABASE_URL/rest/v1/<table>?select=*&limit=10" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY"
```

PostgREST-фильтры: `?date=gte.2026-06-01&order=date.desc&limit=30`.
Service key обходит RLS — не выводи чужие данные и сам ключ в ответы.

## Что где лежит

| Что | Где |
|---|---|
| Сырые дневные метрики | `metrics_daily` (вьюхи: `daily_metrics`, `daily_summary`; DDL вьюх частично не в репо — создавались в dashboard) |
| Скоры (readiness и др.) | `daily_scores` |
| Свежесть автосинка | `ingest_tokens.last_ingest_at` |
| Логи функций без MCP | Supabase dashboard → Edge Functions → Logs |

## Типовые проверки

- «Данные не обновляются» → `ingest_tokens.last_ingest_at`; если давно —
  inspect `ingest-health` logs and compare its live JWT mode with
  `supabase/config.toml` and the deployment receipt (see `deploying-tonus`).
- «Скоры не совпадают с приложением» → сравни `daily_scores` с расчётом клиента,
  см. скилл `updating-score-formulas` (две копии формул).
- Ошибки бота → логи `telegram-bot`.
