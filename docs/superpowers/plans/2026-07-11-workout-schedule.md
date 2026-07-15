# Workout Schedule Implementation Plan

> [!CAUTION]
> Historical execution record. Do not run deployment commands from this file.
> Use `docs/guides/edge-function-deployments.md` and `npm run deploy:functions`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Фиксированное расписание тренировок с умным Telegram-уведомлением за N часов и автоматическим план-vs-факт в AI-контексте, отчёте и виджете.

**Architecture:** Таблица `workout_schedule` (строка на юзера). Уведомление — новый блок в `send-reminders` по паттерну «утренней сводки» (дедуп `last_notified_date`, per-user tz). Чистая логика — `_shared/workoutPlan.ts` (Deno) с зеркалом `src/lib/workoutPlan.ts` для фронта (паттерн scores). Факт тренировки: сервер = EAV `exerciseMinutes ≥ 30` ∪ workout в `intake_events`; фронт = `exerciseMinutes ≥ 30` из `DailyMetrics` (порог как в `src/lib/streak.ts` `ACTIVE_EXERCISE_MIN`).

**Tech Stack:** Postgres (append-only миграция), Deno edge fn, React+vitest, translations.ts (ключ = русский текст).

**Source spec:** `docs/superpowers/specs/2026-07-11-workout-schedule-design.md`

---

## File Structure

- Create `supabase/migrations/20260711120000_workout_schedule.sql` — таблица + RLS.
- Create `supabase/functions/_shared/workoutPlan.ts` + `.test.ts` — shiftTime, plannedDaysInRange, attendance, workoutNotificationText.
- Create `src/lib/workoutPlan.ts` + `.test.ts` — зеркало plannedDaysInRange/attendance + nextPlannedWorkout.
- Modify `supabase/functions/send-reminders/index.ts` — блок 11 «workout notice».
- Modify `supabase/functions/_shared/healthContext.ts` — секция «Тренировки».
- Modify `supabase/functions/biweekly-report/index.ts` — строка соблюдения.
- Create `src/components/dashboard/WorkoutPlanCard.tsx` (+ wiring в Dashboard.tsx).
- Modify `src/components/settings/SettingsScreen.tsx` — карточка расписания.
- Modify `src/lib/translations.ts`, `src/lib/demoFixture.ts`.

### Task 1: Ветка

- [ ] `git checkout main && git pull -q && git checkout -b feature/workout-schedule`
- [ ] Commit плана: `git add docs/superpowers/plans/2026-07-11-workout-schedule.md && git commit -m "docs: workout schedule implementation plan"`

### Task 2: Миграция

Create `supabase/migrations/20260711120000_workout_schedule.sql`:

```sql
-- Расписание тренировок (спека 2026-07-11-workout-schedule-design.md §1).
create table if not exists workout_schedule (
  user_id uuid primary key references auth.users(id) on delete cascade,
  weekdays int[] not null default '{}',      -- 1=Пн … 7=Вс (конвенция reminder_settings)
  time text not null default '19:00',        -- локальное HH:MM
  notify_hours_before int not null default 4,
  timezone text not null default 'Europe/Kyiv',
  enabled boolean not null default true,
  last_notified_date date,
  created_at timestamptz default now()
);
alter table workout_schedule enable row level security;
do $policy$ begin
  create policy "own workout_schedule" on workout_schedule
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $policy$;
```

- [ ] Commit: `feat(db): workout_schedule table`

### Task 3: Чистая логика (TDD)

