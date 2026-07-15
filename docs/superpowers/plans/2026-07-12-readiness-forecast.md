# Readiness Forecast Implementation Plan

> [!CAUTION]
> Historical execution record. Do not run deployment commands from this file.
> Use `docs/guides/edge-function-deployments.md` and `npm run deploy:functions`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Детерминированный прогноз readiness на завтра: движок → вечернее сообщение бота → карточка на дашборде → бэктест (SPEC-READINESS-FORECAST.md).

**Architecture:** Чистый движок в двух зеркальных копиях (`src/lib/forecast.ts` + `_shared/forecast.ts`, политика scores.ts, parity-тест). Сервер собирает входы из `daily_scores`/`metrics_daily`(EAV)/`intake_events`/`environment_daily` и добавляет блок к вечернему вопросу в `send-reminders` §4. Клиентская карточка «Завтра» считает из уже загруженных `daily` + `intakeEvents` (kp на клиенте нет — фактор просто отсутствует; это отражено в спеке).

**Tech Stack:** TypeScript, vitest (node env), Supabase edge functions (Deno), React 19.

---

### Task 1: Движок прогноза `src/lib/forecast.ts`

**Files:**
- Create: `src/lib/forecast.ts`
- Test: `src/lib/forecast.test.ts`

- [ ] **Step 1: Написать падающие тесты**

```ts
// src/lib/forecast.test.ts
import { describe, it, expect } from 'vitest'
import { forecastReadiness, type ForecastInput } from './forecast'

const base = (over: Partial<ForecastInput> = {}): ForecastInput => ({
  readinessLast3: [70, 70, 70],
  sleepLast3: [7.5, 7.5, 7.5],
  sleepBaseline: 7.5,
  alcoholToday: false,
  lateCoffeeToday: false,
  exerciseMinutesToday: null,
  kpToday: null,
  ...over,
})

describe('forecastReadiness', () => {
  it('нет трёх дней readiness → null', () => {
    expect(forecastReadiness(base({ readinessLast3: [null, 70, 70] }))).toBeNull()
    expect(forecastReadiness(base({ readinessLast3: [70, 70, null] }))).toBeNull()
  })

  it('база — взвешенное среднее 0.2/0.3/0.5, без факторов', () => {
    const f = forecastReadiness(base({ readinessLast3: [60, 70, 80] }))!
    expect(f.score).toBe(73) // 12 + 21 + 40
    expect(f.factors).toEqual([])
    expect(f.adviceId).toBeNull()
  })

  it('долг сна: средний сон 3 дней < baseline − 1 → −10', () => {
    const f = forecastReadiness(base({ sleepLast3: [6, 6.2, 6.1] }))!
    expect(f.factors).toContainEqual({ id: 'sleep_debt', delta: -10 })
    expect(f.score).toBe(60)
  })

  it('долг сна не срабатывает без baseline или при < 2 известных ночах', () => {
    expect(forecastReadiness(base({ sleepLast3: [6, 6, 6], sleepBaseline: null }))!.factors).toEqual([])
    expect(forecastReadiness(base({ sleepLast3: [6, null, null] }))!.factors).toEqual([])
  })

  it('алкоголь −15, поздний кофе −5, буря (kp≥5) −5', () => {
    const f = forecastReadiness(base({ alcoholToday: true, lateCoffeeToday: true, kpToday: 5 }))!
    expect(f.factors).toContainEqual({ id: 'alcohol', delta: -15 })
    expect(f.factors).toContainEqual({ id: 'late_coffee', delta: -5 })
    expect(f.factors).toContainEqual({ id: 'storm', delta: -5 })
    expect(f.score).toBe(45)
  })

  it('тяжёлый день: нагрузка ≥60 мин при readiness сегодня <70 → −8', () => {
    const f = forecastReadiness(base({ readinessLast3: [70, 70, 65], exerciseMinutesToday: 75 }))!
    expect(f.factors).toContainEqual({ id: 'heavy_day', delta: -8 })
    // при readiness 70 — не срабатывает
    expect(forecastReadiness(base({ exerciseMinutesToday: 75 }))!.factors).toEqual([])
  })

  it('восходящий тренд 3 дня → +5', () => {
    const f = forecastReadiness(base({ readinessLast3: [60, 65, 70] }))!
    expect(f.factors).toContainEqual({ id: 'uptrend', delta: 5 })
  })

  it('итог зажат в 0–100', () => {
    const f = forecastReadiness(base({
      readinessLast3: [10, 10, 10], sleepLast3: [5, 5, 5],
      alcoholToday: true, lateCoffeeToday: true, kpToday: 7,
    }))!
    expect(f.score).toBe(0)
  })

  it('advice — самый тяжёлый негативный фактор', () => {
    const f = forecastReadiness(base({ alcoholToday: true, lateCoffeeToday: true }))!
    expect(f.adviceId).toBe('alcohol')
  })
})
```

