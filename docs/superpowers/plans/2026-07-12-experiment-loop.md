# Experiment Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Запуск эксперимента из Telegram в два тапа + гарантированный автовердикт по завершении (SPEC-EXPERIMENT-LOOP.md).

**Architecture:** Серверное зеркало движка результатов (`_shared/experiments.ts`, parity-тест с `src/lib/experiments.ts`). Автовердикт — дневной блок §12 в `send-reminders` с атомарным переходом `active→completed`. Запуск — пункт MAIN_MENU в `telegram-bot` → function-to-function вызов `suggest-experiments` (добавить service-путь по образцу `biweekly-report`) → идеи в `coach_events` (type `exp_suggestion`) → кнопка `expsug:<id>`.

**Tech Stack:** TypeScript, vitest, Supabase edge functions (Deno), Telegram Bot API.

---

### Task 1: Серверное зеркало движка — `_shared/experiments.ts`

**Files:**
- Create: `supabase/functions/_shared/experiments.ts`
- Modify: `src/lib/experiments.test.ts` (parity-блок)

- [ ] **Step 1:** Скопировать из `src/lib/experiments.ts` чистую часть: `MIN_N`, `METRIC_OPTIONS`, `isValidMetric`, `metricLabel`, `addDays`, `computeBaselineStart`, `metricValue`, `std`, `mean`, `computeResult`, `effectLabel`, типы `ExperimentRow`, `ExperimentResult`. Вместо `import type { DailyMetrics }` объявить структурный тип:

```ts
// Минимальный дневной ряд для computeResult (структурно совместим с DailyMetrics клиента)
export interface ExpDaily {
  date: string
  hrv?: number | null
  restingHeartRate?: number | null
  sleepHours?: number | null
  sleepDeep?: number | null
  sleepREM?: number | null
  steps?: number | null
  activeEnergy?: number | null
  oxygenSaturation?: number | null
  heartRate?: { avg: number } | null
}
```

`metricValue(d, metric)` — тот же код (сохранить ветку `'avg' in v` и `oxygenSaturation * 100`). Шапка файла: `// ЗЕРКАЛО src/lib/experiments.ts (computeResult и датовые хелперы) — менять синхронно, parity-тест в src/lib/experiments.test.ts.`

- [ ] **Step 2:** Parity-блок в `src/lib/experiments.test.ts`:

```ts
import { computeResult as computeResultServer, effectLabel as effectLabelServer } from '../../supabase/functions/_shared/experiments'
// фикстуры: 30 дней hrv 40..55, эксперимент start=день 15, end=день 29, baseline_days=14
// прогнать оба computeResult и сравнить toEqual; effectLabel сравнить на [-1, -0.3, 0, 0.25, 0.6, 1.2, null]
```

(полные фикстуры — по образцу существующих тестов computeResult в этом файле; тот же вход обоим движкам, `expect(serverRes).toEqual(clientRes)`.)

- [ ] **Step 3:** `npx vitest run src/lib/experiments.test.ts` → PASS. Commit: `feat(exp-loop): серверное зеркало движка результатов + parity-тест`

### Task 2: Вердикт-формат — `_shared/experimentVerdict.ts`

**Files:**
- Create: `supabase/functions/_shared/experimentVerdict.ts`
- Test: `supabase/functions/_shared/experimentVerdict.test.ts`

- [ ] **Step 1: Тест** — вердикт с эффектом содержит гипотезу, «До/Во время», d и число дней; вердикт при `insufficient` содержит «данных мало» и не выдумывает числа.

```ts
import { describe, it, expect } from 'vitest'
import { verdictMessage } from './experimentVerdict.ts'
// result-фикстура с baselineMean 6.8, expMean 7.4, cohenD 0.62, expN 12 →
// содержит '🧪', 'Кофе только до обеда', '6.8', '7.4', 'd = 0.62', '12'
// insufficient-фикстура → содержит 'данных мало'
```

- [ ] **Step 2: Реализация**

```ts
// supabase/functions/_shared/experimentVerdict.ts
// Текст вердикта эксперимента для Telegram (SPEC-EXPERIMENT-LOOP §2.2).
import { effectLabel, metricLabel, type ExperimentResult } from './experiments.ts'

export function verdictMessage(hypothesis: string, targetMetric: string, r: ExperimentResult): string {
  const head = `🧪 Эксперимент завершён: «${hypothesis}»\n\nМетрика: ${metricLabel(targetMetric)}`
  if (r.insufficient || r.delta == null) {
    return `${head}\n\nДанных мало, чтобы судить об эффекте (${r.insufficient ? `${r.insufficient.n} из минимум ${r.insufficient.minN} дней в окне` : 'нет значений'}) — вердикт неубедительный.\n\nПодробности — в приложении → Эксперименты.`
  }
  const sign = r.delta > 0 ? '+' : ''
  return `${head}\nДо: ${r.baselineMean} → Во время: ${r.expMean} (${sign}${r.delta})\nЭффект: ${effectLabel(r.cohenD)} (d = ${r.cohenD}), ${r.expN} дней с данными\n\nПодробности и график — в приложении → Эксперименты.`
}
```

