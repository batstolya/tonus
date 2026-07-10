# Tonus — дизайн: надёжные фоновые автоматизации

## Решение по scope (review 2026-07-10)

Статус: **делаем только первый релиз, второй — пропускаем до появления
реальных пользователей.**

- **Первый релиз (§2.2–2.3, state machine + атомарный claim через RPC):
  делаем.** Гонка двух overlapping cron-запусков реальна, объём изменений
  небольшой, и это единственная часть спеки, закрывающая фактический дефект.
- **Timezone-фиксы (§2.4): делаем вместе с первым релизом.** Это баги
  корректности (UTC date вместо локальной), а не масштабирование.
- **Второй релиз (§3, разбивка на 6 отдельных jobs): пропускаем.** При одном
  активном пользователе последовательный координатор не является узким местом,
  а 6 функций = 6 деплоев, 6 cron-конфигураций и 6 точек отказа. Ответ на
  вопрос №5 из §8: все responsibilities остаются в одном координаторе.
- **§4.1 structured result: делаем** — дёшево и сразу полезно для дебага.
  **§4.3 полный runbook: сокращаем** до короткой секции в docs/guides о том,
  как посмотреть failed/`delivery_unknown` события и снять stuck lease.
- Вопрос №1 из §8 (idempotency у Telegram send API) обязан быть проверен
  до реализации claim/complete-границы — это условие из §2.3, оно остаётся.

Пререквизит без изменений: сначала security spec (cron secret), §6 п.1.

## 0. Цель

Сделать автоматические Telegram-действия идемпотентными, наблюдаемыми и
устойчивыми к параллельным запускам. В первую очередь это касается medication
reminders; затем — ежедневных заметок, сводок и coach nudges.

Результат: в нормальном steady-state одно business event отправляется
пользователю не более одного раза, явный сбой Telegram можно безопасно
повторить, а медленная задача одного пользователя не ломает выполнение остальных.
Неопределённая доставка не ретраится молча и остаётся видимой оператору.

## 1. Контекст

`send-reminders` сейчас одновременно:

- создаёт reminder events;
- отправляет лекарства и snooze;
- помечает missed события;
- отправляет вечерние вопросы;
- запускает двухнедельные отчёты и утренние сводки;
- генерирует health alerts, coach nudges, follow-ups и maintenance reminders.

Он последовательно перебирает пользователей и события. Pending reminder
сначала читается, затем Telegram получает сообщение, и только после этого строка
меняет status на `sent`. Два overlapping запуска могут взять одну строку и
отправить две копии. Дополнительно часть daily-логики использует UTC date или
жёсткую `Europe/Kyiv`, хотя настройки пользователя уже содержат timezone.

## 2. Архитектурное решение

### 2.1 Два уровня, не один большой rewrite

**Первый релиз обязателен:** атомарный claim только для medication reminders.
Он закрывает реальный риск дублей с небольшой областью изменений.

**Второй релиз:** разбивает `send-reminders` на независимые jobs по domain и
cadence. Он не переписывает Telegram bot и не вводит универсальную очередь для
всех событий заранее.

Полный generic outbox — разумная будущая опция, но не первый шаг: для текущего
размера продукта он добавит больше миграционного риска, чем даст пользы.

### 2.2 Состояния medication reminder

`reminder_events` получает явную модель доставки:

```text
pending / snoozed
  -> processing
  -> sent | taken | skipped | missed | failed | delivery_unknown
```

Добавляются поля:

- `claimed_at timestamptz`;
- `claim_token uuid`;
- `attempt_count integer not null default 0`;
- `last_error text`;
- `sent_at timestamptz`.

`processing` — не финальное состояние. Если worker умер после claim, событие
можно вернуть в pending по истёкшему lease (например, 10 минут) и повторить.
Retry ограничен: после трёх подтверждённых неуспешных доставок status становится
`failed`, а ошибка остаётся доступной для наблюдения. Если результат Telegram
неизвестен (network timeout после возможного принятия запроса), status становится
`delivery_unknown`; его нельзя ретраить автоматически.

### 2.3 Atomically claim через RPC

В Postgres создаётся `claim_due_reminder_events(p_limit integer)`:

1. выбирает только due `pending` и наступившие `snoozed` rows;
2. добавляет просроченные `processing` с истёкшим lease;
3. блокирует кандидаты `FOR UPDATE SKIP LOCKED`;
4. обновляет их одним statement в `processing`, ставит `claimed_at`,
   `claim_token`, увеличивает `attempt_count`;
5. возвращает только claimed rows с Telegram chat и данными препарата.

Worker не делает отдельный select pending rows. После Telegram API он вызывает
`complete_reminder_delivery(event_id, claim_token, telegram_message_id)` или
`fail_reminder_delivery(event_id, claim_token, error)`. RPC отвергает результат
с неактуальным claim token, поэтому старый worker не может испортить повторно
claimed event.

Это даёт exactly-once **state transition** и at-most-once попытку на lease.
Telegram API не поддерживает транзакцию с Postgres, поэтому абсолютный
exactly-once delivery невозможен: обрыв после успешного Telegram send, но до
`complete` может привести к повторной попытке. Для этой границы добавляется
детерминированный client request id/idempotency key, если Telegram API его
поддерживает; иначе event остаётся маркированным как `delivery_unknown` и не
повторяется автоматически без явной policy. Этот выбор обязан быть проверен с
реальным Telegram API до реализации.

### 2.4 Временные зоны

Для каждого event используется timezone reminder setting:

- local date для проверки `supplement_logs` вычисляется из `due_at` в timezone
  события, а не через `new Date().toISOString().slice(0, 10)`;