- [ ] **Step 2: Запустить, убедиться что падают** — `npx vitest run src/lib/forecast.test.ts` → FAIL (module not found).

- [ ] **Step 3: Реализация**

```ts
// src/lib/forecast.ts
// Детерминированный прогноз readiness на завтра (SPEC-READINESS-FORECAST §2).
// ЗЕРКАЛО supabase/functions/_shared/forecast.ts — менять синхронно,
// parity-тест в forecast.test.ts. Чистый модуль без зависимостей.

export type FactorId = 'sleep_debt' | 'alcohol' | 'late_coffee' | 'heavy_day' | 'storm' | 'uptrend'

export interface ForecastInput {
  readinessLast3: (number | null)[] // [позавчера, вчера, сегодня]
  sleepLast3: (number | null)[]     // часы сна, тот же порядок
  sleepBaseline: number | null
  alcoholToday: boolean
  lateCoffeeToday: boolean          // событие coffee после 18:00 локального
  exerciseMinutesToday: number | null
  kpToday: number | null            // сегодняшний Kp — прокси на завтра
}

export interface ForecastFactor { id: FactorId; delta: number }

export interface Forecast {
  score: number                     // 0–100
  factors: ForecastFactor[]
  adviceId: FactorId | null         // самый тяжёлый негативный фактор
}

export function forecastReadiness(input: ForecastInput): Forecast | null {
  const [r0, r1, r2] = input.readinessLast3
  if (r0 == null || r1 == null || r2 == null) return null

  const factors: ForecastFactor[] = []

  const sleeps = input.sleepLast3.filter((v): v is number => v != null)
  if (input.sleepBaseline != null && sleeps.length >= 2) {
    const avg = sleeps.reduce((a, b) => a + b, 0) / sleeps.length
    if (avg < input.sleepBaseline - 1) factors.push({ id: 'sleep_debt', delta: -10 })
  }
  if (input.alcoholToday) factors.push({ id: 'alcohol', delta: -15 })
  if (input.lateCoffeeToday) factors.push({ id: 'late_coffee', delta: -5 })
  if (input.exerciseMinutesToday != null && input.exerciseMinutesToday >= 60 && r2 < 70)
    factors.push({ id: 'heavy_day', delta: -8 })
  if (input.kpToday != null && input.kpToday >= 5) factors.push({ id: 'storm', delta: -5 })
  if (r0 < r1 && r1 < r2) factors.push({ id: 'uptrend', delta: 5 })

  const baseScore = 0.2 * r0 + 0.3 * r1 + 0.5 * r2
  const total = baseScore + factors.reduce((a, f) => a + f.delta, 0)
  const score = Math.max(0, Math.min(100, Math.round(total)))

  const negative = factors.filter(f => f.delta < 0).sort((a, b) => a.delta - b.delta)
  return { score, factors, adviceId: negative[0]?.id ?? null }
}
```