- [ ] **Step 1: тест** `supabase/functions/_shared/workoutPlan.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { shiftTime, plannedDaysInRange, attendance, workoutNotificationText } from './workoutPlan.ts'

describe('shiftTime', () => {
  it('вычитает часы', () => expect(shiftTime('19:00', 4)).toBe('15:00'))
  it('клампит к 00:00 при уходе на вчера (спека §2 п.3)', () => expect(shiftTime('02:00', 4)).toBe('00:00'))
  it('ровно полночь', () => expect(shiftTime('04:00', 4)).toBe('00:00'))
})

describe('plannedDaysInRange', () => {
  // 2026-07-06 = Пн; weekdays 1/3/5 = Пн/Ср/Пт
  it('находит плановые дни в диапазоне', () => {
    expect(plannedDaysInRange([1, 3, 5], '2026-07-06', '2026-07-12')).toEqual(
      ['2026-07-06', '2026-07-08', '2026-07-10'])
  })
  it('через границу месяца', () => {
    expect(plannedDaysInRange([1], '2026-06-29', '2026-07-07')).toEqual(
      ['2026-06-29', '2026-07-06'])
  })
  it('пустое расписание → пусто', () => {
    expect(plannedDaysInRange([], '2026-07-06', '2026-07-12')).toEqual([])
  })
})

describe('attendance', () => {
  it('считает done/total только по плановым', () => {
    expect(attendance(['2026-07-06', '2026-07-08'], new Set(['2026-07-06', '2026-07-07'])))
      .toEqual({ done: 1, total: 2 })
  })
})

describe('workoutNotificationText', () => {
  const t = '19:00'
  it('высокая готовность', () => {
    expect(workoutNotificationText(t, { readiness: 82, hrv: null, hrvBaseline: null }))
      .toContain('можно выкладываться')
  })
  it('низкая готовность → полегче', () => {
    expect(workoutNotificationText(t, { readiness: 54, hrv: null, hrvBaseline: null }))
      .toContain('полегче')
  })
  it('HRV сильно ниже нормы → полегче даже при среднем readiness', () => {
    expect(workoutNotificationText(t, { readiness: 68, hrv: 60, hrvBaseline: 80 }))
      .toContain('полегче')
  })
  it('нет данных → простое напоминание со временем', () => {
    const s = workoutNotificationText(t, null)
    expect(s).toContain('19:00')
    expect(s).not.toContain('Готовность')
  })
})
```

- [ ] **Step 2:** `npm test -- _shared/workoutPlan` → FAIL (модуля нет)
- [ ] **Step 3: реализация** `supabase/functions/_shared/workoutPlan.ts`:

```ts
// Расписание тренировок: чистая логика (vitest). Зеркало для фронта —
// src/lib/workoutPlan.ts (plannedDaysInRange/attendance) — менять синхронно.

export interface WorkoutScores { readiness: number | null; hrv: number | null; hrvBaseline: number | null }

// 'HH:MM' минус N часов; уход на вчера клампится к '00:00' (спека §2 п.3).
export function shiftTime(hhmm: string, hoursBefore: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  const total = h * 60 + m - hoursBefore * 60
  const t = Math.max(total, 0)
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

// Плановые дни (YYYY-MM-DD, обе границы включительно). weekday: 1=Пн…7=Вс.
export function plannedDaysInRange(weekdays: number[], fromDate: string, toDate: string): string[] {
  if (!weekdays.length) return []
  const out: string[] = []
  const d = new Date(fromDate + 'T00:00:00Z')
  const end = new Date(toDate + 'T00:00:00Z')
  while (d <= end) {
    const wd = d.getUTCDay() === 0 ? 7 : d.getUTCDay()
    if (weekdays.includes(wd)) out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

export function attendance(planned: string[], doneDays: Set<string>): { done: number; total: number } {
  return { done: planned.filter(p => doneDays.has(p)).length, total: planned.length }
}

// Текст уведомления за N часов (спека §2 п.4).
export function workoutNotificationText(time: string, s: WorkoutScores | null): string {
  const base = `🏋️ Сегодня тренировка в ${time}.`
  if (!s || s.readiness == null) return base.slice(0, -1)
  const hrvLow = s.hrv != null && s.hrvBaseline != null && s.hrv < s.hrvBaseline * 0.9
  if (s.readiness < 60 || hrvLow) {
    return `${base} Готовность ${s.readiness}/100${hrvLow ? ', восстановление ниже твоей нормы' : ''} — сегодня лучше полегче.`
  }
  if (s.readiness >= 75) return `${base} Готовность ${s.readiness}/100 — можно выкладываться 💪`
  return `${base} Готовность ${s.readiness}/100.`
}
```

- [ ] **Step 4:** `npm test -- _shared/workoutPlan` → PASS
- [ ] **Step 5: фронт-зеркало** `src/lib/workoutPlan.ts` — скопировать `plannedDaysInRange` + `attendance` (с тем же комментарием-зеркалом) и добавить:

```ts
// Ближайшая плановая тренировка после момента now (для виджета).
export function nextPlannedWorkout(
  weekdays: number[], time: string, now: Date,
): { date: string; time: string; inDays: number } | null {
  if (!weekdays.length) return null
  for (let i = 0; i < 8; i++) {
    const d = new Date(now); d.setDate(d.getDate() + i)
    const wd = d.getDay() === 0 ? 7 : d.getDay()
    if (!weekdays.includes(wd)) continue
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (i === 0) { // сегодня: только если время ещё не прошло
      const [h, m] = time.split(':').map(Number)
      if (now.getHours() * 60 + now.getMinutes() >= h * 60 + m) continue
    }
    return { date: dateStr, time, inDays: i }
  }
  return null
}
```

