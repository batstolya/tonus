# Среда в корреляциях + сбор воздуха/пыльцы — Implementation Plan

> [!CAUTION]
> Historical execution record. Do not run deployment commands from this file.
> Use `docs/guides/edge-function-deployments.md` and `npm run deploy:functions`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Завести данные среды (погода/свет/воздух/пыльца) в движок корреляций «Исследования» как немодифицируемые факторы и начать собирать качество воздуха и пыльцу.

**Architecture:** Миграция добавляет 2 колонки в `environment_daily`. Edge-функция `fetch-environment` вторым запросом тянет Open-Meteo Air Quality API и агрегирует почасовые данные в дневные. Чистая логика `research.ts` получает новую категорию `envKeys` и коррелирует её против метрик/проблем, помечая находки `modifiable: false`. Бейдж в UI и пометка для ИИ подают их как внешний фактор.

**Tech Stack:** TypeScript, React 19, Supabase (Postgres + Deno edge functions), Open-Meteo API, vitest (новый — только под чистую логику корреляций).

---

## File Structure

- `supabase/environment-air.sql` — **создать**: миграция, добавляет `air_quality int` и `pollen numeric`.
- `supabase/functions/fetch-environment/index.ts` — **изменить**: второй запрос к Air Quality API, агрегация почасовых→дневные, мёрж.
- `vitest.config.ts` — **создать**: конфиг vitest с dummy env (иначе `createClient` падает при импорте).
- `src/lib/research.test.ts` — **создать**: тесты чистой логики `computeFindings`/`findingsToText`.
- `src/lib/research.ts` — **изменить**: тип `Finding.modifiable`, `ResearchData.envKeys`, env-загрузка в `loadResearchData`, env-корреляции в `computeFindings`, пометка в `findingsToText`.
- `src/components/research/ResearchScreen.tsx` — **изменить**: бейдж 🌍 для `modifiable === false`.
- `package.json` — **изменить**: devDep `vitest` + скрипт `test`.

---

## Task 1: Миграция — колонки air_quality и pollen

**Files:**
- Create: `supabase/environment-air.sql`

- [ ] **Step 1: Создать файл миграции**

`supabase/environment-air.sql`:

```sql
-- Add air quality + pollen to environment_daily (Phase 10c)
-- Run once in Supabase SQL Editor (or via supabase MCP execute_sql)

alter table public.environment_daily add column if not exists air_quality int;   -- European AQI, дневное среднее
alter table public.environment_daily add column if not exists pollen numeric;     -- суммарная пыльца grains/m³, дневное среднее
```

- [ ] **Step 2: Применить миграцию к БД**

Применить через supabase MCP `execute_sql` (или вставить в Supabase SQL Editor) содержимое файла.

- [ ] **Step 3: Проверить, что колонки появились**

Через supabase MCP `execute_sql`:

```sql
select column_name, data_type from information_schema.columns
where table_name = 'environment_daily' and column_name in ('air_quality','pollen');
```

Expected: две строки — `air_quality | integer`, `pollen | numeric`.

- [ ] **Step 4: Commit**

```bash
git add supabase/environment-air.sql
git commit -m "feat(env): add air_quality + pollen columns to environment_daily"
```

---

## Task 2: fetch-environment — сбор качества воздуха и пыльцы

**Files:**
- Modify: `supabase/functions/fetch-environment/index.ts`

- [ ] **Step 1: Добавить запрос Air Quality API и агрегацию**

В `supabase/functions/fetch-environment/index.ts`, после блока, который парсит погоду (после строки `const daylights: number[] = data.daily?.daylight_duration ?? []`), и **до** `const rows = dates.map(...)`, вставить:

```ts
    // ── Air Quality + pollen (best-effort: сбой не ломает синк погоды) ──
    const airByDate: Record<string, { aqiSum: number; aqiN: number; polSum: number; polN: number }> = {}
    try {
      const aqUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
        `&hourly=european_aqi,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,ragweed_pollen,olive_pollen` +
        `&start_date=${start}&end_date=${end}&timezone=auto`
      const aqRes = await fetch(aqUrl)
      if (aqRes.ok) {
        const aq = await aqRes.json()
        const times: string[] = aq.hourly?.time ?? []
        const aqi: (number | null)[] = aq.hourly?.european_aqi ?? []
        const pollenKeys = ['alder_pollen', 'birch_pollen', 'grass_pollen', 'mugwort_pollen', 'ragweed_pollen', 'olive_pollen']
        const pollenSeries: (number | null)[][] = pollenKeys.map(k => aq.hourly?.[k] ?? [])
        for (let i = 0; i < times.length; i++) {
          const d = times[i].slice(0, 10)
          const bucket = (airByDate[d] ??= { aqiSum: 0, aqiN: 0, polSum: 0, polN: 0 })
          if (typeof aqi[i] === 'number') { bucket.aqiSum += aqi[i] as number; bucket.aqiN++ }
          let hourPollen = 0, hasPollen = false
          for (const series of pollenSeries) {
            const v = series[i]
            if (typeof v === 'number') { hourPollen += v; hasPollen = true }
          }
          if (hasPollen) { bucket.polSum += hourPollen; bucket.polN++ }
        }
      }
    } catch (_e) {
      // воздух недоступен — продолжаем без него
    }
    const dailyAqi = (d: string): number | null => {
      const b = airByDate[d]
      return b && b.aqiN ? Math.round(b.aqiSum / b.aqiN) : null
    }
    const dailyPollen = (d: string): number | null => {
      const b = airByDate[d]
      return b && b.polN ? Math.round((b.polSum / b.polN) * 10) / 10 : null
    }
```

- [ ] **Step 2: Добавить поля в строки upsert**

Заменить блок `const rows = dates.map((date, i) => ({ ... }))` на версию с новыми полями:

```ts
    const rows = dates.map((date, i) => ({
      user_id: user.id,
      date,
      temp_c: temps[i] ?? null,
      pressure_hpa: pressures[i] ?? null,
      daylight_minutes: daylights[i] != null ? Math.round(daylights[i] / 60) : null,
      precipitation_mm: precips[i] ?? null,
      air_quality: dailyAqi(date),
      pollen: dailyPollen(date),
    }))
```

- [ ] **Step 3: Задеплоить функцию**

Задеплоить `fetch-environment` через supabase MCP `deploy_edge_function` (функция использует auth → JWT нужен, деплой **без** `--no-verify-jwt`).

- [ ] **Step 4: Проверить сбор данных**

Триггернуть синк: в приложении Настройки → кнопка «Sync environment» (или вызвать функцию с user-JWT). Затем через supabase MCP `execute_sql`:

```sql
select date, temp_c, air_quality, pollen from public.environment_daily
order by date desc limit 10;
```

Expected: для свежих дат `air_quality` заполнен (целое), `pollen` заполнен или null (если для локации нет пыльцы). Если air-quality API недоступен — погодные поля всё равно заполнены, `air_quality`/`pollen` = null (деградация работает).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/fetch-environment/index.ts
git commit -m "feat(env): collect air quality + pollen from Open-Meteo air-quality API"
```

---

## Task 3: Настроить vitest и написать падающий тест логики

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/lib/research.test.ts`

- [ ] **Step 1: Установить vitest**

```bash
npm install -D vitest
```

- [ ] **Step 2: Добавить скрипт test в package.json**

В `package.json`, в блок `"scripts"`, добавить строку (после `"preview"`):

```json
    "test": "vitest run"
```

- [ ] **Step 3: Создать vitest.config.ts**

`vitest.config.ts` (dummy env обязателен — `src/lib/supabase.ts` зовёт `createClient(url, key)` на загрузке модуля, с пустыми значениями бросает «supabaseUrl is required»):

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    },
  },
})
```

- [ ] **Step 4: Написать падающий тест**

`src/lib/research.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeFindings, findingsToText, type ResearchData } from './research'

// 10 дней: hrv и давление синхронно растут (r≈1); световой день тоже растёт.
// Ожидаем: давление↔HRV и свет↔HRV как находки среды; давление↔свет (env×env) — НЕ находка.
const rows = Array.from({ length: 10 }, (_, i) => ({
  date: `2026-06-${String(i + 1).padStart(2, '0')}`,
  hrv: 40 + i,
  env_pressure: 1000 + i,
  env_daylight: 800 + i,
}))

const data: ResearchData = {
  rows,
  eventKeys: [],
  metricKeys: [{ key: 'hrv', label: 'HRV', betterHigh: true }],
  concernKeys: [],
  envKeys: [
    { key: 'env_pressure', label: 'Погода: давление' },
    { key: 'env_daylight', label: 'Среда: световой день' },
  ],
}