- [ ] **Step 4: Тесты зелёные** — `npx vitest run src/lib/forecast.test.ts` → PASS.
- [ ] **Step 5: Commit** — `feat(forecast): движок прогноза readiness на завтра`

### Task 2: Серверное зеркало + parity-тест

**Files:**
- Create: `supabase/functions/_shared/forecast.ts` (копия `src/lib/forecast.ts` c комментарием-зеркалом в другую сторону)
- Modify: `src/lib/forecast.test.ts` (добавить parity-блок)

- [ ] **Step 1: Скопировать движок** в `_shared/forecast.ts`, шапка: `// ЗЕРКАЛО src/lib/forecast.ts — менять синхронно, parity-тест в src/lib/forecast.test.ts.`

- [ ] **Step 2: Parity-тест** (добавить в `src/lib/forecast.test.ts`):

```ts
import { forecastReadiness as forecastServer } from '../../supabase/functions/_shared/forecast'

describe('parity клиент ↔ сервер', () => {
  it('идентичный выход на сетке входов', () => {
    const grid: ForecastInput[] = []
    for (const r of [[50, 60, 70], [80, 75, 72], [30, 30, 30]] as const)
      for (const alco of [false, true])
        for (const kp of [null, 6])
          grid.push(base({ readinessLast3: [...r], alcoholToday: alco, kpToday: kp, sleepLast3: [6, 6, 6] }))
    for (const input of grid)
      expect(forecastServer(input)).toEqual(forecastReadiness(input))
  })
})
```

- [ ] **Step 3: Тесты зелёные**, **Step 4: Commit** — `feat(forecast): серверное зеркало движка + parity-тест`

### Task 3: Форматтер сообщения `_shared/forecastMessage.ts`

**Files:**
- Create: `supabase/functions/_shared/forecastMessage.ts`
- Test: `src/lib/forecastMessage.test.ts` (импорт из `../../supabase/functions/_shared/...` — паттерн parity-тестов)

- [ ] **Step 1: Падающий тест**

```ts
// src/lib/forecastMessage.test.ts
import { describe, it, expect } from 'vitest'
import { forecastBlock } from '../../supabase/functions/_shared/forecastMessage'

describe('forecastBlock', () => {
  it('собирает блок: балл, сравнение, факторы, совет', () => {
    const text = forecastBlock({
      score: 62,
      factors: [{ id: 'sleep_debt', delta: -10 }, { id: 'late_coffee', delta: -5 }],
      adviceId: 'sleep_debt',
    }, 75)
    expect(text).toContain('🔮 Завтра: восстановление ~62')
    expect(text).toContain('ниже обычного')
    expect(text).toContain('недосып')
    expect(text).toContain('(−10)')
    expect(text).toContain('Совет:')
  })
  it('без факторов — без списка и совета, «на уровне»', () => {
    const text = forecastBlock({ score: 74, factors: [], adviceId: null }, 75)
    expect(text).toContain('на уровне обычного')
    expect(text).not.toContain('Совет:')
  })
})
```

- [ ] **Step 2: Реализация**