- quiet hours и schedule используют один shared time helper;
- ежедневные notice/summary/nudge выполняются относительно timezone конкретного
  пользователя, а не глобальной `Europe/Kyiv`;
- DST-переходы документируются: локальное несуществующее время сдвигается к
  ближайшему валидному моменту, повторяющееся время создаёт один event по
  уникальному `user_id, supplement_id, due_at`.

## 3. Разделение фоновых jobs во втором релизе

Каждый job имеет собственные: trigger, owner, batch limit, idempotency key,
timeout budget и метрики. Общие Telegram и auth helpers живут в `_shared/`.

| Job | Cadence | Ответственность |
|---|---|---|
| `send-supplement-reminders` | 5 минут | claim и доставка reminder events |
| `send-daily-notes` | 5-10 минут | вечерний вопрос, один раз в local date |
| `send-morning-summaries` | 5-10 минут | утренняя сводка per user timezone |
| `send-coach-nudges` | 15 минут | один актуальный nudge с dedup |
| `resolve-coach-followups` | 15 минут | итоги уже принятых советов |
| `send-health-maintenance` | daily | hair/lab maintenance reminders |

`coach-weekly` остаётся самостоятельной weekly job. Генерация health anomaly
остаётся рядом с `ingest-health`, потому что источник события — новый health
ingest, а не таймер.

Во всех jobs cron authorisation берётся из security spec. Cron больше не
является эквивалентом «HTTP без Authorization».

## 4. Наблюдаемость и эксплуатация

### 4.1 Structured execution result

Каждый job возвращает JSON с:

```ts
{
  runId: string,
  claimed: number,
  sent: number,
  skipped: number,
  retried: number,
  failed: number,
  durationMs: number,
}
```

Ошибки одной строки не прерывают batch: они записываются в соответствующий
event/delivery record, а обработка следующих пользователей продолжается.
Ошибка конфигурации (отсутствующий secret, неверный schema contract) должна
завершить job неуспешно и быть видна в logs.

### 4.2 Batch и backpressure

Каждый запуск имеет фиксированный лимит. Следующий cron tick берёт следующую
порцию; worker не пытается обработать весь backlog в одном request. Сортировка
claimed events стабильна: сначала самый ранний `due_at`, затем `id`.

Если backlog старше заданного SLO, job возвращает отдельный `remaining` count.
Это позволяет заметить отставание, не маскируя его успешным HTTP 200.

### 4.3 Операционный runbook

Добавляется документ:

- как посмотреть pending/processing/failed события;
- как расследовать `delivery_unknown` без автоматической повторной отправки;
- как безопасно повторить failed доставку;
- как снять stuck lease;
- как проверить cron secret и последние job results;
- как отличить «Telegram принял сообщение» от «запись в БД не обновилась».

Ручной SQL, который меняет status, не выполняется без `claim_token`/runbook.

## 5. Тестирование

### Чистая логика

- timezone/local-date: Berlin, Kyiv, UTC и граница полуночи;
- DST: отсутствующее и повторяющееся local time;
- retry policy: pending -> processing -> failed после max attempts и отдельный
  terminal state `delivery_unknown` для неясного результата send;
- выбор batch: stable order и фильтрация snooze/lease expiry.

### Database integration

На локальном Supabase/Postgres тестируются:

- два параллельных `claim_due_reminder_events` не возвращают одну строку;
- stale processing row корректно claimится новым worker;
- чужой/старый `claim_token` не может подтвердить или сломать доставку;
- user RLS не может читать чужие reminder events;
- unique key не создаёт второй schedule event на тот же due_at.

### Worker contract

Telegram client подменяется mock transport. Тесты доказывают:

- без cron secret работа не начинает запросов к БД;
- Telegram success вызывает один complete RPC;
- Telegram error увеличивает attempts и сохраняет sanitised error;
- ошибка одного event не останавливает второй;
- UTC/local date не помечает принятую вчера поздно вечером дозу неверно.

## 6. Rollout

1. Сначала применяется security spec: новый cron secret и защищённый endpoint.
2. Добавляется миграция state machine + RPC, без переключения worker.
3. На staging/локальной БД проверяется параллельный claim.
4. Новый sender разворачивается без включения нового cron trigger и проходит
   smoke-проверку на тестовых/no-due данных.
5. Во время cutover старый cron отключается, ожидается один максимальный window
   его выполнения, затем включается cron нового sender. Два sender'а не имеют
   права одновременно читать `pending` events.
6. Остальные responsibilities выделяются по одной job за PR; каждый PR имеет
   свой cron rollout и rollback switch.

Rollback не откатывает schema migration. До первого production claim он может
отключить новый cron и вернуть прежний sender. После начала использования
`processing` или `delivery_unknown` старый worker не должен читать эти rows:
нужен только roll-forward через новый worker или операционный runbook.

## 7. Вне scope

- полный generic outbox для всех доменных событий;
- rewrite `telegram-bot` на множество функций;
- push/email delivery channels;
- изменение текстов, частоты и product policy напоминаний;
- перенос всех исторических Telegram сообщений в новую модель.

## 8. Вопросы для review с Claude

1. Какую гарантию фактически даёт Telegram send API при повторе того же
   business event: есть ли применимый idempotency key, или нужна `delivery_unknown` policy?
2. Нужна ли отдельная таблица delivery attempts уже в первом релизе, или
   достаточно полей на `reminder_events` до появления второго канала доставки?
3. Какой lease и max retry оптимальны для текущего 5-minute cron и Telegram
   rate limits?
4. Каким способом в production безопасно наблюдать backlog и failed events?
5. Какие из выделенных jobs оправданы сразу, а какие разумно оставить внутри
   одного coordinator до появления нескольких активных пользователей?