describe('computeFindings — среда', () => {
  it('коррелирует факторы среды с метриками и помечает их немодифицируемыми', () => {
    const findings = computeFindings(data)
    const env = findings.find(f => f.a === 'Погода: давление' && f.b === 'HRV')
    expect(env).toBeDefined()
    expect(env!.modifiable).toBe(false)
  })

  it('исключает корреляции среда×среда', () => {
    const findings = computeFindings(data)
    const envEnv = findings.find(f =>
      (f.a === 'Погода: давление' && f.b === 'Среда: световой день') ||
      (f.a === 'Среда: световой день' && f.b === 'Погода: давление'))
    expect(envEnv).toBeUndefined()
  })

  it('помечает внешние факторы в тексте для ИИ', () => {
    expect(findingsToText(computeFindings(data))).toContain('внешний фактор')
  })
})
```

- [ ] **Step 5: Запустить тест — убедиться, что падает**

Run: `npm test`
Expected: FAIL — `research.ts` ещё не знает про `envKeys`/`modifiable`; тип `ResearchData` не содержит `envKeys` (ошибка типов) либо env-находок нет.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/lib/research.test.ts
git commit -m "test(env): failing test for environment correlations in research engine"
```

---

## Task 4: research.ts — реализация env-корреляций

**Files:**
- Modify: `src/lib/research.ts`

- [ ] **Step 1: Добавить поле modifiable в тип Finding**

В `src/lib/research.ts`, в `interface Finding`, после строки `strength: number ...` добавить:

```ts
  modifiable?: boolean           // false для факторов среды (учитывать, но не «целить»)
```

- [ ] **Step 2: Добавить envKeys в ResearchData**

В `interface ResearchData`, после `concernKeys: ...`, добавить:

```ts
  envKeys: { key: string; label: string }[]   // непрерывные немодифицируемые факторы среды
```

- [ ] **Step 3: Загрузить environment_daily в loadResearchData**

Заменить деструктуризацию `Promise.all` (сейчас 5 результатов) — добавить шестой запрос:

```ts
  const [intakeRes, supRes, logRes, concernRes, concernLogRes, envRes] = await Promise.all([
    supabase.from('intake_events').select('ts, type').eq('user_id', userId).gte('ts', `${sinceStr}T00:00:00Z`),
    supabase.from('supplements').select('id, name').eq('user_id', userId).eq('active', true),
    supabase.from('supplement_logs').select('supplement_id, date, taken').eq('user_id', userId).gte('date', sinceStr).eq('taken', true),
    supabase.from('health_concerns').select('id, name').eq('user_id', userId),
    supabase.from('concern_logs').select('concern_id, date, severity').eq('user_id', userId).gte('date', sinceStr),
    supabase.from('environment_daily').select('date, temp_c, pressure_hpa, daylight_minutes, air_quality, pollen').eq('user_id', userId).gte('date', sinceStr),
  ])
```

- [ ] **Step 4: Разложить env-факторы по дням и собрать envKeys**

В `loadResearchData`, после блока обработки проблем (после цикла `for (const c of concerns) { ... }`, перед `const eventKeys = [`), вставить:

```ts
  // среда: непрерывные немодифицируемые факторы
  const ENV_FACTORS: { col: string; key: string; label: string }[] = [
    { col: 'temp_c', key: 'env_temp', label: 'Погода: температура' },
    { col: 'pressure_hpa', key: 'env_pressure', label: 'Погода: давление' },
    { col: 'daylight_minutes', key: 'env_daylight', label: 'Среда: световой день' },
    { col: 'air_quality', key: 'env_aqi', label: 'Среда: AQI' },
    { col: 'pollen', key: 'env_pollen', label: 'Среда: пыльца' },
  ]
  for (const er of envRes.data ?? []) {
    const d = er.date as string
    if (d < sinceStr) continue
    const row = ensure(d)
    for (const f of ENV_FACTORS) { const v = (er as any)[f.col]; if (typeof v === 'number') row[f.key] = v }
  }
  const envPresent = new Set<string>()
  for (const row of byDate.values()) for (const f of ENV_FACTORS) if (row[f.key] != null) envPresent.add(f.key)
  const envKeys = ENV_FACTORS.filter(f => envPresent.has(f.key)).map(f => ({ key: f.key, label: f.label }))
```

- [ ] **Step 5: Вернуть envKeys из loadResearchData**

Заменить строку `return` в конце `loadResearchData`:

```ts
  return { rows, eventKeys, metricKeys: METRICS.map(m => ({ key: m.key as string, label: m.label, betterHigh: m.betterHigh })), concernKeys, envKeys }
```

- [ ] **Step 6: Добавить env-корреляции в computeFindings**

В `computeFindings` обновить деструктуризацию первой строки:

```ts
  const { rows, eventKeys, metricKeys, concernKeys, envKeys } = data
```