```ts
// supabase/functions/_shared/forecastMessage.ts
// Текст блока прогноза для вечернего сообщения Telegram (русский — язык бота).
import type { Forecast, FactorId } from './forecast.ts'

const LABELS: Record<FactorId, string> = {
  sleep_debt: 'недосып несколько ночей подряд',
  alcohol: 'алкоголь сегодня',
  late_coffee: 'кофе после 18:00',
  heavy_day: 'большая нагрузка при невысокой готовности',
  storm: 'магнитная буря',
  uptrend: 'восходящий тренд',
}

const ADVICE: Record<FactorId, string> = {
  sleep_debt: 'ляг сегодня пораньше — до 23:00.',
  alcohol: 'больше воды и ранний отбой.',
  late_coffee: 'завтра последний кофе — до обеда.',
  heavy_day: 'завтра лучше лёгкая зона, без интервалов.',
  storm: 'не планируй завтра рекордов — день может быть тяжелее обычного.',
  uptrend: '',
}

const fmtDelta = (d: number) => (d > 0 ? `+${d}` : `−${Math.abs(d)}`)

// refScore — с чем сравнивать (readiness сегодня): ±3 — «на уровне».
export function forecastBlock(f: Forecast, refScore: number | null): string {
  const rel = refScore == null ? ''
    : f.score < refScore - 3 ? ' (ниже обычного)'
    : f.score > refScore + 3 ? ' (выше обычного)'
    : ' (на уровне обычного)'
  const lines = [`🔮 Завтра: восстановление ~${f.score}${rel}`]
  for (const fac of f.factors) lines.push(`• ${LABELS[fac.id]} (${fmtDelta(fac.delta)})`)
  if (f.adviceId && ADVICE[f.adviceId]) lines.push(`Совет: ${ADVICE[f.adviceId]}`)
  return lines.join('\n')
}
```

Примечание: vitest резолвит импорт `./forecast.ts` с расширением (allowImportingTsExtensions уже используется в _shared-тестах; проверить на месте — если нет, тестировать через re-export без расширения по образцу существующих тестов _shared).

- [ ] **Step 3: Тесты зелёные**, **Step 4: Commit** — `feat(forecast): форматтер блока прогноза для Telegram`

### Task 4: Интеграция в `send-reminders` §4

**Files:**
- Modify: `supabase/functions/send-reminders/index.ts` (блок §4, строки ~171–208)

- [ ] **Step 1: Хелпер сбора входов** (локальная функция в index.ts, над `serve`):

```ts
import { forecastReadiness } from '../_shared/forecast.ts'
import { forecastBlock } from '../_shared/forecastMessage.ts'

// Прогноз readiness на завтра для вечернего сообщения (SPEC-READINESS-FORECAST §3.2).
// Любая ошибка данных → null: вечерний вопрос важнее прогноза.
async function buildForecastText(supabase: SupabaseClient, userId: string, tz: string): Promise<string | null> {
  try {
    const today = localDate(tz, new Date())
    const [scoresRes, sleepRes, exRes, evRes, envRes] = await Promise.all([
      supabase.from('daily_scores').select('date, readiness, sleep_baseline')
        .eq('user_id', userId).order('date', { ascending: false }).limit(3),
      supabase.from('daily_metrics').select('date, sleep_hours')
        .eq('user_id', userId).order('date', { ascending: false }).limit(3),
      supabase.from('metrics_daily').select('sum_val')
        .eq('user_id', userId).eq('metric', 'exerciseMinutes').eq('date', today).maybeSingle(),
      supabase.from('intake_events').select('ts, type')
        .eq('user_id', userId).gte('ts', new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
      supabase.from('environment_daily').select('kp_index')
        .eq('user_id', userId).eq('date', today).maybeSingle(),
    ])
    const scores = (scoresRes.data ?? []).reverse() // хронологический порядок
    if (scores.length < 3) return null
    const sleepByDate = new Map((sleepRes.data ?? []).map((r: { date: string; sleep_hours: number | null }) => [r.date, r.sleep_hours]))
    const localHour = (iso: string) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }).format(new Date(iso)))
    const todayEvents = (evRes.data ?? []).filter((e: { ts: string }) => localDate(tz, new Date(e.ts)) === today)
    const forecast = forecastReadiness({
      readinessLast3: scores.map((s: { readiness: number | null }) => s.readiness),
      sleepLast3: scores.map((s: { date: string }) => sleepByDate.get(s.date) ?? null),
      sleepBaseline: scores[scores.length - 1].sleep_baseline ?? null,
      alcoholToday: todayEvents.some((e: { type: string }) => e.type === 'alcohol'),
      lateCoffeeToday: todayEvents.some((e: { type: string; ts: string }) => e.type === 'coffee' && localHour(e.ts) >= 18),
      exerciseMinutesToday: exRes.data?.sum_val ?? null,
      kpToday: envRes.data?.kp_index ?? null,
    })
    if (!forecast) return null
    const todayReadiness = scores[scores.length - 1].readiness
    return forecastBlock(forecast, todayReadiness)
  } catch (_e) {
    return null
  }
}
```

