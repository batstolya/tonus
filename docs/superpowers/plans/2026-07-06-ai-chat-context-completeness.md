# AI Chat Context Completeness — Implementation Plan

> [!CAUTION]
> Historical execution record. Do not run deployment commands from this file.
> Use `docs/guides/edge-function-deployments.md` and `npm run deploy:functions`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close data gaps in the shared AI chat context builder (bedtime/wake time, honest week-over-week comparisons, health concerns, health alerts, past recommendations, goal progress) and give the Gemini chat function-calling access to precise date ranges, so `chat-health` answers stop being incomplete or fabricated.

**Architecture:** All data-completeness work lives in `supabase/functions/_shared/healthContext.ts` (single context builder shared by chat/bot/reports) and its test file. Tool-use is a new pure loop module (`_shared/chatToolLoop.ts`) plus a tool-declarations/executor module (`_shared/chatTools.ts`), wired into `chat-health/index.ts`. Design doc: [docs/superpowers/specs/2026-07-06-ai-chat-context-completeness-design.md](../specs/2026-07-06-ai-chat-context-completeness-design.md).

**Tech Stack:** TypeScript, Deno edge functions (Supabase), vitest (Node environment — see `CLAUDE.md`, everything requires Node 24).

---

**Before every test run in this plan**, make sure Node 24 is active:

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
```

## Phase A — Context data completeness (`_shared/healthContext.ts`)

### Task 1: Timezone plumbing + sleep bedtime/wake time

**Files:**
- Modify: `supabase/functions/_shared/healthContext.ts`
- Test: `supabase/functions/_shared/healthContext.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `healthContext.test.ts`. First, update `emptyCtx` to include `timezone` (required field we're about to add):

```typescript
const emptyCtx: HealthContext = {
  periodDays: 14, timezone: 'Europe/Berlin', coachProfile: null, scores: null, metrics: [], sleep: [],
  labs: [], supplements: [], intake: [], supplementLogs: [], notes: [],
  calendar: [], goals: [], experiments: [], environment: [],
}
```

Then add a new describe block (place it after the `healthContextToText: goals & experiments` block):

```typescript
describe('healthContextToText: sleep timing', () => {
  it('renders bedtime and wake time per night, converted to the given timezone', () => {
    const text = healthContextToText({
      ...emptyCtx,
      timezone: 'Europe/Berlin',
      sleep: [
        { date: '2026-07-05', duration_hours: 7.2, deep_hours: 1.1, rem_hours: 1.7, core_hours: 4.4, bedtime: '2026-07-04T21:47:00Z', wake_time: '2026-07-05T05:10:00Z' },
      ],
    })
    // Europe/Berlin в июле — UTC+2, значит 21:47 UTC = 23:47 локально, 05:10 UTC = 07:10 локально
    expect(text).toContain('засыпание 23:47')
    expect(text).toContain('подъём 07:10')
  })

  it('renders average bedtime across nights', () => {
    const text = healthContextToText({
      ...emptyCtx,
      timezone: 'Europe/Berlin',
      sleep: [
        { date: '2026-07-05', duration_hours: 7.2, deep_hours: 1.1, rem_hours: 1.7, core_hours: 4.4, bedtime: '2026-07-04T21:40:00Z', wake_time: null },
        { date: '2026-07-04', duration_hours: 7.0, deep_hours: 1.0, rem_hours: 1.6, core_hours: 4.2, bedtime: '2026-07-03T22:00:00Z', wake_time: null },
      ],
    })
    // 23:40 и 00:00 локально → среднее 23:50
    expect(text).toContain('Среднее время засыпания: 23:50')
  })

  it('omits per-night time when bedtime/wake_time are null, without breaking the line', () => {
    const text = healthContextToText({
      ...emptyCtx,
      timezone: 'Europe/Berlin',
      sleep: [{ date: '2026-07-05', duration_hours: 7.2, deep_hours: 1.1, rem_hours: 1.7, core_hours: 4.4, bedtime: null, wake_time: null }],
    })
    expect(text).toContain('2026-07-05: всего 7.2ч')
    expect(text).not.toContain('засыпание')
    expect(text).not.toContain('Среднее время засыпания')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run supabase/functions/_shared/healthContext.test.ts`
Expected: FAIL — `timezone` missing from type / `засыпание` not found in output (bedtime/wake_time not selected or rendered yet).

- [ ] **Step 3: Implement**

In `healthContext.ts`, update `HealthContextOptions` and `HealthContext`:

```typescript
export interface HealthContextOptions {
  periodDays?: number          // окно агрегации (по умолчанию 14)
  includeCoachProfile?: boolean // подмешивать память коуча сверху
  timezone?: string            // IANA tz для рендера локального времени (bedtime и т.п.)
}

export interface HealthContext {
  periodDays: number
  timezone: string
  coachProfile: { summary: string; facts: string[] } | null
  scores: Record<string, any> | null
  metrics: Record<string, any>[]
  sleep: Record<string, any>[]
  labs: Record<string, any>[]
  supplements: string[]
  intake: Record<string, any>[]
  supplementLogs: Record<string, any>[]
  notes: Record<string, any>[]
  calendar: Record<string, any>[]
  goals: Record<string, any>[]
  experiments: Record<string, any>[]
  environment: { date: string; temp_c: number | null; pressure_hpa: number | null; daylight_minutes: number | null; precipitation_mm: number | null }[]
}
```

Add two local time helpers right after the existing `avg`/`num` helpers:

```typescript
function localMinutes(iso: string, tz: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(new Date(iso)).map(p => [p.type, p.value]),
  )
  return parseInt(parts.hour) * 60 + parseInt(parts.minute)
}

function fmtLocalTime(iso: string, tz: string): string {
  const mins = localMinutes(iso, tz)
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
}

// Среднее время суток с учётом перехода через полночь: засыпание после
// полуночи (00:xx-05:xx) считаем «поздним», а не «ранним утром».
function avgLocalTime(isoList: string[], tz: string): string | null {
  if (!isoList.length) return null
  const mins = isoList.map(iso => {
    const v = localMinutes(iso, tz)
    return v < 12 * 60 ? v + 24 * 60 : v
  })
  let avg = mins.reduce((a, b) => a + b, 0) / mins.length
  avg = ((avg % 1440) + 1440) % 1440
  return `${String(Math.floor(avg / 60)).padStart(2, '0')}:${String(Math.round(avg % 60)).padStart(2, '0')}`
}
```

Update the `sleep_sessions` select in `buildHealthContext` (currently `date, duration_hours, deep_hours, rem_hours, core_hours`):

```typescript
    supabase.from('sleep_sessions')
      .select('date, bedtime, wake_time, duration_hours, deep_hours, rem_hours, core_hours')
      .eq('user_id', userId).gte('date', sinceStr).order('date', { ascending: false }),
```

Update the return object of `buildHealthContext` to include `timezone: opts.timezone ?? 'Europe/Berlin',` (add right after `periodDays,`).

In `healthContextToText`, replace the sleep block:

```typescript
  if (ctx.sleep.length) {
    const dh = num(ctx.sleep, 'deep_hours'), rh = num(ctx.sleep, 'rem_hours'), ch = num(ctx.sleep, 'core_hours')
    parts.push(`\nФазы сна (${ctx.periodDays} дней):`)
    if (dh.length) parts.push(`Глубокий: средн ${avg(dh)!.toFixed(1)} ч/ночь`)
    if (rh.length) parts.push(`REM: средн ${avg(rh)!.toFixed(1)} ч/ночь`)
    if (ch.length) parts.push(`Лёгкий/ядро: средн ${avg(ch)!.toFixed(1)} ч/ночь`)
    const avgBed = avgLocalTime(ctx.sleep.map((s: any) => s.bedtime).filter(Boolean), ctx.timezone)
    if (avgBed) parts.push(`Среднее время засыпания: ${avgBed}`)
    const recent = ctx.sleep.slice(0, 7).map((s: any) => {
      const times = s.bedtime && s.wake_time
        ? ` [засыпание ${fmtLocalTime(s.bedtime, ctx.timezone)}, подъём ${fmtLocalTime(s.wake_time, ctx.timezone)}]`
        : ''
      return `${s.date}: всего ${s.duration_hours?.toFixed?.(1) ?? '—'}ч (глуб ${s.deep_hours?.toFixed?.(1) ?? '—'}, REM ${s.rem_hours?.toFixed?.(1) ?? '—'})${times}`
    }).join('\n')
    parts.push(`Последние ночи:\n${recent}`)
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run supabase/functions/_shared/healthContext.test.ts`
Expected: PASS (all tests, including the pre-existing ones — check the "full coverage" test still passes now that `timezone` is required; if it fails because that test builds a `HealthContext` literal without `timezone`, add `timezone: 'Europe/Berlin',` to that literal too).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/healthContext.ts supabase/functions/_shared/healthContext.test.ts
git commit -m "feat(ai-context): render sleep bedtime/wake time in local timezone"
```

---

### Task 2: Honest week-over-week comparisons (metrics + sleep)

**Files:**
- Modify: `supabase/functions/_shared/healthContext.ts`
- Test: `supabase/functions/_shared/healthContext.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
describe('healthContextToText: weekly comparison blocks', () => {
  const day = (n: number) => `2026-07-${String(n).padStart(2, '0')}`

  it('renders last-7 and previous-7 day metric aggregates when 14+ days present', () => {
    const metrics = []
    for (let i = 1; i <= 14; i++) {
      metrics.push({ date: day(i), resting_heart_rate: 55, hrv: 45, sleep_hours: i <= 7 ? 7.0 : 7.4, steps: 9000, active_energy: 400, oxygen_saturation: 0.97 })
    }
    const text = healthContextToText({ ...emptyCtx, metrics })
    expect(text).toContain('Последние 7 дней: сон 7.4ч')
    expect(text).toContain('Предыдущие 7 дней: сон 7.0ч')
  })

  it('renders only last-7 when fewer than 14 days present', () => {
    const metrics = []
    for (let i = 1; i <= 9; i++) {
      metrics.push({ date: day(i), resting_heart_rate: 55, hrv: 45, sleep_hours: 7.2, steps: 9000, active_energy: 400, oxygen_saturation: 0.97 })
    }
    const text = healthContextToText({ ...emptyCtx, metrics })
    expect(text).toContain('Последние 7 дней: сон 7.2ч')
    expect(text).not.toContain('Предыдущие 7 дней')
  })

  it('renders last-7 and previous-7 sleep aggregates when 14+ nights present', () => {
    const sleep = []
    for (let i = 1; i <= 14; i++) {
      sleep.push({ date: day(i), duration_hours: 7.2, deep_hours: i <= 7 ? 1.3 : 1.0, rem_hours: 1.7, core_hours: 4.2, bedtime: null, wake_time: null })
    }
    // ctx.sleep идёт по убыванию даты (новые первые) — slice(0,7) должен быть 14..8, slice(7,14) — 7..1
    const text = healthContextToText({ ...emptyCtx, sleep: sleep.reverse() })
    expect(text).toContain('Последние 7 ночей: сон 7.2ч, глубокий 1.0ч')
    expect(text).toContain('Предыдущие 7 ночей: сон 7.2ч, глубокий 1.3ч')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run supabase/functions/_shared/healthContext.test.ts`
Expected: FAIL — no "Последние 7 дней"/"Предыдущие 7 дней"/"Последние 7 ночей" text yet.

- [ ] **Step 3: Implement**

In the `ctx.metrics` block of `healthContextToText` (the block starting `parts.push(\`=== ДАННЫЕ ЗА...\`)`), add after the existing `if (rows.length) { ... }` body, right before its closing brace (still inside `if (rows.length)`, after the "Последние дни" push):

```typescript
    const fmtMetricsWeek = (arr: any[]) => {
      const s = num(arr, 'sleep_hours'), r = num(arr, 'resting_heart_rate'), h = num(arr, 'hrv'), st = num(arr, 'steps')
      const bits: string[] = []
      if (s.length) bits.push(`сон ${avg(s)!.toFixed(1)}ч`)
      if (r.length) bits.push(`ЧССп ${avg(r)!.toFixed(0)}`)
      if (h.length) bits.push(`HRV ${avg(h)!.toFixed(0)}мс`)
      if (st.length) bits.push(`шаги ${Math.round(avg(st)!).toLocaleString('ru-RU')}`)
      return bits.join(', ')
    }
    if (rows.length >= 7) parts.push(`\nПоследние 7 дней: ${fmtMetricsWeek(rows.slice(-7))}`)
    if (rows.length >= 14) parts.push(`Предыдущие 7 дней: ${fmtMetricsWeek(rows.slice(-14, -7))}`)
```

In the `ctx.sleep` block (`if (ctx.sleep.length) { ... }`), add after the "Последние ночи" push (still inside the `if`):

```typescript
    const fmtSleepWeek = (arr: any[]) => {
      const dur = num(arr, 'duration_hours'), d = num(arr, 'deep_hours'), r = num(arr, 'rem_hours')
      const bits: string[] = []
      if (dur.length) bits.push(`сон ${avg(dur)!.toFixed(1)}ч`)
      if (d.length) bits.push(`глубокий ${avg(d)!.toFixed(1)}ч`)
      if (r.length) bits.push(`REM ${avg(r)!.toFixed(1)}ч`)
      return bits.join(', ')
    }
    if (ctx.sleep.length >= 7) parts.push(`Последние 7 ночей: ${fmtSleepWeek(ctx.sleep.slice(0, 7))}`)
    if (ctx.sleep.length >= 14) parts.push(`Предыдущие 7 ночей: ${fmtSleepWeek(ctx.sleep.slice(7, 14))}`)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run supabase/functions/_shared/healthContext.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/healthContext.ts supabase/functions/_shared/healthContext.test.ts
git commit -m "feat(ai-context): honest last-7 vs previous-7-day comparisons instead of model guessing"
```

- [ ] **Step 6 (audit follow-up): add per-week average bedtime to the sleep comparison blocks**

The spec (section 4) requires the weekly blocks to include «среднее время засыпания из п.3» — the original task text above omitted it, and it's literally the user's original question ("сравни время засыпания эта неделя vs прошлая"). With only the whole-period average (Task 1), the model still can't compare bedtime week-over-week honestly.

In `fmtSleepWeek` (which runs inside `healthContextToText` and therefore has access to `ctx.timezone`), add an average-bedtime bit using the `avgLocalTime` helper from Task 1:

```typescript
    const fmtSleepWeek = (arr: any[]) => {
      const dur = num(arr, 'duration_hours'), d = num(arr, 'deep_hours'), r = num(arr, 'rem_hours')
      const bits: string[] = []
      if (dur.length) bits.push(`сон ${avg(dur)!.toFixed(1)}ч`)
      if (d.length) bits.push(`глубокий ${avg(d)!.toFixed(1)}ч`)
      if (r.length) bits.push(`REM ${avg(r)!.toFixed(1)}ч`)
      const bed = avgLocalTime(arr.map((s: any) => s.bedtime).filter(Boolean), ctx.timezone)
      if (bed) bits.push(`засыпание в среднем ${bed}`)
      return bits.join(', ')
    }
```

Also add `active_energy` and `oxygen_saturation` to `fmtMetricsWeek` (the spec says the weekly blocks carry «те же метрики, что уже агрегируются за весь период», which includes активные ккал и SpO2):

```typescript
      const en = num(arr, 'active_energy'), sp = num(arr, 'oxygen_saturation')
      if (en.length) bits.push(`ккал ${Math.round(avg(en)!)}`)
      if (sp.length) bits.push(`SpO2 ${(avg(sp)! * 100).toFixed(0)}%`)
```

Test: extend the existing weekly-comparison describe block — 14 nights where the older week's bedtimes are `19:30Z` and the newer week's are `21:00Z` (Europe/Berlin summer → local 21:30 vs 23:00) must render `Последние 7 ночей: ... засыпание в среднем 23:00` and `Предыдущие 7 ночей: ... засыпание в среднем 21:30`. Commit as `fix(ai-context): weekly sleep comparison includes average bedtime per spec`.

---

### Task 3: Health concerns + hair entries

**Files:**
- Modify: `supabase/functions/_shared/healthContext.ts`
- Test: `supabase/functions/_shared/healthContext.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
describe('buildHealthContext: concerns & hair entries', () => {
  it('loads active concerns with their latest log, and recent hair entries', async () => {
    const sb = stubSupabase({
      health_concerns: [{ id: 'c1', name: 'Высыпания', category: 'skin', status: 'active' }],
      concern_logs: [
        { concern_id: 'c1', date: '2026-07-04', severity: 3, note: 'после кофе хуже' },
        { concern_id: 'c1', date: '2026-06-20', severity: 4, note: null },
      ],
      hair_entries: [{ date: '2026-06-15', shedding_level: 2, density_rating: 3, hairline_rating: 4, scalp_note: null }],
    })
    const ctx = await buildHealthContext(sb, 'user-1')
    expect(ctx.concerns).toHaveLength(1)
    expect(ctx.concerns[0].lastLog).toEqual({ date: '2026-07-04', severity: 3, note: 'после кофе хуже' })
    expect(ctx.hairEntries).toHaveLength(1)
  })
})

describe('healthContextToText: concerns & hair entries', () => {
  it('renders concerns with latest log', () => {
    const text = healthContextToText({
      ...emptyCtx,
      concerns: [{ name: 'Высыпания', category: 'skin', status: 'active', lastLog: { date: '2026-07-04', severity: 3, note: 'после кофе хуже' } }],
    })
    expect(text).toContain('Отслеживаемые симптомы')
    expect(text).toContain('Высыпания (skin, active)')
    expect(text).toContain('severity 3/5')
    expect(text).toContain('после кофе хуже')
  })

  it('renders latest hair entry', () => {
    const text = healthContextToText({
      ...emptyCtx,
      hairEntries: [{ date: '2026-06-15', shedding_level: 2, density_rating: 3, hairline_rating: 4, scalp_note: null }],
    })
    expect(text).toContain('Замеры волос (2026-06-15)')
    expect(text).toContain('выпадение 2/5')
  })

  it('omits sections when empty', () => {
    const text = healthContextToText(emptyCtx)
    expect(text).not.toContain('Отслеживаемые симптомы')
    expect(text).not.toContain('Замеры волос')
  })
})
```

Also add `concerns: [], hairEntries: [],` to `emptyCtx`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run supabase/functions/_shared/healthContext.test.ts`
Expected: FAIL — `ctx.concerns`/`ctx.hairEntries` don't exist yet.

- [ ] **Step 3: Implement**

Add to `HealthContext` interface (after `environment`):

```typescript
  concerns: { name: string; category: string; status: string; lastLog: { date: string; severity: number | null; note: string | null } | null }[]
  hairEntries: { date: string; shedding_level: number | null; density_rating: number | null; hairline_rating: number | null; scalp_note: string | null }[]
```

In `buildHealthContext`, update the destructuring line (currently `const [profRes, scoreRes, mRes, sRes, labRes, supRes, intakeRes, logRes, notesRes, calRes, goalRes, expRes, envRes] = await Promise.all([`):

```typescript
  const [profRes, scoreRes, mRes, sRes, labRes, supRes, intakeRes, logRes, notesRes, calRes, goalRes, expRes, envRes, concernRes, concernLogRes, hairRes] = await Promise.all([
```

And add three entries at the end of the `Promise.all` array (right after the existing `environment_daily` query, before the closing `])`):

```typescript
    supabase.from('health_concerns')
      .select('id, name, category, status')
      .eq('user_id', userId).in('status', ['active', 'improving']).limit(10),
    supabase.from('concern_logs')
      .select('concern_id, date, severity, note')
      .eq('user_id', userId).gte('date', sinceStr).order('date', { ascending: false }).limit(30),
    supabase.from('hair_entries')
      .select('date, shedding_level, density_rating, hairline_rating, scalp_note')
      .eq('user_id', userId).gte('date', sinceStr).order('date', { ascending: false }).limit(6),
```

Before the `return` statement, group logs by concern:

```typescript
  const concernLogsByConcern: Record<string, any> = {}
  for (const l of (concernLogRes.data ?? [])) {
    if (!concernLogsByConcern[l.concern_id]) concernLogsByConcern[l.concern_id] = l // первое вхождение = самое свежее (data ordered desc)
  }
  const concerns = (concernRes.data ?? []).map((c: any) => ({
    name: c.name, category: c.category, status: c.status,
    lastLog: concernLogsByConcern[c.id]
      ? { date: concernLogsByConcern[c.id].date, severity: concernLogsByConcern[c.id].severity, note: concernLogsByConcern[c.id].note }
      : null,
  }))
```

Add `concerns,` and `hairEntries: hairRes.data ?? [],` to the returned object.

In `healthContextToText`, add after the environment block (before `if (ctx.calendar.length)`):

```typescript
  if (ctx.concerns.length) {
    parts.push('\nОтслеживаемые симптомы:')
    for (const c of ctx.concerns) {
      const log = c.lastLog
        ? ` — последняя severity ${c.lastLog.severity ?? '—'}/5 (${c.lastLog.date}${c.lastLog.note ? `, "${c.lastLog.note}"` : ''})`
        : ' — логов пока нет'
      parts.push(`— ${c.name} (${c.category}, ${c.status})${log}`)
    }
  }

  if (ctx.hairEntries.length) {
    const h = ctx.hairEntries[0]
    parts.push(`Замеры волос (${h.date}): выпадение ${h.shedding_level ?? '—'}/5, густота ${h.density_rating ?? '—'}/5, линия роста ${h.hairline_rating ?? '—'}/5${h.scalp_note ? ` ("${h.scalp_note}")` : ''}`)
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run supabase/functions/_shared/healthContext.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/healthContext.ts supabase/functions/_shared/healthContext.test.ts
git commit -m "feat(ai-context): surface health concerns and hair entries to the AI"
```

---

### Task 4: Health alerts (страж здоровья)

**Files:**
- Modify: `supabase/functions/_shared/healthContext.ts`
- Test: `supabase/functions/_shared/healthContext.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
describe('buildHealthContext: health alerts', () => {
  it('loads anomaly alerts and drops legacy reminder-dedup rows without a level', async () => {
    const sb = stubSupabase({
      health_alerts: [
        { date: '2026-07-03', level: 'red', message: 'Резкий рост пульса покоя и падение HRV' },
        { date: null, level: null, message: null }, // легаси dedup-строка (hair_photo_reminder и т.п.)
      ],
    })
    const ctx = await buildHealthContext(sb, 'user-1')
    expect(ctx.alerts).toHaveLength(1)
    expect(ctx.alerts[0].level).toBe('red')
  })
})

describe('healthContextToText: health alerts', () => {
  it('renders red alerts with a warning mark', () => {
    const text = healthContextToText({
      ...emptyCtx,
      alerts: [{ date: '2026-07-03', level: 'red', message: 'Резкий рост пульса покоя и падение HRV' }],
    })
    expect(text).toContain('Алерты стража здоровья')
    expect(text).toContain('⚠️ 2026-07-03 Резкий рост пульса покоя и падение HRV')
  })

  it('omits section when empty', () => {
    const text = healthContextToText(emptyCtx)
    expect(text).not.toContain('Алерты стража здоровья')
  })
})
```

Also add `alerts: [],` to `emptyCtx`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run supabase/functions/_shared/healthContext.test.ts`
Expected: FAIL — `ctx.alerts` doesn't exist yet.

- [ ] **Step 3: Implement**

Add to `HealthContext` interface:

```typescript
  alerts: { date: string | null; level: 'yellow' | 'red'; message: string }[]
```

Update the destructuring line again (from Task 3's `..., concernRes, concernLogRes, hairRes] = await Promise.all([`) to add `alertRes`:

```typescript
  const [profRes, scoreRes, mRes, sRes, labRes, supRes, intakeRes, logRes, notesRes, calRes, goalRes, expRes, envRes, concernRes, concernLogRes, hairRes, alertRes] = await Promise.all([
```

Add one entry at the end of the `Promise.all` array (after the `hair_entries` query from Task 3). Note the `gte('created_at', ...)` period filter — the spec (section 6) requires alerts only for the context window; without it a months-old anomaly would render as if it were current and mislead the AI:

```typescript
    supabase.from('health_alerts')
      .select('date, level, message')
      .eq('user_id', userId).eq('type', 'anomaly')
      .gte('created_at', `${sinceStr}T00:00:00Z`)
      .order('created_at', { ascending: false }).limit(5),
```

Add a test asserting the query is period-bound is not practical with the current `stubSupabase` (it ignores filters), so instead make sure the implementation includes the `gte` — the spec reviewer will check this by reading the code.

Before `return`:

```typescript
  const alerts = (alertRes.data ?? []).filter((a: any) => a.level != null)
```

Add `alerts,` to the returned object.

In `healthContextToText`, add right after the concerns/hair block:

```typescript
  if (ctx.alerts.length) {
    parts.push('\nАлерты стража здоровья (⚠️ = red, требует внимания):')
    for (const a of ctx.alerts) {
      const mark = a.level === 'red' ? '⚠️ ' : ''
      parts.push(`— ${mark}${a.date ?? ''} ${a.message}`)
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run supabase/functions/_shared/healthContext.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/healthContext.ts supabase/functions/_shared/healthContext.test.ts
git commit -m "feat(ai-context): surface health-guard anomaly alerts to the AI"
```

---

### Task 5: Past AI recommendations

**Files:**
- Modify: `supabase/functions/_shared/healthContext.ts`
- Test: `supabase/functions/_shared/healthContext.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
describe('buildHealthContext: recommendations', () => {
  it('loads accepted/dismissed/snoozed recommendations', async () => {
    const sb = stubSupabase({
      recommendations: [{ metric: 'sleepHours', text: 'Ложиться на 30 мин раньше', status: 'dismissed', created_at: '2026-06-01T00:00:00Z' }],
    })
    const ctx = await buildHealthContext(sb, 'user-1')
    expect(ctx.recommendations).toHaveLength(1)
    expect(ctx.recommendations[0].status).toBe('dismissed')
  })
})

describe('healthContextToText: recommendations', () => {
  it('renders past recommendations with status', () => {
    const text = healthContextToText({
      ...emptyCtx,
      recommendations: [{ metric: 'sleepHours', text: 'Ложиться на 30 мин раньше', status: 'dismissed', created_at: '2026-06-01T00:00:00Z' }],
    })
    expect(text).toContain('Прошлые рекомендации ИИ')
    expect(text).toContain('[dismissed] Ложиться на 30 мин раньше (метрика sleepHours)')
  })

  it('omits section when empty', () => {
    const text = healthContextToText(emptyCtx)
    expect(text).not.toContain('Прошлые рекомендации ИИ')
  })
})
```

Also add `recommendations: [],` to `emptyCtx`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run supabase/functions/_shared/healthContext.test.ts`
Expected: FAIL — `ctx.recommendations` doesn't exist yet.

- [ ] **Step 3: Implement**

Add to `HealthContext` interface:

```typescript
  recommendations: { metric: string; text: string; status: string; created_at: string }[]
```

Update the destructuring line again (from Task 4's `..., concernRes, concernLogRes, hairRes, alertRes] = await Promise.all([`) to add `recRes`:

```typescript
  const [profRes, scoreRes, mRes, sRes, labRes, supRes, intakeRes, logRes, notesRes, calRes, goalRes, expRes, envRes, concernRes, concernLogRes, hairRes, alertRes, recRes] = await Promise.all([
```

Add one entry at the end of the `Promise.all` array (after the `health_alerts` query from Task 4):

```typescript
    supabase.from('recommendations')
      .select('metric, text, status, created_at')
      .eq('user_id', userId).in('status', ['accepted', 'dismissed', 'snoozed'])
      .order('created_at', { ascending: false }).limit(10),
```

Add `recommendations: recRes.data ?? [],` to the returned object.

In `healthContextToText`, add after the alerts block:

```typescript
  if (ctx.recommendations.length) {
    parts.push('\nПрошлые рекомендации ИИ (не повторяй отклонённые, учитывай принятые):')
    for (const r of ctx.recommendations) {
      parts.push(`— [${r.status}] ${r.text} (метрика ${r.metric})`)
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run supabase/functions/_shared/healthContext.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/healthContext.ts supabase/functions/_shared/healthContext.test.ts
git commit -m "feat(ai-context): surface past AI recommendations so the AI doesn't repeat dismissed advice"
```

---

### Task 6: Goal progress trend

**Files:**
- Modify: `supabase/functions/_shared/healthContext.ts`
- Test: `supabase/functions/_shared/healthContext.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
describe('buildHealthContext: goal progress', () => {
  it('attaches recent progress rows to each goal by id', async () => {
    const sb = stubSupabase({
      goals: [{ id: 'g1', title: 'Сон 8ч', metric: 'sleepHours', baseline_value: 6.8, target_value: 8, direction: 'up', end_date: '2026-08-01', status: 'active' }],
      goal_progress: [
        { goal_id: 'g1', date: '2026-07-04', value: 7.4, on_target: true },
        { goal_id: 'g1', date: '2026-07-05', value: 7.6, on_target: true },
      ],
    })
    const ctx = await buildHealthContext(sb, 'user-1')
    expect(ctx.goals[0].recentProgress).toHaveLength(2)
  })

  it('does not query goal_progress when there are no goals', async () => {
    const sb = stubSupabase({ goals: [] })
    const ctx = await buildHealthContext(sb, 'user-1')
    expect(ctx.goals).toHaveLength(0)
  })
})

describe('healthContextToText: goal progress', () => {
  it('renders recent progress line under the goal', () => {
    const text = healthContextToText({
      ...emptyCtx,
      goals: [{
        title: 'Сон 8ч', metric: 'sleepHours', baseline_value: 6.8, target_value: 8, direction: 'up', end_date: '2026-08-01', status: 'active',
        recentProgress: [{ date: '2026-07-04', value: 7.4, on_target: true }, { date: '2026-07-05', value: 7.6, on_target: true }],
      }],
    })
    expect(text).toContain('Последние 2 дн.: 7.4, 7.6 (на цели: 2/2 дней)')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run supabase/functions/_shared/healthContext.test.ts`
Expected: FAIL — `recentProgress` not attached yet.

- [ ] **Step 3: Implement**

Update the `goals` select in `buildHealthContext` to include `id` (currently `title, metric, baseline_value, target_value, direction, end_date, status`):

```typescript
    supabase.from('goals')
      .select('id, title, metric, baseline_value, target_value, direction, end_date, status')
      .eq('user_id', userId).in('status', ['active', 'achieved']).order('created_at', { ascending: false }).limit(10),
```

After the `Promise.all` resolves (after the destructuring line, before the `return`), add a follow-up query — this can't be in the same `Promise.all` because it depends on the goal ids just fetched:

```typescript
  const goalsRaw = goalRes.data ?? []
  const goalIds = goalsRaw.map((g: any) => g.id).filter(Boolean)
  let goalProgressData: any[] = []
  if (goalIds.length) {
    const since7 = new Date(); since7.setDate(since7.getDate() - 7)
    const { data } = await supabase.from('goal_progress')
      .select('goal_id, date, value, on_target')
      .in('goal_id', goalIds).gte('date', since7.toISOString().slice(0, 10))
      .order('date', { ascending: true })
    goalProgressData = data ?? []
  }
  const progressByGoal: Record<string, any[]> = {}
  for (const p of goalProgressData) (progressByGoal[p.goal_id] ??= []).push({ date: p.date, value: p.value, on_target: p.on_target })
  const goals = goalsRaw.map((g: any) => ({ ...g, recentProgress: progressByGoal[g.id] ?? [] }))
```

Replace `goals: goalRes.data ?? [],` in the returned object with `goals,`.

In `healthContextToText`, inside the goals loop (`for (const g of ctx.goals) { ... }`), add after the existing `parts.push(...)` line for the goal itself:

```typescript
      if (g.recentProgress?.length) {
        const onTarget = g.recentProgress.filter((p: any) => p.on_target).length
        const values = g.recentProgress.map((p: any) => typeof p.value === 'number' ? p.value.toFixed(1) : p.value).join(', ')
        parts.push(`  Последние ${g.recentProgress.length} дн.: ${values} (на цели: ${onTarget}/${g.recentProgress.length} дней)`)
      }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run supabase/functions/_shared/healthContext.test.ts`
Expected: PASS — including pre-existing "goals & experiments" tests (they don't set `id`, so `goalIds` is empty and no `goal_progress` query happens, `recentProgress` is `[]`, rendered nothing extra — verify the "renders active goal with direction and deadline" test from before Task 1 still passes unchanged).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/healthContext.ts supabase/functions/_shared/healthContext.test.ts
git commit -m "feat(ai-context): attach recent goal-progress trend instead of just static status"
```

---

### Task 7: Pass real user timezone + today's date + age/sex from `chat-health`

**Files:**
- Modify: `supabase/functions/chat-health/index.ts`

Audit additions beyond the original task: (a) the model currently has NO idea what today's date is — neither the system prompt nor the context mentions it. It can only guess from data dates, which breaks when sync lags and becomes critical in Phase C, where the model must compute `start_date`/`end_date` for tool calls ("сравни с маем" requires knowing the current date). (b) `profiles.birth_year`/`sex` exist (populated by the supplements AI feature via `supplements_profile_age.sql`) but never reach the health chat — age and sex are baseline interpretation context for any health question (resting HR norms, sleep needs).

- [ ] **Step 1: Implement**

In `chat-health/index.ts`, add the import (top of file, next to the other `_shared` imports):

```typescript
import { localNow } from '../_shared/time.ts'
```

Right before the `buildHealthContext` call (currently line ~87), fetch the user's profile:

```typescript
    const { data: profile } = await supabase.from('profiles')
      .select('timezone, birth_year, sex').eq('id', user.id).maybeSingle()
    const timezone = profile?.timezone ?? 'Europe/Berlin'

    // Контекст всегда свежий, из БД (30 дней + цели/эксперименты/профиль)
    const ctx = await buildHealthContext(supabase, user.id, { periodDays: 30, includeCoachProfile: true, timezone })
```

(Replace the existing `const ctx = await buildHealthContext(...)` line — same call, just add `timezone` to the options object and the lines fetching the profile above it.)

Then extend the first Gemini message (the one that concatenates `sys.text` + `contextText`) with today's date and, when known, age/sex. `localNow` may throw only on an invalid tz — `timezone` here is already the raw DB value, so validate the same way `buildHealthContext` now does, or simply reuse `ctx.timezone` (already validated by Task 1's `isValidTimezone` guard inside `buildHealthContext`):

```typescript
    const { date: todayStr } = localNow(ctx.timezone)
    const sexTxt = profile?.sex === 'male' ? 'мужской' : profile?.sex === 'female' ? 'женский' : null
    const ageTxt = profile?.birth_year ? `~${new Date().getFullYear() - profile.birth_year} лет` : null
    const personLine = [ageTxt && `возраст ${ageTxt}`, sexTxt && `пол ${sexTxt}`].filter(Boolean).join(', ')
    const metaLine = `\nСегодня: ${todayStr} (таймзона ${ctx.timezone}).${personLine ? ` Пользователь: ${personLine}.` : ''}`
```

And include `metaLine` in the first message right after `sys.text` (before `contextText`):

```typescript
        parts: [{ text: `${sys.text}\nОтвечай на ${replyLang} языке.${metaLine}${contextText}\n\nПользователь задаёт вопрос о своих данных здоровья.` }],
```

Why this matters beyond politeness: with today's date in the prompt, the model can also honestly notice "данные не обновлялись N дней" when the freshest metric date lags today — previously it couldn't tell.

- [ ] **Step 2: Verify**

There's no dedicated test file for `chat-health/index.ts` (Deno `serve()` handlers in this repo aren't unit-tested directly — see `_shared/*.test.ts` for the established pattern of testing pure logic instead). Confirm the file still type-checks:

Run: `npx tsc --noEmit -p supabase/functions/chat-health 2>/dev/null || true`

(This project's edge functions run on Deno, not Node's `tsc` project setup — if there's no local `tsconfig` for edge functions, skip this check and instead visually re-read the diff to confirm `profile`/`timezone` variable names don't collide with anything else in the file.)

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/chat-health/index.ts
git commit -m "feat(chat): real profile timezone, today's date and age/sex reach the AI"
```

---

## Phase B — Cheap architecture tuning

### Task 8: Enable Gemini thinking budget + deepen chat history

**Files:**
- Modify: `supabase/functions/chat-health/index.ts`

- [ ] **Step 1: Implement**

Change the constant near the top of the file:

```typescript
const MAX_HISTORY = 12 // last N messages to include verbatim
```

Change the generation config (currently `maxOutputTokens: 600` + `thinkingConfig: { thinkingBudget: 0 }`):

```typescript
          generationConfig: {
            // В Gemini 2.5 thinking-токены ВХОДЯТ в maxOutputTokens: при 600 и
            // бюджете мышления 1024 модель сожгла бы весь лимит на размышления
            // и вернула пустой ответ (finishReason=MAX_TOKENS). Краткость
            // видимого ответа держит системный промпт, не токен-лимит.
            maxOutputTokens: 2048,
            temperature: 0.5,
            thinkingConfig: { thinkingBudget: 1024 },
          },
```

**Do NOT keep `maxOutputTokens: 600`** — Gemini 2.5 counts thinking tokens toward `maxOutputTokens` (unlike OpenAI's separate reasoning-token accounting), so 600 + thinkingBudget 1024 produces empty replies with `finishReason: MAX_TOKENS`. This is a documented gotcha (googleapis/python-genai issues #782/#811).

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/chat-health/index.ts
git commit -m "feat(chat): enable Gemini thinking budget (with matching output cap) and deepen history to 12"
```

---

## Phase C — Tool-use (agentic access to precise date ranges)

### Task 9: Pure tool-calling loop (`_shared/chatToolLoop.ts`)

**Files:**
- Create: `supabase/functions/_shared/chatToolLoop.ts`
- Test: `supabase/functions/_shared/chatToolLoop.test.ts`

This is the risky, hard-to-manually-test part of the design (section 9.2) — pull the round-tripping logic out into a pure function with injected `callGemini`/`executeTool` so it can be fully unit tested without a network call.

- [ ] **Step 1: Write the failing tests**

Create `supabase/functions/_shared/chatToolLoop.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { runChatLoop, type ChatLoopMessage } from './chatToolLoop'

const baseContents: ChatLoopMessage[] = [{ role: 'user', parts: [{ text: 'привет' }] }]

describe('runChatLoop', () => {
  it('returns the reply immediately when there is no function call', async () => {
    const callGemini = vi.fn().mockResolvedValue({ parts: [{ text: 'Твой сон в норме.' }], tokensUsed: 120 })
    const executeTool = vi.fn()
    const result = await runChatLoop(baseContents, callGemini, executeTool)
    expect(result.reply).toBe('Твой сон в норме.')
    expect(result.totalTokens).toBe(120)
    expect(callGemini).toHaveBeenCalledTimes(1)
    expect(executeTool).not.toHaveBeenCalled()
  })

  it('executes a tool call and feeds the response back for a second round', async () => {
    const callGemini = vi.fn()
      .mockResolvedValueOnce({ parts: [{ functionCall: { name: 'get_sleep_range', args: { start_date: '2026-06-01', end_date: '2026-06-30' } } }], tokensUsed: 80 })
      .mockResolvedValueOnce({ parts: [{ text: 'В июне ты в среднем засыпал в 23:40.' }], tokensUsed: 150 })
    const executeTool = vi.fn().mockResolvedValue({ rows: [{ date: '2026-06-01', bedtime: '2026-05-31T21:40:00Z' }] })
    const result = await runChatLoop(baseContents, callGemini, executeTool)
    expect(result.reply).toBe('В июне ты в среднем засыпал в 23:40.')
    expect(result.totalTokens).toBe(230)
    expect(executeTool).toHaveBeenCalledWith('get_sleep_range', { start_date: '2026-06-01', end_date: '2026-06-30' })
    expect(callGemini).toHaveBeenCalledTimes(2)
    // второй вызов должен получить историю с functionResponse: v1beta REST API
    // требует role 'user' для functionResponse-хода (role 'function' не принимается)
    const secondCallContents = callGemini.mock.calls[1][0]
    const fnResponseMsg = secondCallContents.find((m: ChatLoopMessage) =>
      m.parts.some((p: any) => p.functionResponse))
    expect(fnResponseMsg?.role).toBe('user')
  })

  it('caps at 2 extra rounds and forces a final call without tools', async () => {
    const callGemini = vi.fn().mockResolvedValue({ parts: [{ functionCall: { name: 'get_metrics_range', args: {} } }], tokensUsed: 50 })
    const executeTool = vi.fn().mockResolvedValue({ rows: [] })
    const result = await runChatLoop(baseContents, callGemini, executeTool)
    // 3 вызова максимум: initial + 2 доп. раунда; последний — withTools=false
    expect(callGemini).toHaveBeenCalledTimes(3)
    expect(callGemini.mock.calls[2][1]).toBe(false)
    expect(result.totalTokens).toBe(150)
    expect(result.reply).toBe('Не удалось получить ответ.')
  })

  it('does not throw when executeTool rejects, and passes the error back to the model', async () => {
    const callGemini = vi.fn()
      .mockResolvedValueOnce({ parts: [{ functionCall: { name: 'get_lab_history', args: { marker: 'Ферритин' } } }], tokensUsed: 60 })
      .mockResolvedValueOnce({ parts: [{ text: 'Не смог получить историю анализов.' }], tokensUsed: 90 })
    const executeTool = vi.fn().mockRejectedValue(new Error('db down'))
    const result = await runChatLoop(baseContents, callGemini, executeTool)
    expect(result.reply).toBe('Не смог получить историю анализов.')
    const secondCallContents = callGemini.mock.calls[1][0]
    const functionMsg = secondCallContents.find((m: ChatLoopMessage) =>
      m.parts.some((p: any) => p.functionResponse))
    expect(JSON.stringify(functionMsg)).toContain('db down')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run supabase/functions/_shared/chatToolLoop.test.ts`
Expected: FAIL — `./chatToolLoop` module doesn't exist yet.

- [ ] **Step 3: Implement**

Create `supabase/functions/_shared/chatToolLoop.ts`:

```typescript
// Цикл function-calling для чата (design doc, раздел 9.2). Чистая функция:
// сеть/БД приходят через инъекцию (callGemini/executeTool), поэтому тестируется
// без реального вызова Gemini или Supabase.

export interface ChatLoopMessage {
  // v1beta REST API принимает только 'user' и 'model'; functionResponse
  // передаётся ходом с role 'user' сразу после model-хода с functionCall.
  role: 'user' | 'model'
  parts: any[]
}

export interface GeminiCallResult {
  parts: any[]
  tokensUsed: number
}

export type CallGemini = (contents: ChatLoopMessage[], withTools: boolean) => Promise<GeminiCallResult>
export type ExecuteTool = (name: string, args: Record<string, any>) => Promise<unknown>

export interface ChatLoopResult {
  reply: string
  totalTokens: number
}

const MAX_TOOL_ROUNDS = 2 // доп. раунды сверх начального вызова; последний раунд всегда без tools

export async function runChatLoop(
  initialContents: ChatLoopMessage[],
  callGemini: CallGemini,
  executeTool: ExecuteTool,
): Promise<ChatLoopResult> {
  let contents = initialContents
  let totalTokens = 0

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const withTools = round < MAX_TOOL_ROUNDS
    const res = await callGemini(contents, withTools)
    totalTokens += res.tokensUsed

    const functionCalls = res.parts.filter((p: any) => p.functionCall)
    if (!functionCalls.length) {
      const text = res.parts.find((p: any) => typeof p.text === 'string')?.text ?? 'Не удалось получить ответ.'
      return { reply: text, totalTokens }
    }

    contents = [...contents, { role: 'model', parts: res.parts }]
    const functionResponses = []
    for (const fc of functionCalls) {
      const { name, args } = fc.functionCall
      let response: unknown
      try {
        response = await executeTool(name, args ?? {})
      } catch (e) {
        response = { error: e instanceof Error ? e.message : String(e) }
      }
      functionResponses.push({ functionResponse: { name, response } })
    }
    contents = [...contents, { role: 'user', parts: functionResponses }]
  }

  return { reply: 'Не удалось получить ответ.', totalTokens }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run supabase/functions/_shared/chatToolLoop.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/chatToolLoop.ts supabase/functions/_shared/chatToolLoop.test.ts
git commit -m "feat(chat): add pure Gemini function-calling loop with a 3-call cap"
```

---

### Task 10: Tool declarations + DB executor (`_shared/chatTools.ts`)

**Files:**
- Create: `supabase/functions/_shared/chatTools.ts`
- Test: `supabase/functions/_shared/chatTools.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `supabase/functions/_shared/chatTools.test.ts`. Reuse the same `stubSupabase` helper pattern as `healthContext.test.ts` (copy the function into this file — it's a small test-only stub, duplicating it keeps each test file independently readable, matching how this codebase already keeps `_shared/*.test.ts` self-contained):

```typescript
import { describe, it, expect } from 'vitest'
import { executeChatTool, CHAT_TOOL_DECLARATIONS } from './chatTools'

function stubSupabase(dataByTable: Record<string, unknown[]>) {
  return {
    from(table: string) {
      const result = { data: dataByTable[table] ?? [] }
      const chain: Record<string, unknown> = {}
      const self = new Proxy(chain, {
        get(_t, prop: string) {
          if (prop === 'then') return (resolve: (v: { data: unknown }) => void) => resolve(result)
          return () => self
        },
      })
      return self
    },
  }
}

describe('CHAT_TOOL_DECLARATIONS', () => {
  it('declares exactly the three range/history tools', () => {
    const names = CHAT_TOOL_DECLARATIONS.map((t: any) => t.name)
    expect(names).toEqual(['get_metrics_range', 'get_sleep_range', 'get_lab_history'])
  })
})

describe('executeChatTool', () => {
  it('returns metrics rows for a valid range', async () => {
    const sb = stubSupabase({ daily_metrics: [{ date: '2026-06-01', sleep_hours: 7.1 }] })
    const result: any = await executeChatTool(sb, 'user-1', 'get_metrics_range', { start_date: '2026-06-01', end_date: '2026-06-10' })
    expect(result.rows).toHaveLength(1)
  })

  it('rejects a metrics range longer than 60 days without throwing', async () => {
    const sb = stubSupabase({ daily_metrics: [] })
    const result: any = await executeChatTool(sb, 'user-1', 'get_metrics_range', { start_date: '2026-01-01', end_date: '2026-06-01' })
    expect(result.error).toBeTruthy()
  })

  it('rejects a metrics call missing dates', async () => {
    const sb = stubSupabase({ daily_metrics: [] })
    const result: any = await executeChatTool(sb, 'user-1', 'get_metrics_range', {})
    expect(result.error).toBeTruthy()
  })

  it('returns sleep rows for a valid range', async () => {
    const sb = stubSupabase({ sleep_sessions: [{ date: '2026-06-01', bedtime: '2026-05-31T21:40:00Z' }] })
    const result: any = await executeChatTool(sb, 'user-1', 'get_sleep_range', { start_date: '2026-06-01', end_date: '2026-06-10' })
    expect(result.rows).toHaveLength(1)
  })

  it('returns lab history for a marker', async () => {
    const sb = stubSupabase({ lab_results: [{ date: '2026-01-15', value: 60 }, { date: '2026-04-15', value: 88 }] })
    const result: any = await executeChatTool(sb, 'user-1', 'get_lab_history', { marker: 'Ферритин' })
    expect(result.rows).toHaveLength(2)
  })

  it('rejects a lab history call missing marker', async () => {
    const sb = stubSupabase({ lab_results: [] })
    const result: any = await executeChatTool(sb, 'user-1', 'get_lab_history', {})
    expect(result.error).toBeTruthy()
  })

  it('returns an error for an unknown tool name', async () => {
    const sb = stubSupabase({})
    const result: any = await executeChatTool(sb, 'user-1', 'delete_everything', {})
    expect(result.error).toContain('delete_everything')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run supabase/functions/_shared/chatTools.test.ts`
Expected: FAIL — `./chatTools` module doesn't exist yet.

- [ ] **Step 3: Implement**

Create `supabase/functions/_shared/chatTools.ts`:

```typescript
// Function-calling инструменты чата (design doc, раздел 9.1): модель сама
// запрашивает точные диапазоны данных сверх базового 30-дневного контекста.
// Каждый инструмент — обычный Supabase-запрос с eq('user_id', userId), те же
// RLS-гарантии, что и у остального контекста.

export const CHAT_TOOL_DECLARATIONS = [
  {
    name: 'get_metrics_range',
    description: 'Вернуть сырые ежедневные метрики (пульс покоя, HRV, сон, шаги, ккал, SpO2) за произвольный диапазон дат, максимум 60 дней за раз. Использовать для сравнений за пределами последних 30 дней или диапазонов, не совпадающих с неделей.',
    parameters: {
      type: 'OBJECT',
      properties: {
        start_date: { type: 'STRING', description: 'Начало диапазона, YYYY-MM-DD' },
        end_date: { type: 'STRING', description: 'Конец диапазона, YYYY-MM-DD' },
      },
      required: ['start_date', 'end_date'],
    },
  },
  {
    name: 'get_sleep_range',
    description: 'Вернуть сырые данные сна (включая время засыпания/пробуждения и фазы) за произвольный диапазон дат, максимум 60 дней за раз.',
    parameters: {
      type: 'OBJECT',
      properties: {
        start_date: { type: 'STRING', description: 'Начало диапазона, YYYY-MM-DD' },
        end_date: { type: 'STRING', description: 'Конец диапазона, YYYY-MM-DD' },
      },
      required: ['start_date', 'end_date'],
    },
  },
  {
    name: 'get_lab_history',
    description: 'Вернуть всю историю значений одного лабораторного маркера (не только последнее значение и дельту), максимум 50 точек.',
    parameters: {
      type: 'OBJECT',
      properties: {
        marker: { type: 'STRING', description: 'Точное название маркера, как оно упомянуто в контексте (например "Ферритин")' },
      },
      required: ['marker'],
    },
  },
]

const MAX_RANGE_DAYS = 60

function daysBetween(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000)
}

export async function executeChatTool(
  supabase: any,
  userId: string,
  name: string,
  args: Record<string, any>,
): Promise<unknown> {
  if (name === 'get_metrics_range' || name === 'get_sleep_range') {
    const { start_date, end_date } = args
    if (!start_date || !end_date) return { error: 'start_date и end_date обязательны' }
    if (daysBetween(start_date, end_date) > MAX_RANGE_DAYS) {
      return { error: `Диапазон слишком большой, максимум ${MAX_RANGE_DAYS} дней` }
    }
    const table = name === 'get_metrics_range' ? 'daily_metrics' : 'sleep_sessions'
    const cols = name === 'get_metrics_range'
      ? 'date, resting_heart_rate, hrv, sleep_hours, steps, active_energy, oxygen_saturation'
      : 'date, bedtime, wake_time, duration_hours, deep_hours, rem_hours, core_hours'
    const { data } = await supabase.from(table).select(cols)
      .eq('user_id', userId).gte('date', start_date).lte('date', end_date)
      .order('date', { ascending: true })
    return { rows: data ?? [] }
  }

  if (name === 'get_lab_history') {
    const { marker } = args
    if (!marker) return { error: 'marker обязателен' }
    const { data } = await supabase.from('lab_results')
      .select('date, value, unit, ref_range, flag')
      .eq('user_id', userId).eq('marker', marker)
      .order('date', { ascending: true }).limit(50)
    return { rows: data ?? [] }
  }

  return { error: `Неизвестный инструмент: ${name}` }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run supabase/functions/_shared/chatTools.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/chatTools.ts supabase/functions/_shared/chatTools.test.ts
git commit -m "feat(chat): add function-calling tool declarations and DB executor for on-demand date ranges"
```

---

### Task 11: Port the lag-correlations engine to `_shared/correlations.ts`

**Files:**
- Create: `supabase/functions/_shared/correlations.ts`
- Test: `supabase/functions/_shared/correlations.test.ts`

The app already has a deterministic Pearson lag-correlation engine at
[src/lib/correlations.ts](../../../src/lib/correlations.ts) (F3 smart-tonus) —
used today only by the `CorrelationsBlock.tsx` widget and the standalone
`deep-research` function, never by chat. It's pure math (no browser/Deno
APIs), so it can be ported as-is into `_shared`, following the same
duplication pattern this codebase already uses for `scores.ts` (computed
server-side and client-side, edited in both places).

- [ ] **Step 1: Write the failing tests**

Create `supabase/functions/_shared/correlations.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { computeLagCorrelations, type CorrDailyRow, type CorrelationsResult } from './correlations'

const dayStr = (i: number) => new Date(Date.UTC(2026, 4, 1 + i)).toISOString().slice(0, 10)

function found(res: CorrelationsResult) {
  if ('needMoreDays' in res) throw new Error('ожидались корреляции, получен эмпти-стейт')
  return res.correlations
}

describe('computeLagCorrelations (ported to _shared)', () => {
  it('returns an honest empty state when there is not enough paired data', () => {
    const daily: CorrDailyRow[] = Array.from({ length: 5 }, (_, i) => ({ date: dayStr(i), sleepHours: 7, steps: 9000 }))
    const res = computeLagCorrelations({ daily, scores: [], intake: [] })
    expect('needMoreDays' in res && res.needMoreDays).toBeGreaterThan(0)
  })

  it('finds a strong next-day correlation: coffee → HRV drops tomorrow', () => {
    const n = 30
    const coffee = (i: number) => (i % 2 === 0 ? 4 : 0)
    const daily: CorrDailyRow[] = Array.from({ length: n }, (_, i) => ({
      date: dayStr(i),
      hrv: i > 0 && coffee(i - 1) > 2 ? 35 + (i % 3) : 55 + (i % 3),
      sleepHours: 7.5,
    }))
    const intake = daily.flatMap((d, i) => coffee(i) > 0 ? [{ ts: `${d.date}T08:00:00Z`, type: 'coffee' }] : [])
    const res = computeLagCorrelations({ daily, scores: [], intake })
    const corrs = found(res)
    const coffeeHrv = corrs.find(c => c.factor === 'coffee' && c.outcome === 'hrv' && c.lag === 1)
    expect(coffeeHrv).toBeTruthy()
    expect(coffeeHrv!.direction).toBe('down')
  })

  it('finds a same-day correlation: later bedtime → shorter sleep', () => {
    const n = 30
    const daily: CorrDailyRow[] = Array.from({ length: n }, (_, i) => {
      const late = i % 2 === 0
      return {
        date: dayStr(i),
        sleepBedtime: late ? `${dayStr(i)}T23:40:00Z` : `${dayStr(i)}T21:30:00Z`,
        sleepHours: late ? 6.2 + (i % 3) * 0.1 : 7.8 + (i % 3) * 0.1,
      }
    })
    const res = computeLagCorrelations({ daily, scores: [], intake: [] })
    const corrs = found(res)
    const bedtimeSleep = corrs.find(c => c.factor === 'bedtime' && c.outcome === 'sleepHours' && c.lag === 0)
    expect(bedtimeSleep).toBeTruthy()
    expect(bedtimeSleep!.direction).toBe('down') // позже лечь → меньше спать
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run supabase/functions/_shared/correlations.test.ts`
Expected: FAIL — `./correlations` module doesn't exist yet.

- [ ] **Step 3: Implement**

Create `supabase/functions/_shared/correlations.ts` — this is the same
algorithm as `src/lib/correlations.ts`, with the frontend-only `DailyMetrics`
import replaced by a local, smaller `CorrDailyRow` type (only the fields this
engine actually reads):

```typescript
// Лаг-корреляции (F3, smart-tonus) — порт src/lib/correlations.ts для
// использования из чата (design doc, раздел 9.1, get_correlations).
// Детерминированная статистика без AI: Пирсон между фактором дня X и исходом
// дня X+lag (lag 0 — тот же день, 1 — следующий). Минимум 14 парных дней,
// показываем только |r| ≥ 0.3, топ-5. «Сильная» связь = |r| ≥ 0.5 и n ≥ 21.
// Лаг 2 не считаем сознательно: больше сравнений — больше ложных связей.

export type CorrFactor =
  | 'coffee' | 'alcohol' | 'exerciseMinutes' | 'steps' | 'bedtime'
  | 'pressure' | 'pressureDelta' | 'temp' | 'daylight'
export type CorrOutcome = 'sleepHours' | 'hrv' | 'restingHeartRate' | 'readiness'

export interface CorrDailyRow {
  date: string
  hrv?: number
  restingHeartRate?: number
  sleepHours?: number
  sleepBedtime?: string // ISO
  steps?: number
  exerciseMinutes?: number
}

export interface EnvDay {
  date: string
  temp_c: number | null
  pressure_hpa: number | null
  daylight_minutes: number | null
  precipitation_mm: number | null
}

export interface Correlation {
  factor: CorrFactor
  outcome: CorrOutcome
  lag: 0 | 1
  r: number
  n: number
  strength: 'strong' | 'notable'
  direction: 'up' | 'down'
}

export interface CorrelationsInput {
  daily: CorrDailyRow[]
  scores: { date: string; readiness: number | null }[]
  intake: { ts: string; type: string }[]
  environment?: EnvDay[]
}

export type CorrelationsResult =
  | { correlations: Correlation[] }
  | { needMoreDays: number }

const MIN_PAIRS = 14
const STRONG_R = 0.5
const STRONG_N = 21
const SHOW_R = 0.3
const TOP = 5

function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let cov = 0, vx = 0, vy = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my
    cov += dx * dy; vx += dx * dx; vy += dy * dy
  }
  if (vx === 0 || vy === 0) return null
  return cov / Math.sqrt(vx * vy)
}

function bedtimeMinutes(iso: string | undefined): number | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  let h = d.getUTCHours() + d.getUTCMinutes() / 60
  if (h < 12) h += 24
  return Math.round((h - 22) * 60)
}

export function computeLagCorrelations(input: CorrelationsInput): CorrelationsResult {
  const sorted = [...input.daily].sort((a, b) => a.date.localeCompare(b.date))
  const dates = sorted.map(d => d.date)
  const index = new Map(dates.map((d, i) => [d, i]))

  const countByDay = (type: string): Map<string, number> => {
    const m = new Map<string, number>()
    for (const e of input.intake) {
      if (e.type !== type) continue
      const day = e.ts.slice(0, 10)
      m.set(day, (m.get(day) ?? 0) + 1)
    }
    return m
  }
  const coffee = countByDay('coffee')
  const alcohol = countByDay('alcohol')
  const readinessByDay = new Map(input.scores.map(s => [s.date, s.readiness]))
  const envByDay = new Map((input.environment ?? []).map(e => [e.date, e]))
  const prevDate = (d: string): string => {
    const dt = new Date(d + 'T00:00:00Z')
    dt.setUTCDate(dt.getUTCDate() - 1)
    return dt.toISOString().slice(0, 10)
  }

  const factorValue = (f: CorrFactor, i: number): number | null => {
    const d = sorted[i]
    switch (f) {
      case 'coffee': return coffee.get(d.date) ?? 0
      case 'alcohol': return alcohol.get(d.date) ?? 0
      case 'exerciseMinutes': return d.exerciseMinutes ?? null
      case 'steps': return d.steps ?? null
      case 'bedtime': return bedtimeMinutes(d.sleepBedtime)
      case 'pressure': return envByDay.get(d.date)?.pressure_hpa ?? null
      case 'pressureDelta': {
        const cur = envByDay.get(d.date)?.pressure_hpa
        const prev = envByDay.get(prevDate(d.date))?.pressure_hpa
        return cur != null && prev != null ? cur - prev : null
      }
      case 'temp': return envByDay.get(d.date)?.temp_c ?? null
      case 'daylight': return envByDay.get(d.date)?.daylight_minutes ?? null
    }
  }
  const outcomeValue = (o: CorrOutcome, i: number): number | null => {
    const d = sorted[i]
    switch (o) {
      case 'sleepHours': return d.sleepHours ?? null
      case 'hrv': return d.hrv ?? null
      case 'restingHeartRate': return d.restingHeartRate ?? null
      case 'readiness': return readinessByDay.get(d.date) ?? null
    }
  }

  const factors: CorrFactor[] = [
    'coffee', 'alcohol', 'exerciseMinutes', 'steps', 'bedtime',
    'pressure', 'pressureDelta', 'temp', 'daylight',
  ]
  const outcomes: CorrOutcome[] = ['sleepHours', 'hrv', 'restingHeartRate', 'readiness']
  const lags: (0 | 1)[] = [0, 1]

  const out: Correlation[] = []
  let maxPairs = 0

  for (const factor of factors) {
    for (const outcome of outcomes) {
      for (const lag of lags) {
        const xs: number[] = [], ys: number[] = []
        for (let i = 0; i < sorted.length; i++) {
          const j = lag === 0 ? i : index.get(dates[i]) != null ? i + 1 : -1
          if (j < 0 || j >= sorted.length) continue
          if (lag === 1) {
            const next = new Date(dates[i] + 'T00:00:00Z')
            next.setUTCDate(next.getUTCDate() + 1)
            if (dates[j] !== next.toISOString().slice(0, 10)) continue
          }
          const x = factorValue(factor, i)
          const y = outcomeValue(outcome, j)
          if (x == null || y == null) continue
          xs.push(x); ys.push(y)
        }
        maxPairs = Math.max(maxPairs, xs.length)
        if (xs.length < MIN_PAIRS) continue
        const r = pearson(xs, ys)
        if (r == null || Math.abs(r) < SHOW_R) continue
        out.push({
          factor, outcome, lag,
          r, n: xs.length,
          strength: Math.abs(r) >= STRONG_R && xs.length >= STRONG_N ? 'strong' : 'notable',
          direction: r > 0 ? 'up' : 'down',
        })
      }
    }
  }

  if (!out.length && maxPairs < MIN_PAIRS) return { needMoreDays: MIN_PAIRS - maxPairs }
  out.sort((a, b) => Math.abs(b.r) - Math.abs(a.r))
  return { correlations: out.slice(0, TOP) }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run supabase/functions/_shared/correlations.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/correlations.ts supabase/functions/_shared/correlations.test.ts
git commit -m "feat(chat): port lag-correlations engine to _shared for server-side use"
```

---

### Task 12: Add `get_correlations` as a 4th chat tool

**Files:**
- Modify: `supabase/functions/_shared/chatTools.ts`
- Test: `supabase/functions/_shared/chatTools.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `chatTools.test.ts`:

```typescript
describe('executeChatTool: get_correlations', () => {
  const day = (i: number) => new Date(Date.UTC(2026, 4, 1 + i)).toISOString().slice(0, 10)

  it('returns correlations when there is enough data', async () => {
    const n = 30
    const coffee = (i: number) => (i % 2 === 0 ? 4 : 0)
    const metrics = Array.from({ length: n }, (_, i) => ({
      date: day(i),
      hrv: i > 0 && coffee(i - 1) > 2 ? 35 : 55,
      resting_heart_rate: 55,
      sleep_hours: 7.5,
      steps: 9000,
    }))
    const intake = Array.from({ length: n }, (_, i) => coffee(i) > 0 ? { ts: `${day(i)}T08:00:00Z`, type: 'coffee' } : null).filter(Boolean)
    const sb = stubSupabase({
      daily_metrics: metrics,
      sleep_sessions: [],
      metrics_daily: [],
      daily_scores: [],
      intake_events: intake as any[],
      environment_daily: [],
    })
    const result: any = await executeChatTool(sb, 'user-1', 'get_correlations', {})
    expect(result.correlations).toBeTruthy()
    expect(result.correlations.some((c: any) => c.factor === 'coffee' && c.outcome === 'hrv')).toBe(true)
  })

  it('filters by outcome when provided', async () => {
    const n = 30
    const coffee = (i: number) => (i % 2 === 0 ? 4 : 0)
    const metrics = Array.from({ length: n }, (_, i) => ({
      date: day(i),
      hrv: i > 0 && coffee(i - 1) > 2 ? 35 : 55,
      resting_heart_rate: i > 0 && coffee(i - 1) > 2 ? 65 : 55,
      sleep_hours: 7.5,
      steps: 9000,
    }))
    const intake = Array.from({ length: n }, (_, i) => coffee(i) > 0 ? { ts: `${day(i)}T08:00:00Z`, type: 'coffee' } : null).filter(Boolean)
    const sb = stubSupabase({
      daily_metrics: metrics, sleep_sessions: [], metrics_daily: [], daily_scores: [],
      intake_events: intake as any[], environment_daily: [],
    })
    const result: any = await executeChatTool(sb, 'user-1', 'get_correlations', { outcome: 'hrv' })
    // сначала убеждаемся, что фильтр не просто выдал пустой массив (что тривиально
    // прошло бы .every() на []), а реально нашёл и оставил hrv-корреляцию
    expect(result.correlations.length).toBeGreaterThan(0)
    expect(result.correlations.every((c: any) => c.outcome === 'hrv')).toBe(true)
  })

  it('returns a plain error, not a throw, when there is too little data', async () => {
    const sb = stubSupabase({
      daily_metrics: [{ date: '2026-05-01', hrv: 50, resting_heart_rate: 55, sleep_hours: 7, steps: 9000 }],
      sleep_sessions: [], metrics_daily: [], daily_scores: [], intake_events: [], environment_daily: [],
    })
    const result: any = await executeChatTool(sb, 'user-1', 'get_correlations', {})
    expect(result.error).toBeTruthy()
  })
})
```

Also replace the existing `CHAT_TOOL_DECLARATIONS` test from Task 10 (currently `it('declares exactly the three range/history tools', ...)` asserting a 3-name array) with the 4-name version — this is an edit to that same `describe` block, not a new one:

```typescript
describe('CHAT_TOOL_DECLARATIONS', () => {
  it('declares exactly the four range/history/correlation tools', () => {
    const names = CHAT_TOOL_DECLARATIONS.map((t: any) => t.name)
    expect(names).toEqual(['get_metrics_range', 'get_sleep_range', 'get_lab_history', 'get_correlations'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run supabase/functions/_shared/chatTools.test.ts`
Expected: FAIL — `get_correlations` not declared/handled yet.

- [ ] **Step 3: Implement**

Add the import at the top of `chatTools.ts`:

```typescript
import { computeLagCorrelations, type CorrDailyRow } from './correlations.ts'
```

Add a fourth entry to `CHAT_TOOL_DECLARATIONS`:

```typescript
  {
    name: 'get_correlations',
    description: 'Вернуть реальные статистически посчитанные лаг-корреляции между образом жизни (кофе, алкоголь, физактивность, шаги, время засыпания, погода) и метриками (сон, HRV, пульс покоя, готовность) за последние 30 дней. Использовать для любого вопроса «с чем связано» / «почему изменилось» вместо предположений.',
    parameters: {
      type: 'OBJECT',
      properties: {
        outcome: { type: 'STRING', enum: ['sleepHours', 'hrv', 'restingHeartRate', 'readiness'], description: 'Опционально — ограничить результат корреляциями только с этим исходом' },
      },
      required: [],
    },
  },
```

Add the handler branch in `executeChatTool`, before the final `return { error: ... }` fallback:

```typescript
  if (name === 'get_correlations') {
    const since = new Date(); since.setDate(since.getDate() - 30)
    const sinceStr = since.toISOString().slice(0, 10)
    const [mRes, sRes, exRes, scoreRes, intakeRes, envRes] = await Promise.all([
      supabase.from('daily_metrics').select('date, resting_heart_rate, hrv, sleep_hours, steps').eq('user_id', userId).gte('date', sinceStr),
      supabase.from('sleep_sessions').select('date, bedtime').eq('user_id', userId).gte('date', sinceStr),
      supabase.from('metrics_daily').select('date, sum_val').eq('user_id', userId).eq('metric', 'exerciseMinutes').gte('date', sinceStr),
      supabase.from('daily_scores').select('date, readiness').eq('user_id', userId).gte('date', sinceStr),
      supabase.from('intake_events').select('ts, type').eq('user_id', userId).gte('ts', `${sinceStr}T00:00:00Z`).in('type', ['coffee', 'alcohol']),
      supabase.from('environment_daily').select('date, temp_c, pressure_hpa, daylight_minutes, precipitation_mm').eq('user_id', userId).gte('date', sinceStr),
    ])

    const bedtimeByDate: Record<string, string> = {}
    for (const s of (sRes.data ?? [])) if (s.bedtime) bedtimeByDate[s.date] = s.bedtime
    const exerciseByDate: Record<string, number> = {}
    for (const e of (exRes.data ?? [])) exerciseByDate[e.date] = e.sum_val

    const daily: CorrDailyRow[] = (mRes.data ?? []).map((m: any) => ({
      date: m.date,
      sleepHours: m.sleep_hours ?? undefined,
      hrv: m.hrv ?? undefined,
      restingHeartRate: m.resting_heart_rate ?? undefined,
      steps: m.steps ?? undefined,
      exerciseMinutes: exerciseByDate[m.date],
      sleepBedtime: bedtimeByDate[m.date],
    }))

    const result = computeLagCorrelations({
      daily,
      scores: (scoreRes.data ?? []).map((s: any) => ({ date: s.date, readiness: s.readiness })),
      intake: (intakeRes.data ?? []).map((i: any) => ({ ts: i.ts, type: i.type })),
      environment: envRes.data ?? [],
    })

    if ('needMoreDays' in result) {
      return { error: `Недостаточно данных для корреляций, нужно ещё примерно ${result.needMoreDays} дней с обеими метриками` }
    }
    const outcome = args.outcome as string | undefined
    const correlations = outcome ? result.correlations.filter(c => c.outcome === outcome) : result.correlations
    return { correlations }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run supabase/functions/_shared/chatTools.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/chatTools.ts supabase/functions/_shared/chatTools.test.ts
git commit -m "feat(chat): add get_correlations tool so 'why did this change' answers use real statistics"
```

---

### Task 13: Update system prompt to use tools instead of refusing

**Files:**
- Modify: `supabase/functions/chat-health/index.ts`

Declaring the four tools (Tasks 10, 12) doesn't guarantee the model reaches
for them at the right moment — Gemini decides based on the tool `description`
fields plus the surrounding prompt. Without an explicit nudge, it may still
answer "нет данных" (or, worse, guess) for a question a tool could actually
resolve. This task adds that nudge to `SYSTEM_PROMPT`.

- [ ] **Step 1: Implement**

Replace the `SYSTEM_PROMPT` constant (currently ending in `- Опирайся на личные тренды пользователя, а не на абсолютные нормы.`) with:

```typescript
const SYSTEM_PROMPT = `Ты — персональный ассистент по здоровью.
Твоя роль: помогать пользователю понять его данные здоровья простым языком.
Строгие правила:
- Никаких медицинских диагнозов. Только наблюдения на основе данных.
- Если в данных есть тревожные значения — мягко рекомендуй обратиться к врачу.
- Не выдумывай данные, которых нет в контексте.
- Отвечай кратко и конкретно (2-4 предложения, если не просят подробнее).
- Опирайся на личные тренды пользователя, а не на абсолютные нормы.
- Если вопрос требует данных за пределами контекста (период старше ~30 дней,
  диапазон, не совпадающий с «последние/предыдущие 7 дней», или полная
  история одного анализа) — используй инструменты get_metrics_range/
  get_sleep_range/get_lab_history вместо отказа или предположений.
- Если пользователь спрашивает «с чем связано» / «почему изменилось» —
  используй get_correlations вместо предположений. Это реально посчитанная
  статистика (Пирсон), не гипотеза; если корреляций не нашлось, так и скажи,
  не придумывай объяснение взамен.
- Если инструмент вернул ошибку или пустой результат — сообщи об этом прямо,
  не выдумывай значения взамен.`
```

- [ ] **Step 2: Check for a live DB override**

`getPrompt(supabase, 'chat-health-system', SYSTEM_PROMPT)` (already in the
file) uses the code constant only as a fallback — if there's an active row in
`ai_prompts` for `name = 'chat-health-system'`, that row wins in production
and this code change has no effect until the DB row is updated too. Check
before considering this task done:

Run (via the Supabase SQL editor or CLI, project ref from `deploying-tonus` skill):
```sql
select id, version, active from ai_prompts where name = 'chat-health-system' and active = true;
```

If a row comes back, either update its `prompt` column to the new text above,
or insert a new higher-`version` active row (check how other prompt updates
in this repo's history handled `ai_prompts` — same pattern applies here). If
no row comes back, the fallback change alone is enough.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/chat-health/index.ts
git commit -m "feat(chat): nudge system prompt to use function-calling tools instead of refusing"
```

---

### Task 14: Wire the tool loop into `chat-health/index.ts`

**Files:**
- Modify: `supabase/functions/chat-health/index.ts`

- [ ] **Step 1: Implement**

Add imports at the top of the file:

```typescript
import { runChatLoop, type ChatLoopMessage } from '../_shared/chatToolLoop.ts'
import { CHAT_TOOL_DECLARATIONS, executeChatTool } from '../_shared/chatTools.ts'
```

Replace the single Gemini `fetch` block (from `const geminiRes = await fetch(...)` through `const tokensUsed = geminiData.usageMetadata?.totalTokenCount ?? null`) with a `callGemini` helper defined once near the top-level of the file (after `SYSTEM_PROMPT`, before `serve(...)`):

```typescript
async function callGemini(contents: ChatLoopMessage[], withTools: boolean): Promise<{ parts: any[]; tokensUsed: number }> {
  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      // thinking-токены входят в maxOutputTokens (Gemini 2.5), поэтому лимит
      // должен вмещать бюджет мышления + видимый ответ; краткость ответа
      // обеспечивает системный промпт, не токен-лимит
      maxOutputTokens: 2048,
      temperature: 0.5,
      thinkingConfig: { thinkingBudget: 1024 },
    },
  }
  if (withTools) body.tools = [{ functionDeclarations: CHAT_TOOL_DECLARATIONS }]

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  )
  if (!res.ok) throw new Error(`Gemini error: ${await res.text()}`)
  const data = await res.json()
  return {
    parts: data.candidates?.[0]?.content?.parts ?? [],
    tokensUsed: data.usageMetadata?.totalTokenCount ?? 0,
  }
}
```

Inside the `serve` handler, replace the block that builds `geminiContents` and calls `fetch` directly. The existing code builds `geminiContents` as an array literal — keep that construction (it already matches `ChatLoopMessage[]`), then replace everything from `const geminiRes = await fetch(...)` down to `const tokensUsed = ...` with:

```typescript
    const executeTool = (name: string, args: Record<string, any>) => executeChatTool(supabase, user.id, name, args)
    const { reply, totalTokens: tokensUsed } = await runChatLoop(geminiContents, callGemini, executeTool)
```

Everything after that (saving the assistant reply, `ai_usage` insert, session update, response) stays the same — it already reads `reply` and `tokensUsed`, which now come from `runChatLoop` instead of a single Gemini call.

- [ ] **Step 2: Sanity-check the diff**

Re-read the full file after editing and confirm:
- `reply` and `tokensUsed` are each assigned exactly once (no leftover duplicate `const` from the old code).
- The `geminiContents` array is still built before `runChatLoop` is called and still includes system context + history + new message, unchanged from before.
- No dangling references to the removed `geminiRes`/`geminiData` variables anywhere below (e.g. in the error-handling `catch` block — there shouldn't be any, but check).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/chat-health/index.ts
git commit -m "feat(chat): wire function-calling loop into chat-health, replacing the single static Gemini call"
```

---

### Task 15: Manual end-to-end verification

This phase cannot be fully verified by unit tests — it depends on real Gemini API behavior (whether the model actually emits `functionCall` parts as expected, and whether the multi-round format this codebase's raw-fetch approach expects matches what the live API returns). Do this manually before considering Phase C done.

- [ ] **Step 1: Deploy to a test/staging path or use the Supabase local stack**

Follow the `deploying-tonus` skill for edge function deploy mechanics (`npx supabase functions deploy chat-health --project-ref <ref>` — check whether `chat-health` needs `--no-verify-jwt` the way `ingest-health` does; it currently doesn't, based on `index.ts` doing its own `auth.getUser()` check, so deploy without that flag unless the skill says otherwise).

**Also redeploy `telegram-bot`** — it imports `_shared/healthContext.ts` too (each function bundles `_shared` at deploy time, so the bot keeps serving the old, narrower context until redeployed; same precedent as `_shared/football.ts` requiring all three football functions to be redeployed together). `chat-health` and `telegram-bot` are the only two importers (verified by grep).

- [ ] **Step 2: Trigger a question that requires a range beyond the static 30-day context**

In the app's chat (or via a direct authenticated request to the function), ask something like: "Сравни мой средний пульс покоя в мае и в июне" (a comparison outside the last 30 days). Confirm:
- The response contains real numbers (not a refusal, not an obviously invented pair of numbers).
- Check `chat_messages`/`ai_usage` rows in the DB for that turn — `tokens_used` should reflect a sum noticeably higher than a single-call baseline if a tool was actually invoked (compare against a control question that doesn't need a tool).

- [ ] **Step 3: Trigger the sleep-onset-time question from the original bug report**

Ask "Во сколько я в среднем засыпал на этой неделе и на прошлой?" and confirm the reply now cites actual times (from the Task 1+2 work) instead of "нет данных".

- [ ] **Step 4: Trigger the "why" question from the original bug report**

Ask "Как думаешь, с чем связано?" after a question about a metric trend (the exact follow-up from the original conversation). Confirm the reply now cites an actual factor/lag/direction from `get_correlations` (or honestly says no correlation was found) instead of a plausible-sounding guess. On an account with less than ~14 days of paired data, confirm it says so instead of guessing anyway.

- [ ] **Step 5: Note results**

If the live function-calling round-trip format doesn't match what Task 9/14 assumed (Gemini's REST API function-calling shape can differ subtly by API version), fix `callGemini`/the `contents` shape in `chat-health/index.ts` based on the actual error, re-run steps 2-4, and commit the fix separately with a message describing what the real API expected.

---

## Self-review notes (from plan authoring)

- **Spec coverage:** all 10 items from the design doc (sections 3-10) map 1:1 to Tasks 1-10 + 14; Task 11/12 (correlations port + 4th tool) and Task 13 (system prompt nudge) were added after the first plan review, in response to further questions about what else could improve chat quality — they extend spec section 9 (an update to the spec doc was committed alongside) rather than being outside it; section 11 of the spec (heart_rate_samples exclusion) required no task, just documentation (already in the spec); section 13 (phasing) is reflected in the Phase A/B/C split of this plan.
- **Type consistency check:** `HealthContext.concerns[].lastLog`, `HealthContext.alerts[].level`, `HealthContext.recommendations[].status`, and `goals[].recentProgress` are named consistently between the `buildHealthContext` implementation tasks (3-6) and the render-side tasks — verified field names match exactly (`lastLog`, not `last_log`; `recentProgress`, not `recent_progress`) since these are JS/TS camelCase context fields, whereas the underlying DB columns stay snake_case (`shedding_level` etc., matched as-is since those are just passed through, not renamed). `CorrDailyRow` (Task 11) and the `chatTools.ts` mapping (Task 12) were double-checked to use the same field names (`sleepHours`, `sleepBedtime`, `exerciseMinutes`) as the original `src/lib/correlations.ts`/`DailyMetrics`, since a silent rename would break the ported algorithm's factor/outcome lookups.
- **No placeholders:** every step has full code, no "add error handling" or "similar to Task N" shortcuts — Task 14 explicitly repeats the necessary code rather than saying "like Task 9".
