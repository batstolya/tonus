# Tonus — дизайн: контракт данных и воспроизводимые миграции

## Решение по scope (review 2026-07-10)

Статус: **делаем поэтапно, второй по приоритету.** Проблема подтверждена:
в `supabase/` лежат 33 root SQL-файла против 4 миграций — чистое окружение
из репозитория не поднимается, `daily_metrics` — скрытое состояние прода.

- **Фаза A (инвентаризация) + Фаза B (baseline): делаем сейчас.** Это и есть
  цель спеки — воспроизводимая схема. Фаза A остаётся обязательным gate перед
  любым `create or replace view`.
- **Фаза C (перевод читателей на versioned view): делаем по мере касания.**
  Не отдельным большим PR: каждая функция переводится, когда её трогаем по
  другой причине. Новый код сразу пишется против `daily_metrics` view.
- **Фаза D (CI schema job + генерация типов): отложена.** Для solo-проекта
  CI-джоб со schema reset и type diff — «на вырост». Возвращаемся к ней,
  когда появится второй разработчик или регулярные schema-изменения.
  Разово сгенерировать `database.types.ts` после baseline — стоит.
- `daily_summary` удаляем только после фактического перевода
  `biweekly-report`, как и написано в §2.2 — не форсируем.

## 0. Цель

Сделать схему Supabase воспроизводимой из репозитория и зафиксировать один
канонический контракт для дневных health-метрик. Чистое окружение должно
создаваться миграциями без ручного запуска десятков SQL-файлов, а функции и UI
должны читать одинаковое представление данных.

Результат: `supabase db reset` на пустой БД создаёт все нужные таблицы, views,
RLS, функции и индексы; новый разработчик и CI получают ту же схему, что прод.

## 1. Проблема сейчас

- В `supabase/migrations/` лежит лишь небольшая часть DDL. Большинство схемы
  хранится в 33 root SQL-файлах, которые запускаются вручную в SQL Editor.
- `metrics_daily` является реальным EAV-хранилищем, куда пишут импорт и HAE.
  Но многие Edge Functions читают `daily_metrics`, а отчёт читает
  `daily_summary` поверх `daily_metrics`.
- В репозитории нет полного определения `daily_metrics`. Его тип, колонки и
  актуальность являются скрытым состоянием существующего production database.
- Одноразовые repair-скрипты, DDL, cron-конфигурация и исторические заметки
  перемешаны. Их нельзя без разбора применить к новой базе.

## 2. Зафиксированные решения

### 2.1 Канонические write-модели

Источником истины остаются:

- `metrics_daily`: один пользователь, дата и metric key; значения хранятся в
  `avg_val`, `min_val`, `max_val`, `sum_val`;
- `sleep_sessions`: один основной сон пользователя за дату;
- `heart_rate_samples`: ограниченные по retention сырые измерения;
- остальные feature-таблицы — supplements, intake, goals, alerts и так далее.

Клиентский импорт и `ingest-health` пишут только эти модели. Новая таблица с
широкими дублирующими колонками не создаётся.

### 2.2 Каноническая read-модель дневных показателей

`daily_metrics` становится явным versioned SQL **view** над каноническими
write-моделями. Это совместимый read contract для server-side аналитики,
отчётов и AI tools.

View формируется по объединению дат из `metrics_daily` и `sleep_sessions`, а
не через inner join, чтобы день со сном, но без HRV, не пропадал. Он даёт
snake_case колонки, которыми уже пользуются функции:

| Колонка view | Источник |
|---|---|
| `resting_heart_rate` | `metrics_daily.metric = 'restingHeartRate'`, `avg_val` |
| `hrv` | `metric = 'hrv'`, `avg_val` |
| `sleep_hours` | `sleep_sessions.duration_hours` |
| `steps` | `metric = 'steps'`, `sum_val` |
| `active_energy` | `metric = 'activeEnergy'`, `sum_val` |
| `oxygen_saturation` | `metric = 'oxygenSaturation'`, `avg_val` |
| `wrist_temperature` | `metric = 'wristTemperature'`, `avg_val` |
| `respiratory_rate` | `metric = 'respiratoryRate'`, `avg_val` |

Одна уникальная строка EAV на ключ уже обеспечивается `(user_id, date, metric)`;
в pivot допускается `max(...) filter (...)` как технический способ превратить
одну строку в колонку. View использует `security_invoker`, чтобы обычный JWT
сохранял RLS исходных таблиц.

`daily_summary` остаётся только как временный compatibility alias для отчёта.
После перевода `biweekly-report` на `daily_metrics` он удаляется отдельной
миграцией. Новые функции не должны использовать `daily_summary`.

### 2.3 Единственный источник DDL

Все постоянные DB-изменения живут только в `supabase/migrations/`:

- таблицы, columns, views, functions, RLS policies, grants, indexes;
- безопасные изменения существующей production-схемы;
- versioned definition `daily_metrics`.

Root SQL-файлы получают одну из трёх судьб:

1. **Текущее желаемое состояние** переносится в baseline/cutover migration.
2. **Одноразовый ремонт данных** (например, destructive dedup) остаётся
   операционным скриптом в `scripts/` или `docs/runbooks/`, но не применяется
   при reset.
3. **Историческая заметка/устаревшая инструкция** переносится в archive или
   заменяется ссылкой на миграцию.

Cron definition не хранит настоящий secret в миграции. Миграция может создать
схему очереди и RPC, но operational scheduling выполняется защищённым runbook
или deployment script из security spec.

## 3. Стратегия перехода

### Фаза A: инвентаризация production, без изменения данных

Перед написанием baseline снять фактическую схему и сравнить с репозиторием:

- существует ли `daily_metrics`, и это table или view;
- полный SQL definition `daily_metrics` и `daily_summary`;
- какие policies, triggers, extensions, cron jobs и RPC уже применены;
- какие root SQL-файлы реально были выполнены;
- есть ли расхождения с `src/lib/database.types.ts`.

Это обязательный gate: нельзя заменить `daily_metrics` view, пока неизвестно,
не содержит ли production legacy-колонки или данные, которых нет в EAV.

### Фаза B: идемпотентный baseline/cutover

Создаётся новая migration, которая на пустой БД строит полный актуальный
контракт, а на существующем production безопасно нормализует его:

- добавляет недостающие tables/columns/indexes;
- создаёт или заменяет compatibility views только после сверки данных;
- включает RLS и создаёт policy идемпотентно;
- не удаляет данные, таблицы или legacy view автоматически.

Baseline не включает `delete`, truncate, reimport или cron с literal secret.
Если инвентаризация обнаружит несовместимый legacy `daily_metrics` table,
cutover получает отдельную миграцию и миграционный план данных, а не скрытую
команду `create or replace view`.

### Фаза C: перевод читателей

Все перечисленные consumers переходят на versioned `daily_metrics` contract:

- `ingest-health`, `coach-weekly`, `send-reminders`, `coach-profile`;
- `biweekly-report`, `generate-recommendations`, `suggest-experiments`;
- `_shared/healthContext.ts`, `_shared/chatTools.ts`, `telegram-bot`.

Прямой запрос `metrics_daily` остаётся допустим только когда нужен EAV-key,
которого нет в wide read-model, например `exerciseMinutes`.

### Фаза D: типы и CI

`src/lib/database.types.ts` генерируется из схемы после миграций и перестаёт
быть вручную неполным snapshot. Frontend создаёт Supabase client с этим типом,
а не `createClient<any>`, чтобы ошибка названия таблицы/колонки ловилась до
production.

CI получает отдельный schema job: поднимает локальную Supabase БД, применяет
все migrations, выполняет smoke SQL и генерирует schema diff. CI падает, если
reset не проходит, view не компилируется или generated types отличаются от git.

## 4. Миграционный контракт

Каждая новая миграция обязана:

1. быть append-only и иметь UTC timestamp в имени;
2. работать с пустой БД и с последним production baseline;
3. не содержать реальных secrets или персональных данных;
4. сопровождаться проверкой RLS для normal user и service role;
5. обновлять generated DB types, если затронут публичный DB contract;
6. иметь roll-forward решение: новая миграция исправляет ошибку, а не edit
   применённого SQL-файла.

## 5. Проверка и acceptance criteria

### На чистом окружении

- `supabase db reset` завершается без ручных SQL действий;
- существуют `metrics_daily`, `sleep_sessions`, `daily_metrics` и все таблицы,
  которые используют frontend и deployed Edge Functions;
- insert пары EAV metrics + sleep даёт одну ожидаемую строку `daily_metrics`;
- день только со сном и день только с шагами оба присутствуют в view;
- JWT пользователя не может прочитать чужой ряд через исходные таблицы или view;
- service role может выполнить server-side report queries.

### На production before cutover

- row count и контрольные агрегаты legacy read-model совпадают с новым view для
  выбранных пользователей и последних 90 дней;
- отсутствуют missing columns у functions, перечисленных в фазе C;
- миграция не меняет число строк в source tables;
- `supabase db diff` после применения не показывает незафиксированный DDL.

### В CI

- schema reset и smoke SQL обязательны;
- type generation не даёт diff;
- текущие `npm test`, TypeScript и e2e остаются зелёными.

## 6. Вне scope

- перенос EAV `metrics_daily` в новую широкую физическую таблицу;
- TimescaleDB, партиционирование и новый retention policy;
- исправление качества historical Apple Health data;
- перенос production данных между Supabase-проектами.

## 7. Вопросы для review с Claude

1. Какой реальный type и SQL definition у production `daily_metrics`?
2. Какие columns из него используют функции, но отсутствуют в таблице выше?
3. Поддерживает ли текущая Supabase/Postgres конфигурация `security_invoker`
   для view, и какой fallback нужен при её отсутствии?
4. Нужна ли materialized view для будущих объёмов, или обычной view достаточно
   при текущем single-user/раннем multi-user объёме?
5. Как безопасно синхронизировать migration history production с новым
   baseline, не редактируя уже применённые migrations?
