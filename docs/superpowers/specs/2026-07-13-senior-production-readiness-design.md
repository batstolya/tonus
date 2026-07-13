# Tonus Senior / Production Readiness — программа доведения

- **Дата:** 2026-07-13
- **Статус:** готово к декомпозиции на implementation plans
- **Владелец:** product engineering
- **Целевой релиз:** публичная beta

## 1. Зачем нужна эта программа

Tonus уже является функциональным full-stack продуктом: React SPA, Supabase
Postgres с RLS, более 20 Deno Edge Functions, Telegram-интеграция, импорт
health-данных, AI-сценарии, 446 unit/integration-тестов, Playwright smoke-тесты
и CI-controlled deployment.

Задача программы — не добавить архитектурной сложности ради сложности, а
сделать качество продукта доказуемым. После завершения программы инженер
должен уметь показать, что Tonus:

1. безопасно работает с чувствительными пользовательскими данными;
2. предсказуемо ведёт себя при частичных сбоях;
3. наблюдаем в production;
4. восстанавливается после ошибок и потери данных;
5. выпускается через воспроизводимый quality gate;
6. поддерживается без знания всех исторических деталей одним автором.

## 2. Определение «senior / production-ready» для Tonus

Проект считается готовым к публичной beta, когда выполнены все обязательные
критерии P0 и P1 из этой спеки. Senior-уровень оценивается не количеством
технологий, а наличием явных контрактов, измеримых гарантий и эксплуатационных
процедур.

### 2.1 Обязательные свойства

| Свойство | Доказательство |
|---|---|
| Безопасность | автоматические негативные RLS/auth-тесты и security checklist |
| Надёжность | идемпотентные операции, bounded retry и явные terminal states |
| Наблюдаемость | request ID, структурированные события, error tracking и алерты |
| Качество | typecheck, tests, build, e2e и lint ratchet блокируют merge |
| Приватность | экспорт, удаление, retention policy и AI consent описаны и проверены |
| Восстановление | проверенный backup/restore runbook с измеренным RTO/RPO |
| Поддерживаемость | архитектурные решения и operational ownership документированы |

### 2.2 Целевые показатели beta

- **Availability:** 99.5% для пользовательских read/write-сценариев за 30 дней.
- **Error-free sessions:** не менее 99% клиентских сессий без необработанной
  ошибки.
- **Critical API success rate:** не менее 99% для авторизованных запросов без
  учёта подтверждённых ошибок внешних провайдеров.
- **RPO:** не более 24 часов.
- **RTO:** не более 4 часов.
- **Detection time:** критичная production-ошибка обнаруживается не позднее
  15 минут после начала.
- **CI:** 100% обязательных проверок зелёные перед merge в `main`.

Показатели являются beta-SLO, а не обещанием медицинской доступности. Tonus не
является медицинским устройством и не должен позиционироваться как система для
экстренных решений.

## 3. Текущее состояние

### 3.1 Уже есть

- React 19 + TypeScript strict + Vite;
- Supabase Auth, Postgres, RLS и Deno Edge Functions;
- server-side AI credentials и общий `costGuard` для AI-функций;
- fail-closed helpers для cron, Telegram и admin secrets;
- baseline database migration и последующие timestamped migrations;
- unit/integration-тесты и Playwright smoke suite;
- CI с unit, build, e2e и lint ceiling;
- controlled Vercel deploy после зелёного CI;
- экспорт пользовательских данных;
- medical-advice disclaimers в интерфейсе и README;
- delivery-state модель для Telegram reminders.

### 3.2 Известные пробелы

- lint ceiling фиксирует 292 legacy-ошибки;
- клиент Supabase создаётся как `createClient<any>`;
- UI behavior почти не тестируется в jsdom;
- отсутствует единый production error-tracking и event schema;
- нет автоматизированной матрицы негативных RLS-тестов;
- нет полного user-facing удаления аккаунта и подтверждённой cascade semantics;
- retention сырого health payload не обеспечен проверяемой политикой;
- backup существует как возможность платформы/экспорт, но restore drill и RTO
  не доказаны;
- релиз не имеет формального go/no-go checklist и rollback verification;
- operational ownership распределён по нескольким документам без единого
  индекса.

## 4. Границы программы

### Входит

- качество и типизация существующего кода;
- security validation существующей архитектуры;
- observability клиента и Edge Functions;
- надёжность синхронизаций, webhook, cron и AI-вызовов;
- lifecycle чувствительных данных;
- backup, restore, release и incident runbooks;
- критические пользовательские сценарии публичной beta.

### Не входит

- отдельный Node.js backend без доказанной необходимости;
- микросервисы, Kubernetes, event bus или собственный auth server;
- сертификация медицинского устройства;
- новая продуктовая функциональность, не нужная для beta readiness;
- достижение 100% test coverage;
- переписывание React/Supabase стека.