Тип `SupabaseClient` — как уже импортируется/используется в файле (если клиент нетипизирован, параметр объявить как `ReturnType<typeof createClient>`).

- [ ] **Step 2: Вставить блок в §4** — в цикле `noteSettings`, после строки `const q = EVENING_QUESTIONS[...]`:

```ts
const fcText = await buildForecastText(supabase, ns.user_id, ns.timezone || 'Europe/Kyiv')
const msgText = `${q}\n\nОцени самочувствие 1–5:` + (fcText ? `\n\n${fcText}` : '')
```

и заменить `tgSend(link.telegram_chat_id, \`${q}\n\nОцени самочувствие 1–5:\`, wbKeyboard)` на `tgSend(link.telegram_chat_id, msgText, wbKeyboard)`.

- [ ] **Step 3: Проверка** — `npm test` зелёный, `npm run build` зелёный (edge-функции не собираются vite, но tsc по ним не бьёт — проверить `npm run lint` на отсутствие НОВЫХ ошибок).
- [ ] **Step 4: Commit** — `feat(forecast): блок прогноза в вечернем сообщении send-reminders`

### Task 5: Карточка «Завтра» на дашборде

**Files:**
- Modify: `src/App.tsx` (передать `intakeEvents` в Dashboard, ~строка 461)
- Modify: `src/components/dashboard/Dashboard.tsx` (props + ForecastCard)
- Modify: `src/lib/translations.ts` (строки uk/en — по скиллу adding-translations)
- Test: `src/components/dashboard/ForecastCard.test.ts` (экспорт + переводы, паттерн TelegramDemo.test.ts)

- [ ] **Step 1: Пробросить intakeEvents** — `<Dashboard ... intakeEvents={intakeEvents} />`; в Props Dashboard добавить `intakeEvents?: IntakeEvent[]`.

- [ ] **Step 2: ForecastCard** в Dashboard.tsx (рядом с ReadinessCard, тот же стиль карточек):

```tsx
function ForecastCard({ daily, intakeEvents }: { daily: DailyMetrics[]; intakeEvents: IntakeEvent[] }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const scores = computeDailyScores(daily)
  const last3 = scores.slice(-3)
  const today = new Date(); const todayStr = localDateStr(today) // хелпер даты уже есть в файле или взять из lib/experiments localDate
  const todays = intakeEvents.filter(e => e.ts.slice(0, 10) === todayStr)
  const lastDaily = daily[daily.length - 1]
  const forecast = last3.length === 3 ? forecastReadiness({
    readinessLast3: last3.map(s => s.readiness),
    sleepLast3: last3.map(s => { const d = daily.find(x => x.date === s.date); return d?.sleepHours ?? null }),
    sleepBaseline: last3[2].sleep_baseline ?? null,
    alcoholToday: todays.some(e => e.type === 'alcohol'),
    lateCoffeeToday: todays.some(e => e.type === 'coffee' && new Date(e.ts).getHours() >= 18),
    exerciseMinutesToday: lastDaily?.date === todayStr ? lastDaily.exerciseMinutes ?? null : null,
    kpToday: null, // среды на дашборде нет — фактор участвует только в вечернем сообщении
  }) : null
  if (!forecast) return null
  const labels: Record<FactorId, string> = {
    sleep_debt: t('недосып несколько ночей'), alcohol: t('алкоголь сегодня'),
    late_coffee: t('кофе после 18:00'), heavy_day: t('большая нагрузка сегодня'),
    storm: t('магнитная буря'), uptrend: t('восходящий тренд'),
  }
  return (
    <div className="dashboard-card" onClick={() => setOpen(o => !o)}>
      <div className="card-title">{t('Завтра')}</div>
      <div className="forecast-score">{forecast.score}</div>
      {open && forecast.factors.map(f => (
        <div key={f.id} className="forecast-factor">{labels[f.id]} ({f.delta > 0 ? '+' : ''}{f.delta})</div>
      ))}
    </div>
  )
}
```

