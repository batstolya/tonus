# Reminders: операционный runbook

Модель доставки medication reminders (миграция `20260710150000_reminder_delivery_state.sql`):

```
pending / snoozed → processing → sent | taken | skipped | missed | failed | delivery_unknown
```

Lease 10 мин, max 3 попытки. Ручной SQL, меняющий status, выполняется только по этому runbook.

## Посмотреть состояние очереди

```sql
select status, count(*), min(due_at) as oldest
from reminder_events
where status in ('pending','processing','failed','delivery_unknown')
group by status;
```

Последний результат job — в логах `send-reminders` (Dashboard → Edge Functions →
Logs): JSON с `runId, claimed, sent, skipped, retried, failed, deliveryUnknown,
remaining, durationMs`. Ненулевой `remaining` несколько тиков подряд = отставание.

## delivery_unknown — расследование (НЕ авторетраить)

Статус означает: network-обрыв после отправки запроса; Telegram **мог доставить**
сообщение (у sendMessage нет idempotency key). Перед любым повтором:

1. `select id, due_at, last_error, attempt_count from reminder_events where status='delivery_unknown';`
2. Проверь в Telegram-чате, пришло ли сообщение о той дозе.
3. Пришло → закрой вручную: `update reminder_events set status='sent' where id='…';`
4. Не пришло → верни в очередь: `update reminder_events set status='pending', claim_token=null, attempt_count=0 where id='…';`

## Повторить failed доставку

`failed` = 3 подтверждённых отказа Telegram (см. `last_error`). Устрани причину
(например, бот заблокирован в чате), затем:

```sql
update reminder_events set status='pending', claim_token=null, attempt_count=0, last_error=null
where id='…' and status='failed';
```

## Снять stuck lease

Обычно не нужно: claim RPC сам подбирает processing с истёкшим lease. Если
строка зависла в processing дольше часа при работающем cron:

```sql
update reminder_events set status='pending', claim_token=null
where status='processing' and claimed_at < now() - interval '1 hour';
```

## Проверить cron

- Секрет: заголовок `x-cron-secret` = `TONUS_CRON_SECRET` (см.
  `docs/guides/security-secrets-runbook.md`). Без него функция отвечает 401 и
  не читает БД.
- «Telegram принял, но запись не обновилась» выглядит как: сообщение в чате
  есть, а event в `processing`/`delivery_unknown` — это и есть сценарий
  delivery_unknown выше, действуй по нему.