## 5. Архитектурные правила

1. **Supabase остаётся backend-платформой.** Edge Functions являются серверным
   boundary. Отдельный Node service добавляется только при наличии измеримой
   проблемы, которую Edge Functions не решают.
2. **Fail closed.** Отсутствующая конфигурация авторизации, секрета или policy
   приводит к отказу, а не к разрешению операции.
3. **User-scoped by construction.** Любой доступ к персональным данным либо
   проходит через RLS user JWT, либо явно валидирует владельца до service-role
   запроса.
4. **Sensitive data minimization.** Не логировать payload health-данных, тексты
   чатов, лабораторные значения, токены и credentials.
5. **Idempotency before retry.** Автоматический retry допустим только когда
   операция имеет idempotency key или доказанно безопасна для повторения.
6. **Observable boundaries.** Каждый внешний запрос получает correlation ID,
   duration, outcome и нормализованный error code.
7. **No silent failure.** Пустой `catch`, игнорирование database errors и
   бесконтрольный fire-and-forget запрещены на критических путях.
8. **Migrations are the database contract.** Ручные production-изменения схемы
   без migration запрещены.

## 6. Воркстримы

Каждый воркстрим оформляется отдельным implementation plan и отдельным PR.
Порядок внутри P0/P1 обязателен только там, где указана зависимость.

### WS-A — Code health и testability (P1)

**Источник требований:**
`docs/superpowers/specs/2026-07-13-tech-debt-reduction-design.md`.

**Объём:**

- lint ratchet для изменённых строк;
- типизация database/network boundaries;
- jsdom + Testing Library для UI behavior;
- декомпозиция крупных продуктовых файлов;
- автоматическая защита зеркала scoring formulas.

**Критерии приёмки:**

- общий lint ceiling ниже 100;
- 0 explicit `any` на DB/network boundaries;
- новый lint/`any` на изменённых строках блокирует CI;
- пять наиболее сложных UI-компонентов имеют behavior tests;
- scoring formulas невозможно рассинхронизировать незаметно.

### WS-B — RLS и endpoint authorization audit (P0)

**Затрагиваемые области:**

- `supabase/migrations/`;
- `supabase/functions/`;
- `supabase/config.toml`;
- `supabase/functions/_shared/auth.ts`;
- новый набор integration tests в `tests/security/`.

**Требования:**

1. Сформировать machine-readable inventory всех таблиц, views, RPC и функций.
2. Для каждой таблицы с user data проверить четыре негативных сценария:
   anonymous read, cross-user select, cross-user insert/update и cross-user
   delete.
3. Для каждой `verify_jwt = false` функции зафиксировать альтернативный auth
   boundary и тест на missing/invalid credential.
4. Для каждой service-role функции проверить, что `user_id` нельзя подменить
   пользовательским payload.
5. Запретить wildcard CORS для authenticated endpoints, если он не нужен.
6. Добавить dependency/secret scanning в CI.
7. Документировать threat model: активы, trust boundaries, abuse cases и
   остаточные риски.

**Критерии приёмки:**

- полный security inventory хранится в репозитории;
- автоматические негативные тесты зелёные локально и в CI;
- нет endpoint без указанного owner/auth/rate-limit contract;
- service-role key, Gemini key и webhook secrets отсутствуют в клиентском
  bundle, логах и git history текущей ветки;
- P0/P1 findings закрыты, P2 имеют владельца и срок.

### WS-C — Production observability (P0)

**Новые компоненты:**

- `src/lib/observability.ts` — клиентский error/event adapter;
- `supabase/functions/_shared/observability.ts` — structured Edge Function
  events;
- `docs/guides/observability-runbook.md` — события, dashboard и alert routing.

**Минимальная event schema:**

```ts
type TonusEvent = {
  timestamp: string
  environment: 'preview' | 'production'
  service: 'web' | 'edge'
  operation: string
  requestId: string
  outcome: 'success' | 'failure' | 'delivery_unknown'
  durationMs?: number
  errorCode?: string
  release?: string
}
```

**Запрещённые поля:** email, Telegram chat ID, access/refresh token, AI prompt,
health metric value, lab result, medication name и произвольный request body.

**Требования:**

- выбрать один error-tracking provider и подключить через adapter;
- source maps публикуются только provider'у и привязаны к release SHA;
- web и Edge Functions используют единый request/correlation ID;
- ошибки нормализованы в стабильные error codes;
- настроены алерты для auth spike, ingest failures, cron failures, AI provider
  failures и frontend crash rate;
- demo mode не создаёт production events.

**Критерии приёмки:**

