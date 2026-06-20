# Среда в корреляциях + сбор воздуха/пыльцы — дизайн

**Дата:** 2026-06-21
**Объём:** Phase 10c, пункты 1 и 2 из аудита спеков. Telegram Mini App отложен отдельным циклом.

## Проблема

`environment_daily` собирается (погода + световой день), есть кнопка синка в Настройках, но:

1. Движок корреляций `src/lib/research.ts` **не использует** `environment_daily` вообще — данные копятся вхолостую. Главное обещание спеки 10c («объяснять странные дни погодой/светом, коррелировать со сном/пульсом») не выполнено.
2. Качество воздуха и пыльца **не собираются**. `fetch-environment` тянет из Open-Meteo только `temperature_2m_mean, surface_pressure_mean, precipitation_sum, daylight_duration`. Колонок `air_quality`/`pollen` в таблице нет (спека их перечисляла, миграция — нет).

## Цель

Среда реально влияет на находки в разделе «Исследования» и подаётся как **немодифицируемый** фактор (его нельзя «улучшить целью», только учитывать). Воздух и пыльца собираются вместе с погодой.

## Не в объёме (YAGNI / отдельные циклы)

- Чат-контекст и `analyze-health` (среда туда не врезается — только в `research.ts` → `deep-research`).
- Новые графики среды в UI.
- Сканирование штрихкода в питании.
- Telegram Mini App.
- Per-location lat/lon из профиля (остаётся захардкоженный Мюнхен, как сейчас).

## Часть 1 — сбор воздуха/пыльцы

### Миграция `supabase/environment-air.sql`

Добавить в `public.environment_daily`:

```sql
alter table public.environment_daily add column if not exists air_quality int;     -- European AQI, дневное среднее
alter table public.environment_daily add column if not exists pollen numeric;       -- суммарная пыльца grains/m³, дневное среднее
```

### `supabase/functions/fetch-environment/index.ts`

После основного запроса погоды — второй запрос к Open-Meteo **Air Quality API** (бесплатный, без ключа):

```
https://air-quality-api.open-meteo.com/v1/air-quality
  ?latitude=${lat}&longitude=${lon}
  &hourly=european_aqi,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,ragweed_pollen,olive_pollen
  &start_date=${start}&end_date=${end}&timezone=auto
```

- Air Quality API отдаёт **почасовые** значения → агрегируем в дневное среднее по дате (`hourly.time[i].slice(0,10)`).
- `air_quality` = дневное среднее `european_aqi` (округлить до int).
- `pollen` = дневное среднее суммы доступных типов пыльцы (часовые `null` пропускаем; типы, которых нет для локации, приходят как `null` — игнорируем).
- Пыльца у Open-Meteo доступна только для Европы; Мюнхен подходит. Если поля нет — `pollen = null`, не падаем.
- Запрос воздуха обёрнут так, что его ошибка/недоступность **не ломает** синк погоды (best-effort: при сбое air-quality пишем погоду, `air_quality`/`pollen` = null).
- Мёрж в те же строки по дате перед общим `upsert` в `environment_daily`.

## Часть 2 — врезка в `research.ts` (Вариант 2: отдельная немодифицируемая категория)

### Тип `Finding`

Добавить поле:

```ts
modifiable?: boolean   // false для факторов среды (учитывать, но не «целить»); по умолчанию/undefined = модифицируемый
```

### `loadResearchData`

- Догрузить `environment_daily` за период (тот же `sinceStr`, что и остальные источники), параллельно в `Promise.all`.
- Разложить по дням в факторы строки `DayRow`:
  - `env_temp` ← `temp_c`
  - `env_pressure` ← `pressure_hpa`
  - `env_daylight` ← `daylight_minutes`
  - `env_aqi` ← `air_quality`
  - `env_pollen` ← `pollen`
- Только реально присутствующие (не-null) значения; день без env-данных просто не получает этих ключей (как метрики).
- Вернуть новую категорию в `ResearchData`:

```ts
envKeys: { key: string; label: string }[]   // непрерывные, немодифицируемые
```

Метки человекочитаемые: «Погода: температура», «Погода: давление», «Среда: световой день», «Среда: AQI», «Среда: пыльца».

### `computeFindings`

- env-факторы — **непрерывные**, коррелируем по Пирсону против `[...metricKeys, ...concernKeys]` (метрики + проблемы).
- **Не** считаем env × env (температура↔световой день — шум) и не дублируем существующие пары метрика↔метрика.
- Те же пороги: `|r| ≥ 0.3`, `n ≥ 7`.
- Найденные env-корреляции помечаем `modifiable: false`.

### `findingsToText`

- env-находки уже попадают в текст для `deep-research` (это и есть «учёт среды в ИИ-выводах»).
- Опционально в строке немодифицируемой находки добавить пометку «(внешний фактор)», чтобы ИИ не предлагал «исправить» погоду. Реализация: если `f.modifiable === false`, дописать « — внешний фактор» в конец строки.

### UI (`ResearchScreen.tsx`)

- Минимально: env-находки рендерятся как обычные (метки «Погода/Среда» уже самоописательны). Если рендер находок легко поддержит бейдж — добавить маленький «🌍 внешний» для `modifiable === false`. Не обязательно для прохождения спеки; решается при реализации по факту структуры рендера.

## Проверка

- `tsc` / `npm run build` зелёные.
- Дёрнуть `fetch-environment` → в `environment_daily` заполнены `air_quality` и `pollen` за дни, где Open-Meteo отдал данные.
- Прогнать «Исследования» за период с данными среды → среди находок присутствуют env-факторы; они помечены немодифицируемыми; текст для ИИ их содержит.
- Деградация: если air-quality API недоступен — синк погоды всё равно проходит, env-корреляции просто без AQI/пыльцы.

## Файлы

- `supabase/environment-air.sql` (новый)
- `supabase/functions/fetch-environment/index.ts` (правка: второй запрос + агрегация + мёрж)
- `src/lib/research.ts` (правка: тип `Finding`, `ResearchData.envKeys`, `loadResearchData`, `computeFindings`, `findingsToText`)
- `src/components/research/ResearchScreen.tsx` (опц. бейдж немодифицируемых находок)
