# Программа снижения техдолга — статус (сделано / осталось)

- **Дата:** 2026-07-13
- **Design-спека:** [2026-07-13-tech-debt-reduction-design.md](./2026-07-13-tech-debt-reduction-design.md)
- **Статус:** воркстрим A ЗАВЕРШЁН (сессия 2, PR #50–#55), B готов; C/D не начаты

## Сессия 2 (2026-07-13, вторая половина дня) — воркстрим A добит

| PR | Суть |
|---|---|
| [#50](https://github.com/batstolya/tonus/pull/50) | 10 механических lint-фиксов, потолок 214 → 203 |
| [#51](https://github.com/batstolya/tonus/pull/51) | deno-check храповик в CI (`.deno-check-ceiling`, baseline 44) |
| [#52](https://github.com/batstolya/tonus/pull/52) | 0 any: biweekly-report, suggest-experiments, generate-recommendations (потолок → 132) |
| [#53](https://github.com/batstolya/tonus/pull/53) | 0 any ещё в 8 функциях (потолок → 88) |
| [#54](https://github.com/batstolya/tonus/pull/54) | 0 any: _shared (healthContext и др.) + send-reminders; deno 44 → 32 (потолок → 50) |
| [#55](https://github.com/batstolya/tonus/pull/55) | 0 any: telegram-bot; deno 32 → 16 (потолок → 21) |

**Итог: все 197 `any` в edge-функциях убраны (0 вне `*.test.ts`). Lint-потолок
292 → 21, deno-долг 44 → 16 — оба под храповиками.**

Ключевые находки сессии 2:
- `type SupabaseClient = ReturnType<typeof createClient>` инстанцирует дефолтные
  генерики (schema=never) — это был корень ВСЕХ 18 «предзаданных» ошибок
  telegram-bot и 5 send-reminders. Правильно: `import type { SupabaseClient }`.
- `as typeof data` в позиции типа берёт СУЖЕННЫЙ тип (null) → never-каскад
  (reminderDelivery).
- `.catch()` на PostgrestBuilder не существует — латентный TypeError в error-path
  send-reminders, починен на try/catch.
- Строчные типы для generic-хелперов — type-алиасы, не interface (алиасам TS
  даёт implicit index signature).
- Осталось в lint (21): 19 react-hooks (поведенческие, рискованные) + no-namespace
  + react-refresh. В deno (16): 14 в `_shared/*.test.ts` + SupabaseLike
  (chat-health) + sync-football-fixtures.

## Отправная точка (аудит 2026-07-13)

Проект оценён как крепкий solo/indie senior-уровень (~7/10). Долги:
- **292 lint-ошибки** зафиксированы, но росли бесконтрольно;
- **48 `any` в клиенте** + 197 в edge-функциях (типобезопасность дырявая);
- UI почти без тестов по существу (node-окружение не рендерит React);
- крупные файлы (`translations.ts` 1063, `SettingsScreen.tsx` 854);
- ручное зеркало `scores.ts` ↔ `_shared/scores.ts` (синхронизация руками).

## Сделано — 7 PR, все смёржены и задеплоены

| PR | Ветка | Суть |
|---|---|---|
| [#43](https://github.com/batstolya/tonus/pull/43) | debt-fence-and-test-infra | Забор «долг не растёт» + jsdom-харнес |
| [#44](https://github.com/batstolya/tonus/pull/44) | typed-supabase-client | `createClient<Database>` + регенерация устаревших DB-типов + дрифт-гард |
| [#45](https://github.com/batstolya/tonus/pull/45) | typed-data-layer | `any` из 6 data-layer lib-модулей |
| [#46](https://github.com/batstolya/tonus/pull/46) | typed-components | `any` из компонентов (catch, пропсы, события) |
| [#47](https://github.com/batstolya/tonus/pull/47) | component-behavior-tests | Воркстрим B: behavior-тесты 5 компонентов |
| [#48](https://github.com/batstolya/tonus/pull/48) | recharts-and-lint-config | recharts-тултипы + `^_`-ignore config |
| [#49](https://github.com/batstolya/tonus/pull/49) | function-catch-clauses | 17 `catch (e: any)` в edge-функциях |

### Ключевые результаты

- **lint-потолок 292 → 214** (−78). Механизм — храповик: только вниз.
- **Клиент (`src/`) полностью чист от `any`** (0).
- **Найден и исправлен реальный баг:** `createClient<any>` маскировал, что
  `database.types.ts` устарел — не было целой таблицы `workout_schedule` и
  колонок из трёх мёрджнутых миграций. Регенерированы из живой схемы.
- **UI-тесты 447 → 458** (+11 поведенческих на новом харнесе).

### Инфраструктура, которая теперь есть (durable)

1. **Забор «долг не растёт»** (PR #43):
   - [.lint-ceiling](../../../.lint-ceiling) — число-потолок, храповик через
     [scripts/lint-ceiling.mjs](../../../scripts/lint-ceiling.mjs) (CI падает и при
     росте, и при падении без обновления файла).
   - [scripts/lint-diff.mjs](../../../scripts/lint-diff.mjs) — PR-гейт: новая
     ошибка на изменённых строках роняет CI (`if: pull_request`).
2. **jsdom тест-харнес** (PR #43, #47):
   - vitest split на 2 проекта: `node` (`.test.ts`, чистая логика) + `jsdom`
     (`.test.tsx`, рендер компонентов).
   - [src/test/utils.tsx](../../../src/test/utils.tsx) — `renderWithProviders`.
   - `motion/react` мокается в [vitest.setup.ts](../../../vitest.setup.ts) (иначе
     rAF падает после teardown — флак «window is not defined»).
3. **DB-типы больше не устаревают** (PR #44):
   - `npm run gen:types` — регенерация из линкованного проекта.
   - `npm run gen:types:check` ([scripts/check-db-types.mjs](../../../scripts/check-db-types.mjs))
     — дрифт-гард.
4. **Deno-typecheck нет** (эта сессия, ещё НЕ в CI):
   - `deno` установлен (`~/.deno/bin/deno`, v2.9.2). `deno check supabase/functions/**/*.ts`
     работает (тянет remote-deps один раз).

## Осталось

### Воркстрим A — хвост (главный оставшийся кусок)

**180 `any` в хендлерах edge-функций** (`supabase/functions/**`). Клиент чист;
это всё серверная сторона. Природа: в основном DB-строки, к которым обращаются
по snake_case-колонкам (`rows.map((r: any) => r.resting_heart_rate)`).

**Почему это НЕ мелкая работа (важно для оценки):**
- **Baseline не чистый:** `deno check` находит **44 предзаданные type-ошибки**
  на нетронутом коде (функции никогда не были typecheck-чистыми). 17 из них —
  предзаданный баг `SupabaseClient`-несовместимости в `telegram-bot`.
- **Каскад сужения:** снятие `any` с DB-строки вскрывает замаскированные
  проблемы (`.filter(Boolean)` не сужает тип → `avg()` уже не принимает и т.п.).
  Каждый `any` тянет 1–2 доп-фикса.
- **Нет CI-гейта** для функций → чтобы долг не вернулся, нужен `deno check`
  как храповик в CI (baseline 44).

**Рекомендуемый порядок** (отдельным сфокусированным заходом):
1. Добавить `deno check` в CI как храповик (заморозить 44, не дать расти).
2. Чистить файл за файлом, `deno check <file>` до/после (не увеличивать счётчик
   ошибок в файле). Кандидаты с чистым baseline и многими `any`:
   `biweekly-report` (27), `suggest-experiments` (26), `generate-recommendations` (19).
   `telegram-bot` (30 any + 17 deno-ошибок) — последним, самый грязный.
3. Row-типы определять локально (интерфейс с реально используемыми колонками),
   не тащить клиентский `database.types.ts` в Deno-граф.

**Мелочь по lint (34 не-any ошибки, всё в `src/`):**
- **19 `react-hooks`** (`set-state-in-effect` 12, `purity` 5, `static-components` 2)
  — поведенческие, «починка» может изменить рантайм. Осторожно.
- **10 безопасных механических** (`no-unused-vars` 4, `no-useless-assignment` 3,
  `prefer-const` 2, `no-unused-expressions` 1) — можно быстро добить (потолок ~204),
  низкий риск.
- **Одиночки:** `no-namespace` 1 (`declare global` в `googleCalendar.ts`),
  `preserve-caught-error` 3, `react-refresh` 1 (`useT` в `i18n.tsx`).

### Воркстрим B — тесты UI

Готов первый заход (5 компонентов). Дальше по желанию — расширять покрытие
на остальные экраны (heavy-экраны требуют моков data-layer, не только провайдера).

### Воркстрим C — декомпозиция крупных файлов (не начат)

- `translations.ts` (1063) → разбить по фичам.
- `SettingsScreen.tsx` (854) → выделить секции в под-компоненты.
- Цель: ни один продуктовый файл (кроме сгенерированного `database.types.ts`)
  > ~400 строк. **Рискованный рефактор — делать под защитой тестов (воркстрим B).**

### Воркстрим D — автоген scores-зеркала (не начат)

`scores.ts` и `_shared/scores.ts` синхронятся руками, расхождение ловится
golden-тестами. Заменить на единый источник + генерацию/проверку в CI.
Самый рискованный (формулы критичны) — делать последним.

## Открытые технические долги/заметки

- **`gen:types:check` в CI** требует секрета `SUPABASE_ACCESS_TOKEN` (у CI нет
  DB-логина). Локально работает через Keychain. Одна строка — оставлено владельцу.
- **OpenAI-«зонтик» spec** `2026-07-13-senior-production-readiness-design.md` лежит
  **незакоммиченным** в рабочем дереве (отклонён как scope, но не удалён). Решить:
  коммитить как backlog или удалить.
- **Deno CLI** установлен в `~/.deno/bin`, НЕ в PATH по умолчанию; supabase CLI —
  через `npx supabase` (авторизован через Keychain).

## Механика работы (для следующей сессии)

Ветка от `main` → PR → `gh pr checks --watch` → `gh pr merge --squash --delete-branch`
→ `git checkout main && git fetch && git reset --hard origin/main` (локальный `main`
расходится из-за squash). Untracked-файлы (OpenAI spec) не тащить в коммиты:
`git add -u`, не `git add -A`. Всё требует Node 24.