- [ ] **Step 3:** Тесты зелёные. Commit: `feat(exp-loop): формат вердикта для Telegram`

### Task 3: Автовердикт — `send-reminders` §12

**Files:**
- Modify: `supabase/functions/send-reminders/index.ts` (после блока §11, перед финальным Response)

- [ ] **Step 1:** Новый блок:

```ts
// ── 12. Автовердикт завершившихся экспериментов (SPEC-EXPERIMENT-LOOP §2.2) ──
let verdictsSent = 0
{
  const { data: activeExps } = await supabase
    .from('experiments')
    .select('id, user_id, hypothesis, target_metric, baseline_days, baseline_start, start_date, end_date')
    .eq('status', 'active')
  for (const exp of activeExps ?? []) {
    const { data: rs } = await supabase.from('report_settings').select('timezone').eq('user_id', exp.user_id).maybeSingle()
    const tz = rs?.timezone || 'Europe/Kyiv'
    const { hhmm, dateStr } = localNow(tz)
    if (!timeDue('09:10', hhmm)) continue
    if (exp.end_date >= dateStr) continue // ещё идёт

    const baseStart = exp.baseline_start ?? computeBaselineStart(exp.start_date, exp.baseline_days)
    const { data: rows } = await supabase
      .from('daily_metrics')
      .select('date, hrv, resting_heart_rate, sleep_hours, sleep_deep, sleep_rem, steps, active_energy, oxygen_saturation')
      .eq('user_id', exp.user_id).gte('date', baseStart).lte('date', exp.end_date).order('date')
    const daily: ExpDaily[] = (rows ?? []).map((r: Record<string, unknown>) => ({
      date: r.date as string,
      hrv: r.hrv as number | null,
      restingHeartRate: r.resting_heart_rate as number | null,
      sleepHours: r.sleep_hours as number | null,
      sleepDeep: r.sleep_deep as number | null,
      sleepREM: r.sleep_rem as number | null,
      steps: r.steps as number | null,
      activeEnergy: r.active_energy as number | null,
      oxygenSaturation: r.oxygen_saturation as number | null,
    }))
    const result = computeResult(daily, exp as unknown as ExperimentRow)

    // Атомарный переход: 0 строк → уже завершил параллельный ран, не дублируем
    const { data: updated } = await supabase
      .from('experiments')
      .update({ status: 'completed', result })
      .eq('id', exp.id).eq('status', 'active')
      .select('id')
    if (!updated?.length) continue

    const { data: link } = await supabase
      .from('telegram_links').select('telegram_chat_id').eq('user_id', exp.user_id).eq('status', 'active').maybeSingle()
    if (link?.telegram_chat_id) {
      await tgSend(link.telegram_chat_id, verdictMessage(exp.hypothesis, exp.target_metric, result))
      verdictsSent++
    }
  }
}
```

Импорты: `computeBaselineStart, computeResult, type ExpDaily, type ExperimentRow` из `../_shared/experiments.ts`, `verdictMessage` из `../_shared/experimentVerdict.ts`. `verdictsSent` добавить в финальный JSON-ответ. Названия колонок view сверить с `_shared/chatTools.ts` (метрики оттуда же); колонки сна `sleep_deep`/`sleep_rem` проверить фактически — если во view их нет, убрать из select и из маппинга (метрики останутся доступны через остальные).

- [ ] **Step 2:** `npm run lint` — без новых ошибок (сравнить счёт до/после). `npm test` зелёный. Commit: `feat(exp-loop): автовердикт экспериментов в send-reminders`

### Task 4: Service-путь в `suggest-experiments`

**Files:**
- Modify: `supabase/functions/suggest-experiments/index.ts` (блок auth, ~строки 39–43)

- [ ] **Step 1:** Заменить auth-блок на паттерн biweekly-report:

```ts
const authHeader = req.headers.get('Authorization') ?? ''
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
// Service-role вызов из telegram-bot с x-user-id (паттерн biweekly-report)
const serviceUserId = req.headers.get('x-user-id')
let user: { id: string } | null = null
if (serviceUserId && authHeader.includes(SUPABASE_SERVICE_KEY.slice(0, 20))) {
  const { data } = await supabase.auth.admin.getUserById(serviceUserId)
  user = data.user
} else {
  const { data, error } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
  if (error || !data.user) return new Response('Unauthorized', { status: 401, headers: CORS })
  user = data.user
}
if (!user) return new Response('Unauthorized', { status: 401, headers: CORS })
```

(дальше по файлу `user.id` уже используется — совместимо.)

- [ ] **Step 2:** Lint без новых ошибок. Commit: `feat(exp-loop): service-вызов suggest-experiments из бота`

### Task 5: Бот — меню, генерация идей, запуск

**Files:**
- Modify: `supabase/functions/telegram-bot/index.ts` (MAIN_MENU ~строка 62; callback-роутер ~строка 674; новые функции рядом с handleGoals)