Затем сразу после блока «1) Корреляции метрика↔метрика…» (после закрывающей `}` его внешнего цикла, перед комментарием «// 2) Эффект событий…») вставить:

```ts
  // 1b) Корреляции факторов среды × (метрики + проблемы) — env×env не считаем
  const envTargets = [...metricKeys, ...concernKeys]
  for (const e of envKeys) {
    const xa = col(e.key)
    for (const m of envTargets) {
      const ya = col(m.key)
      const xs: number[] = [], ys: number[] = []
      for (let k = 0; k < rows.length; k++) if (xa[k] != null && ya[k] != null) { xs.push(xa[k]!); ys.push(ya[k]!) }
      const r = pearson(xs, ys)
      if (r != null && Math.abs(r) >= 0.3 && xs.length >= 7) {
        out.push({ kind: 'corr', a: e.label, b: m.label, n: xs.length, r, direction: r > 0 ? 'pos' : 'neg', strength: Math.abs(r), modifiable: false })
      }
    }
  }
```

- [ ] **Step 7: Пометить внешние факторы в findingsToText**

Заменить тело `findingsToText`:

```ts
export function findingsToText(findings: Finding[]): string {
  return findings.map(f => {
    const ext = f.modifiable === false ? ' — внешний фактор' : ''
    if (f.kind === 'corr') {
      const dir = f.direction === 'pos' ? 'растут вместе' : 'движутся в противоположные стороны'
      return `• ${f.a} ↔ ${f.b}: r=${f.r!.toFixed(2)} (${dir}), n=${f.n}${ext}`
    }
    const lag = f.lag === 1 ? ' на следующий день' : ''
    const sign = f.delta! > 0 ? '+' : ''
    return `• ${f.a} → ${f.b}${lag}: ${sign}${f.delta!.toFixed(1)} (${f.withMean!.toFixed(1)} vs ${f.withoutMean!.toFixed(1)}), n=${f.n}${ext}`
  }).join('\n')
}
```

- [ ] **Step 8: Запустить тест — убедиться, что проходит**

Run: `npm test`
Expected: PASS — все 3 теста зелёные.

- [ ] **Step 9: Commit**

```bash
git add src/lib/research.ts
git commit -m "feat(env): correlate environment factors with health metrics in research engine"
```

---

## Task 5: UI-бейдж немодифицируемых находок

**Files:**
- Modify: `src/components/research/ResearchScreen.tsx`

- [ ] **Step 1: Добавить бейдж в FindingRow**

В `src/components/research/ResearchScreen.tsx`, в компоненте `FindingRow`, заменить строку с `research-finding-pair`:

```tsx
        <span className="research-finding-pair">
          {f.a} {f.kind === 'corr' ? '↔' : '→'} {f.b}
          {f.modifiable === false && <span title={t('внешний фактор')} style={{ marginLeft: 4 }}>🌍</span>}
        </span>
```

(`t` уже доступен в `FindingRow` через `const { t } = useT()`.)

- [ ] **Step 2: Проверить типы и сборку**

Run: `npm run build`
Expected: PASS — `tsc -b` без ошибок, vite build успешен.

- [ ] **Step 3: Commit**

```bash
git add src/components/research/ResearchScreen.tsx
git commit -m "feat(env): mark environment findings with 🌍 external-factor badge"
```

---

## Task 6: Финальная проверка

- [ ] **Step 1: Полный прогон тестов и сборки**

```bash
npm test && npm run build
```

Expected: тесты зелёные, сборка успешна.

- [ ] **Step 2: Ручная сквозная проверка**

1. Настройки → «Sync environment» → без ошибок.
2. SQL: `select date, air_quality, pollen from environment_daily order by date desc limit 5;` — поля заполнены.
3. «Исследования» → прогнать за период с данными среды → среди находок есть факторы «Погода/Среда» с бейджем 🌍; объяснение ИИ упоминает их как внешние.

---

## Self-Review (заполнено автором плана)

- **Покрытие спека:** Часть 1 (air/pollen) → Task 1–2. Часть 2 (research.ts: тип, envKeys, loadResearchData, computeFindings env×targets без env×env, findingsToText) → Task 3–4. UI-бейдж → Task 5. Деградация air-quality → Task 2 Step 4. Всё покрыто.
- **Плейсхолдеры:** нет — весь код приведён дословно.
- **Согласованность типов:** `Finding.modifiable`, `ResearchData.envKeys`, ключи `env_*`, метки «Погода:/Среда:» совпадают между тестом (Task 3) и реализацией (Task 4). Колонки `air_quality`/`pollen` одинаковы в миграции (Task 1), функции (Task 2) и select в research.ts (Task 4).