- [ ] **Step 6: тест зеркала** `src/lib/workoutPlan.test.ts` (те же кейсы plannedDaysInRange/attendance + nextPlannedWorkout: сегодня-до-времени / сегодня-после-времени / пустое расписание → null). `npm test -- lib/workoutPlan` → PASS
- [ ] **Step 7:** Commit `feat(workout): pure plan logic — planned days, attendance, notification text`

### Task 4: Блок уведомления в send-reminders

Modify `supabase/functions/send-reminders/index.ts`:

- [ ] Импорт: `import { shiftTime, workoutNotificationText } from '../_shared/workoutPlan.ts'`
- [ ] Новый блок ПЕРЕД `return new Response` (после блока 10), счётчик `workoutNoticesSent`:

```ts
  // ── 11. Уведомление о тренировке за N часов (спека workout-schedule §2) ─────
  let workoutNoticesSent = 0
  {
    const { data: schedules } = await supabase
      .from('workout_schedule')
      .select('user_id, weekdays, time, notify_hours_before, timezone, last_notified_date')
      .eq('enabled', true)
    for (const ws of schedules ?? []) {
      const { hhmm, weekday, dateStr } = localNow(ws.timezone || 'Europe/Kyiv')
      if (!ws.weekdays?.includes(weekday)) continue
      if (ws.last_notified_date === dateStr) continue
      if (!timeDue(shiftTime(ws.time, ws.notify_hours_before ?? 4), hhmm)) continue
      const { data: link } = await supabase
        .from('telegram_links').select('telegram_chat_id').eq('user_id', ws.user_id).eq('status', 'active').maybeSingle()
      if (!link?.telegram_chat_id) continue
      const { data: score } = await supabase
        .from('daily_scores').select('readiness, hrv_baseline').eq('user_id', ws.user_id).eq('date', dateStr).maybeSingle()
      const { data: hrvRow } = await supabase
        .from('daily_metrics').select('hrv').eq('user_id', ws.user_id).eq('date', dateStr).maybeSingle()
      const text = workoutNotificationText(ws.time, score ? {
        readiness: score.readiness, hrv: hrvRow?.hrv ?? null, hrvBaseline: score.hrv_baseline,
      } : null)
      await tgSend(link.telegram_chat_id, text)
      await supabase.from('workout_schedule').update({ last_notified_date: dateStr }).eq('user_id', ws.user_id)
      workoutNoticesSent++
    }
  }
```

- [ ] Добавить `workoutNoticesSent` в JSON structured result.
- [ ] `npm test && npm run build` зелёные → Commit `feat(workout): smart pre-workout telegram notice in send-reminders`

### Task 5: AI-контекст

Modify `supabase/functions/_shared/healthContext.ts`:

- [ ] Импорт `plannedDaysInRange, attendance` из `./workoutPlan.ts`. В data-gathering `buildHealthContext` добавить параллельные запросы: `workout_schedule` (строка юзера), `metrics_daily` `metric='exerciseMinutes'` за последние 7 дней (`sum_val`), workout-дни из уже загружаемых intake events (если events уже в ctx — использовать их; иначе отдельный select `intake_events` type='workout' за 7 дней).
- [ ] В сборке текста, рядом с секцией ОЦЕНКИ:

```ts
  if (ctx.workoutSchedule?.enabled && ctx.workoutSchedule.weekdays?.length) {
    const ws = ctx.workoutSchedule
    const names = ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
    const weekFrom = /* понедельник текущей недели в tz юзера, YYYY-MM-DD */
    const planned = plannedDaysInRange(ws.weekdays, weekFrom, todayStr)
    const a = attendance(planned, ctx.workoutDoneDays)
    const todayPlanned = ws.weekdays.includes(todayWeekday)
    parts.push(`=== ТРЕНИРОВКИ ===\nПлан: ${ws.weekdays.map((d: number) => names[d]).join('/')} в ${ws.time}. Эта неделя: ${a.done} из ${a.total}. Сегодня ${todayPlanned ? `плановая тренировка в ${ws.time}` : 'отдых по плану'}.`)
  }
```

(`weekFrom`/`todayWeekday` вычислить через уже используемые в файле date-хелперы; done-дни = дни с exerciseMinutes ≥ 30 ∪ workout-дни intake.)