- тестовая ошибка видна с release SHA и request ID;
- по request ID можно связать клиентскую ошибку с Edge Function;
- synthetic failure вызывает alert в пределах 15 минут;
- automated test доказывает redaction запрещённых полей.

### WS-D — Reliability внешних интеграций (P1)

**Область:** ingest-health, Telegram, calendar sync, environment fetch, cron,
AI provider calls и data import.

**Требования:**

- каталог операций с retry/idempotency/timeout policy;
- bounded exponential backoff с jitter для retryable failures;
- no retry для validation, auth и budget errors;
- явный timeout для каждого внешнего HTTP request;
- durable state для jobs, которые нельзя безопасно потерять;
- dead-letter/manual recovery path для terminal failures;
- status UI показывает `last_success_at`, текущую ошибку и действие recovery;
- cron jobs ограничивают batch size и не допускают параллельную обработку
  одного business event.

**Критерии приёмки:**

- повтор webhook не создаёт дубликаты health/intake records;
- partial provider outage не приводит к бесконечному retry storm;
- каждый failed job имеет финальный status и diagnostic code;
- оператор может безопасно переиграть retryable job по runbook;
- chaos tests покрывают timeout, 429, 5xx, malformed response и network throw.

### WS-E — Privacy и data lifecycle (P0)

**Новые артефакты:**

- `docs/privacy/data-inventory.md`;
- `docs/privacy/retention-policy.md`;
- `docs/privacy/ai-processing.md`;
- migration/RPC для account deletion;
- UI deletion flow в settings;
- automated deletion integration test.

**Требования:**

1. Для каждого типа данных указать источник, цель, storage location, processor,
   retention и deletion path.
2. Удаление аккаунта требует недавней re-authentication и явного подтверждения.
3. Удаляются или необратимо отвязываются Postgres rows, Storage objects,
   Telegram link, widget/ingest tokens и scheduled jobs.
4. Сырой ingest payload хранится не более 30 дней, если нет документированной
   причины для меньшего срока.
5. Экспорт данных проверяется на полноту и не включает секреты/служебные ключи.
6. Перед отправкой lab documents или health context внешнему AI provider
   фиксируется информированное согласие.
7. Пользователь может отозвать интеграцию и инвалидировать её токены.

**Критерии приёмки:**

- integration test создаёт fixture user, данные во всех user-owned таблицах,
  выполняет deletion и подтверждает отсутствие доступных остатков;
- expired raw payload удаляется автоматической задачей;
- export/deletion доступны из Settings без обращения к разработчику;
- privacy documents соответствуют фактическим processors и регионам.

Юридическая проверка GDPR/health-data условий выполняется профильным
специалистом и не заменяется этой инженерной спекой.

### WS-F — Backup, restore и incident response (P0)

**Новые артефакты:**

- `docs/guides/backup-restore-runbook.md`;
- `docs/guides/incident-response.md`;
- журнал restore drills без production personal data.

**Требования:**

- включён и проверен автоматический backup Supabase/Postgres;
- описаны восстановление БД, Storage, secrets/config и scheduled jobs;
- restore выполняется в изолированное окружение;
- после restore запускаются schema, RLS и critical journey checks;
- определены severity levels, роли incident commander/communications и
  postmortem template;
- compromised token имеет отдельную процедуру rotation/revocation.

**Критерии приёмки:**

- полный restore drill выполнен за 4 часа или меньше;
- восстановленные данные отстают не более чем на 24 часа;
- после restore проходят auth, ingest, dashboard и deletion smoke tests;
- runbook проверен вторым человеком без устных подсказок автора.

### WS-G — CI/CD и release governance (P1)

**Затрагиваемые файлы:** `.github/workflows/`, `package.json`, branch protection
settings и `docs/guides/release-runbook.md`.

**Требования:**

- обязательные checks: lint ratchet, typecheck/build, unit, UI integration,
  security tests и critical e2e;
- dependency caching не кэширует secrets/runtime state;
- preview environment отделён от production data и credentials;
- deploy привязан к exact commit SHA;
- rollback выполняется на известную предыдущую версию;
- database migration получает forward-fix/rollback note до merge;
- production deploy требует зелёного CI и protected `main`;
- weekly dependency/security update policy с контролируемым merge.

**Критерии приёмки:**

- красный обязательный check технически блокирует merge;
- preview не может обращаться к production database;
- release SHA виден в UI diagnostics и observability events;
- документированный rollback drill выполнен успешно;
- release checklist занимает не более 15 минут ручной работы.

### WS-H — Beta UX и supportability (P1)

**Критические journeys:**

1. регистрация / вход / восстановление доступа;
2. подключение или импорт источника health data;
3. просмотр readiness с объяснением неполных данных;
4. запись события и его корректировка;
5. вопрос AI и понятный degraded state;
6. Telegram linking/unlinking;
7. экспорт и удаление аккаунта.