Точную разметку/классы взять с соседних карточек Dashboard при реализации (это ориентир, не копипаста). Сравнение с сегодняшним readiness — стрелка ↑/↓ как в существующих карточках.

- [ ] **Step 3: Переводы** — все новые `t('…')`-строки добавить в uk/en словари (`adding-translations` скилл), тест переводов по паттерну существующих.
- [ ] **Step 4: Тест-файл карточки** — экспорт определён + все строки переведены.
- [ ] **Step 5: Демо-режим** — `npm run dev` + `VITE_DEMO=1`, карточка видна на фикстурах (у фикстур ≥3 дней скоров). Скриншот через браузер-превью.
- [ ] **Step 6: Commit** — `feat(forecast): карточка «Завтра» на дашборде`

### Task 6: Бэктест

**Files:**
- Create: `src/lib/forecastBacktest.ts`
- Test: `src/lib/forecastBacktest.test.ts`

- [ ] **Step 1: Реализация + тест.** Чистая функция: по массиву `{date, readiness, sleepHours...}` (истории) для каждого дня d (начиная с 4-го) строит прогноз из данных ≤ d и сравнивает с фактическим readiness дня d+1:

```ts
// src/lib/forecastBacktest.ts
import { forecastReadiness } from './forecast'
import type { DailyScore } from './scores'
import type { DailyMetrics } from '../types'

export interface BacktestResult { n: number; mae: number; within10: number }

export function backtestForecast(daily: DailyMetrics[], scores: DailyScore[]): BacktestResult | null {
  const errors: number[] = []
  for (let i = 3; i < scores.length - 1; i++) {
    const last3 = scores.slice(i - 2, i + 1)
    const actual = scores[i + 1].readiness
    if (actual == null) continue
    const f = forecastReadiness({
      readinessLast3: last3.map(s => s.readiness),
      sleepLast3: last3.map(s => daily.find(d => d.date === s.date)?.sleepHours ?? null),
      sleepBaseline: last3[2].sleep_baseline ?? null,
      alcoholToday: false, lateCoffeeToday: false, // событий в бэктесте по метрикам нет
      exerciseMinutesToday: daily.find(d => d.date === last3[2].date)?.exerciseMinutes ?? null,
      kpToday: null,
    })
    if (f) errors.push(Math.abs(f.score - actual))
  }
  if (!errors.length) return null
  return {
    n: errors.length,
    mae: errors.reduce((a, b) => a + b, 0) / errors.length,
    within10: errors.filter(e => e <= 10).length / errors.length,
  }
}
```

Тест: прогнать на `demoFixture` (импорт как в demoFixture.test.ts), `console.log` MAE/within10, assert `result.n > 10`.

- [ ] **Step 2: Тесты зелёные**, **Step 3: Commit** — `feat(forecast): бэктест прогноза на истории`

### Task 7: Финал

- [ ] Всё на ветке `feature/readiness-forecast` (создать в начале работы).
- [ ] `npm test` (все), `npm run build`, `npm run lint` (без новых ошибок против main).
- [ ] Обновить SPEC-READINESS-FORECAST.md: клиентская карточка без kp-фактора (уточнение §3.3).
- [ ] PR → merge при зелёном CI (push-immediately политика).
- [ ] Деплой `supabase functions deploy send-reminders` — **только с явного подтверждения пользователя** (плюс прод сейчас с неисправленным инцидентом доставки — деплой обсудить вместе с фиксом).