- [ ] `npm test` (healthContext.test.ts не должен сломаться; при необходимости дополнить мок пустым workout_schedule) → Commit `feat(workout): schedule & plan-vs-fact in AI health context`

### Task 6: Отчёт

Modify `supabase/functions/biweekly-report/index.ts`: после загрузки периодов добавить запросы `workout_schedule` + `metrics_daily` `exerciseMinutes` за p2 (текущий период) + intake workout-дни; строка в текст отчёта:

```ts
  if (schedule?.enabled && schedule.weekdays?.length) {
    const planned = plannedDaysInRange(schedule.weekdays, fmt(p2Start), fmt(p2End))
    const a = attendance(planned, doneDays)
    reportParts.push(`🏋️ Тренировки: ${a.done} из ${a.total} по плану`)
  }
```

(точное место вставки — рядом с другими строками сводки; импорт из `../_shared/workoutPlan.ts`).

- [ ] `npm run build` → Commit `feat(workout): plan adherence line in biweekly report`

### Task 7: Виджет на главной + демо

- [ ] Create `src/components/dashboard/WorkoutPlanCard.tsx` — по стилям соседних карточек (см. StreakStats.tsx): принимает `daily: DailyMetrics[]`, грузит расписание сам (`supabase.from('workout_schedule')…maybeSingle()`, а при `isDemoActive()` — фикстура `{ weekdays: [1,3,5], time: '19:00', enabled: true }` из `demoFixture.ts` `makeDemoWorkoutSchedule()`); `null`/disabled → не рендерится; показывает: «Следующая: Ср 19:00 (через 2 дня)» (`nextPlannedWorkout`) и «Месяц: N из M по плану» (`plannedDaysInRange` с 1-го числа по сегодня + done-дни `daily.filter(d => (d.exerciseMinutes ?? 0) >= 30)`).
- [ ] Wiring в `Dashboard.tsx` рядом с существующими виджетами; `makeDemoWorkoutSchedule` в `demoFixture.ts`.
- [ ] Переводы в `translations.ts`: 'Тренировки', 'Следующая', 'через {n} дн.', 'Месяц: {done} из {total} по плану', 'Сегодня тренировка в {time}' (uk/en).
- [ ] Тест `src/components/dashboard/WorkoutPlanCard.test.ts` — паттерн TelegramDemo.test.ts: экспорт существует + все строки покрыты переводами.
- [ ] `npm test && npm run build` → Commit `feat(workout): dashboard widget — next workout & monthly adherence`

### Task 8: Настройки

- [ ] В `SettingsScreen.tsx` — карточка «Тренировки» рядом с напоминаниями: 7 чекбоксов дней (Пн…Вс), input времени, select «за 2/3/4/6 часов», toggle вкл. Загрузка `maybeSingle()`, сохранение `upsert({ user_id, weekdays, time, notify_hours_before, enabled, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })`. В демо — disabled.
- [ ] Переводы: 'Расписание тренировок', 'Дни', 'Время', 'Напомнить за', 'ч.', 'Сохранено' (uk/en, при отсутствии).
- [ ] `npm test && npm run build && npm run lint` (не хуже baseline) → Commit `feat(workout): schedule settings card`

### Task 9: Финиш

- [ ] Полные гейты: `npm test`, `npm run build`, `npm run lint`.
- [ ] Push + PR со сводкой и rollout-чеклистом: 1) `npx supabase db push` (таблица workout_schedule); 2) деплой `send-reminders chat-health telegram-bot biweekly-report --no-verify-jwt` (healthContext шарится chat-health и telegram-bot); 3) фронт — автоматически по зелёному CI; 4) задать расписание в Settings и проверить уведомление ближайшим тренировочным днём.

## Self-Review
- Спека §1 → Task 2; §2 (окно, дедуп, 3 ветки текста, счётчик) → Tasks 3–4; §3 (чистые фн, зеркала, порог 30, intake fallback на сервере) → Tasks 3, 5, 6; §4 (контекст/отчёт/виджет/настройки/переводы/демо) → Tasks 5–8; §5 тесты → Tasks 3, 7; §7 rollout → Task 9. Корреляции — вне scope, задач нет (намеренно).
- Типы согласованы: `WorkoutScores`, `plannedDaysInRange(weekdays, from, to)`, `attendance(planned, doneDays)` едины в Tasks 3–7.
- Код секций healthContext/biweekly дан схемой вставки с точными сигнатурами — файлы большие, точное место определяется при исполнении рядом с указанными якорями (ОЦЕНКИ / строки сводки).