**Требования:**

- loading, empty, offline, permission denied и provider unavailable states;
- доступный keyboard/focus flow для critical journeys;
- понятные recovery actions вместо generic errors;
- demo mode визуально отделён и не обещает сохранение данных;
- support bundle содержит release, request ID и sanitized diagnostics;
- health/AI выводы содержат uncertainty и safety disclaimer там, где это
  влияет на решение пользователя.

**Критерии приёмки:**

- семь journeys имеют Playwright coverage;
- journeys проходят на mobile и desktop viewport;
- в support flow нельзя скопировать secret или health payload;
- пять внешних beta-пользователей завершают onboarding без помощи автора;
- P0 usability blockers закрыты до публичного приглашения.

## 7. Последовательность реализации

```text
Foundation
  ├─ WS-A: code-health fence
  ├─ WS-B: RLS/auth audit
  └─ WS-C: observability
          ↓
Operational safety
  ├─ WS-D: integration reliability
  ├─ WS-E: privacy lifecycle
  └─ WS-F: backup/incident response
          ↓
Release readiness
  ├─ WS-G: CI/CD governance
  └─ WS-H: beta journeys
```

Рекомендуемый порядок планов:

1. WS-B security inventory и automated negative tests;
2. WS-C observability foundation;
3. WS-A tech-debt fence и UI test infrastructure;
4. WS-E account deletion и retention;
5. WS-D reliability catalogue и critical integrations;
6. WS-F restore/incident drill;
7. WS-G protected release pipeline;
8. WS-H beta journey polish.

## 8. Definition of Done программы

Публичная beta разрешена только когда:

- [ ] все P0 workstreams приняты;
- [ ] security audit не содержит открытых critical/high findings;
- [ ] production observability и alert routing проверены synthetic failure;
- [ ] account export и deletion проходят integration test;
- [ ] restore drill укладывается в RTO/RPO;
- [ ] protected `main` требует полный CI gate;
- [ ] семь critical journeys зелёные в Playwright;
- [ ] privacy, incident, release и backup runbooks актуальны;
- [ ] release candidate работает минимум 7 дней без открытого P0/P1 дефекта;
- [ ] владелец продукта подписал go/no-go checklist.

## 9. Артефакты и traceability

Каждый implementation plan должен:

- ссылаться на конкретный `WS-*` этой спеки;
- перечислять точные файлы и интерфейсы;
- использовать test-first шаги для security/reliability логики;
- завершаться независимо проверяемым результатом;
- включать команды verification и ожидаемый результат;
- обновлять соответствующий runbook в том же PR;
- фиксировать residual risks, которые сознательно остаются.

Существующие документы, которые являются частью программы:

- `docs/superpowers/specs/2026-07-13-tech-debt-reduction-design.md`;
- `docs/superpowers/specs/architecture-hardening/2026-07-09-security-boundaries-design.md`;
- `docs/superpowers/specs/architecture-hardening/2026-07-09-automation-reliability-design.md`;
- `docs/superpowers/specs/architecture-hardening/2026-07-09-database-contract-and-migrations-design.md`;
- `docs/guides/security-secrets-runbook.md`;
- `docs/guides/reminders-ops.md`.

## 10. Оценка объёма

Для одного сильного senior full-stack инженера при существующей кодовой базе:

| Блок | Оценка |
|---|---:|
| WS-A code health/testability | 2–4 недели |
| WS-B security audit | 1–2 недели |
| WS-C observability | 1–2 недели |
| WS-D integration reliability | 2–3 недели |
| WS-E privacy lifecycle | 1–2 недели |
| WS-F backup/incident drills | 3–5 дней |
| WS-G CI/release governance | 3–5 дней |
| WS-H beta UX | 1–3 недели |

С учётом параллельной продуктовой работы и исправлений по результатам beta:
**8–14 недель** одного инженера. Команда из двух сильных инженеров и QA может
сократить календарный срок примерно до **5–8 недель**, но security/privacy и
restore acceptance нельзя сжимать только параллелизацией.

## 11. Решение по Node.js backend

Отсутствие отдельного Node.js backend не является архитектурным пробелом.
Текущие обязанности backend закрываются Postgres, RLS и Edge Functions. Новый
долгоживущий service оправдан только если появится хотя бы одно из условий:

- workload превышает runtime/timeout ограничения Edge Functions;
- нужен persistent connection или queue consumer;
- требуется библиотека/runtime, недоступные в Deno;
- observability показывает системную стоимость/latency проблему текущего
  подхода;
- compliance требует отдельного изолированного boundary.

До появления измеримого условия новый backend увеличит operational surface,
число секретов, deployment paths и failure modes без доказанной пользы.