- [ ] **Step 1:** В `MAIN_MENU` добавить ряд `[{ text: '🧪 Предложи эксперимент', callback_data: 'exp_suggest' }]` (перед строкой настроек).

- [ ] **Step 2:** Функция генерации:

```ts
async function handleExperimentSuggest(chatId: number | string, userId: string, supabase: SupabaseClient) {
  await tgSend(chatId, '⏳ Смотрю твои данные и придумываю эксперименты…')
  const res = await fetch(`${SUPABASE_URL}/functions/v1/suggest-experiments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'x-user-id': userId,
    },
    body: JSON.stringify({ mode: 'generate' }),
  })
  if (res.status === 402) {
    const j = await res.json().catch(() => null)
    await tgSend(chatId, j?.message ?? '💸 Лимит ИИ на сегодня исчерпан.')
    return
  }
  if (!res.ok) { await tgSend(chatId, '🤔 Не получилось сгенерировать идеи, попробуй позже.'); return }
  const { suggestions } = await res.json()
  if (!suggestions?.length) {
    await tgSend(chatId, 'Пока недостаточно данных для идей — понадобится хотя бы неделя метрик.', { reply_markup: BACK_MENU })
    return
  }
  for (const s of suggestions.slice(0, 2)) {
    const { data: ev } = await supabase.from('coach_events')
      .insert({ user_id: userId, type: 'exp_suggestion', status: 'open', payload: s })
      .select('id').single()
    if (!ev) continue
    await tgSend(chatId,
      `🧪 <b>${s.hypothesis}</b>\n\nЧто менять: ${s.change_rule}\nМетрика: ${s.target_metric}\n${s.rationale}`,
      { reply_markup: { inline_keyboard: [[{ text: '▶️ Запустить (14 дней)', callback_data: `expsug:${ev.id}` }]] } })
  }
}
```

- [ ] **Step 3:** Callback-ветки в роутере (`else if` цепочка):

```ts
} else if (data === 'exp_suggest') {
  await handleExperimentSuggest(chatId, userId, supabase)
} else if (data.startsWith('expsug:')) {
  const evId = data.slice('expsug:'.length)
  const { data: ev } = await supabase.from('coach_events')
    .select('id, payload, status').eq('id', evId).eq('user_id', userId).maybeSingle()
  if (!ev || ev.status !== 'open') {
    await tgSend(chatId, 'Этот эксперимент уже запущен или устарел.')
  } else {
    const s = ev.payload as { hypothesis: string; change_rule: string; target_metric: string }
    const { data: ns } = await supabase.from('daily_note_settings').select('timezone').eq('user_id', userId).maybeSingle()
    const tz = ns?.timezone || 'Europe/Kyiv'
    const start = addDays(localDate(tz, new Date()), 1)
    const end = addDays(start, 13)
    const { error: insErr } = await supabase.from('experiments').insert({
      user_id: userId,
      hypothesis: s.hypothesis, change_rule: s.change_rule, target_metric: s.target_metric,
      baseline_days: 14, baseline_start: computeBaselineStart(start, 14),
      start_date: start, end_date: end, status: 'active',
    })
    if (insErr) {
      await tgSend(chatId, '🤔 Не получилось запустить, попробуй из приложения.')
    } else {
      await supabase.from('coach_events').update({ status: 'done' }).eq('id', ev.id)
      // убрать кнопку с исходного сообщения (паттерн wb:)
      await tgCall('editMessageReplyMarkup', { chat_id: chatId, message_id: cq.message.message_id })
      await tgSend(chatId, `▶️ Запустил! Стартуем ${start}, вердикт пришлю утром после ${end}.`, { reply_markup: BACK_MENU })
    }
  }
}
```

Импорты в telegram-bot: `addDays, computeBaselineStart` из `../_shared/experiments.ts`, `localDate` из `../_shared/time.ts`. Тип `SupabaseClient` — как у соседних handle*-функций файла.

- [ ] **Step 4:** Lint без новых ошибок, `npm test`. Commit: `feat(exp-loop): запуск эксперимента из бота`

### Task 6: Экран предпочитает сохранённый result

**Files:**
- Modify: `src/components/research/ExperimentsScreen.tsx` (место вызова `computeResult`)

- [ ] **Step 1:** Найти вызовы `computeResult(...)` на экране; для `completed`-экспериментов использовать `exp.result ?? computeResult(...)` (сервер посчитал финально — расхождений с пересчётом быть не должно благодаря parity, но правда одна — сохранённая).
- [ ] **Step 2:** `npm test`, визуальная проверка демо-режима (демо-фикстуры экспериментов). Commit: `feat(exp-loop): экран использует сохранённый вердикт`

### Task 7: Финал

- [ ] Ветка `feature/experiment-loop` (от main после merge PR #32).
- [ ] `npm test` + `npm run build` + `npm run lint` (счёт = baseline).
- [ ] PR → merge при зелёном CI.
- [ ] Деплой `send-reminders`, `telegram-bot`, `suggest-experiments` — **только с явного подтверждения пользователя**.
