# Mobile Phase 4 — Today Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One screen that answers "how am I today?" from data already in Supabase — readiness, its supporting scores, a 14-day trend, last night's sleep, today's activity — closing mobile v1.

**Architecture:** Data loading is a pure-ish module in `packages/shared` that takes the Supabase client as an argument, so it is testable with a fake client and no device. Scores come from the existing `_shared/scores` implementation through a facade; nothing is recomputed. The chart is a hand-rolled `react-native-svg` polyline.

**Tech Stack:** Expo SDK 57, `react-native-svg`, supabase-js, vitest.

**Spec:** `docs/superpowers/specs/2026-07-27-mobile-phase4-today-design.md`

---

## Environment

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
```

The simulator, Xcode and CocoaPods are already set up on this machine.

## The window trap, read before writing any query

`computeDailyScores` (in `supabase/functions/_shared/scores.ts`) **skips any day
with fewer than 5 prior days** and builds baselines from up to **30 prior
days**. So a 14-day fetch yields at most 9 days of scores, and those 9 have
baselines computed from a fraction of the history the web uses — the numbers
would be quietly *different* from the web's, not merely fewer.

**Fetch 45 days, display the last 14.** This is the single most important line
in this plan: getting it wrong produces a screen that looks right and disagrees
with the web.

## File Structure

| File | Responsibility |
| --- | --- |
| `packages/shared/src/scores.ts` | Create. Facade re-exporting `computeDailyScores` and its types from `_shared`, so clients never reach across the tree themselves. |
| `packages/shared/src/todayData.ts` | Create. `loadTodayData(client, userId, now)` → everything the screen renders. |
| `packages/shared/src/todayData.test.ts` | Create. Fake client; window maths, missing days, staleness, activity goal. |
| `apps/mobile/src/screens/TodayScreen.tsx` | Create. The screen. |
| `apps/mobile/src/components/Sparkline.tsx` | Create. `react-native-svg` polyline. |
| `apps/mobile/src/useTodayData.ts` | Create. Load, refresh-on-foreground, pull-to-refresh state. |
| `apps/mobile/App.tsx` | Modify. Today becomes the signed-in home; `tonus://today` deep link. |
| `apps/mobile/package.json` | Modify. `react-native-svg`. |

---

### Task 1: The scores facade in shared

**Files:**
- Create: `packages/shared/src/scores.ts`
- Modify: `packages/shared/src/index.ts`, `packages/shared/tsconfig.json`

- [ ] **Step 1: Allow `.ts` imports in the shared package**

`_shared` modules are Deno-flavoured and import each other with explicit `.ts`
extensions. Add to `packages/shared/tsconfig.json` under `compilerOptions`:

```json
    "allowImportingTsExtensions": true,
```

`noEmit` is already true there, which is what this flag requires.

- [ ] **Step 2: Write the facade**

`packages/shared/src/scores.ts`:

```ts
// Фасад над supabase/functions/_shared/scores.ts — ЕДИНСТВЕННОЙ реализацией
// формул (её же считает ingest-health). Клиенты импортируют отсюда и никогда
// не лезут в supabase/ напрямую: правило границы общего кода из
// docs/superpowers/specs/2026-07-18-mobile-monorepo-design.md.
export { computeDailyScores, avg } from '../../../supabase/functions/_shared/scores.ts'
export type { DailyScore, ScoreInput } from '../../../supabase/functions/_shared/scores.ts'
```

Export both from `packages/shared/src/index.ts`.

- [ ] **Step 3: Prove the facade is transparent**

Run: `npm run -w @tonus/shared test`
Expected: the existing suite still passes. Then add one assertion to
`shared.test.ts` that `computeDailyScores([])` returns `[]`, so the import path
itself is covered by a test rather than only by the typechecker.

- [ ] **Step 4: Commit**

```bash
git add packages/shared apps/web
git commit -m "feat(shared): expose the score formulas through a facade"
```

### Task 2: `loadTodayData` — the query and the window

**Files:**
- Create: `packages/shared/src/todayData.ts`
- Test: `packages/shared/src/todayData.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { loadTodayData, DISPLAY_DAYS, FETCH_DAYS } from './todayData'

// Поддельный клиент: цепочка supabase-js возвращает сама себя, пока не дойдёт
// до await. Так модуль проверяется без сети, без устройства и без аккаунта.
function fakeClient(rows: Record<string, unknown[]>) {
  const calls: string[] = []
  const chain = (table: string) => {
    const self: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'gte', 'lte', 'order', 'limit']) {
      self[m] = () => self
    }
    self.then = (resolve: (v: unknown) => void) => resolve({ data: rows[table] ?? [], error: null })
    self.maybeSingle = () => Promise.resolve({ data: (rows[table] ?? [])[0] ?? null, error: null })
    return self
  }
  return {
    calls,
    from: (table: string) => { calls.push(table); return chain(table) },
  }
}

const day = (offset: number) => {
  const d = new Date('2026-07-27T09:00:00Z')
  d.setDate(d.getDate() - offset)
  return d.toISOString().slice(0, 10)
}

describe('loadTodayData', () => {
  it('fetches enough history for the baselines, not just the visible window', () => {
    // computeDailyScores отбрасывает дни, у которых меньше 5 предшествующих, и
    // строит базовую линию по 30. Запросить 14 дней значит показать девять и
    // посчитать их по обрезанной истории — цифры разойдутся с вебом.
    expect(FETCH_DAYS).toBeGreaterThanOrEqual(DISPLAY_DAYS + 30)
  })

  it('returns at most DISPLAY_DAYS points in the trend, newest last', async () => {
    const metrics = Array.from({ length: FETCH_DAYS }, (_, i) => ({
      date: day(FETCH_DAYS - 1 - i), hrv: 40 + (i % 7), resting_heart_rate: 55, sleep_hours: 7, steps: 8000,
    }))
    const data = await loadTodayData(fakeClient({ metrics_daily: metrics }) as never, 'u', new Date('2026-07-27T09:00:00Z'))
    expect(data.trend.length).toBeLessThanOrEqual(DISPLAY_DAYS)
    expect(data.trend.at(-1)?.date).toBe(day(0))
  })

  it('reports no data rather than zeroes when the account is empty', async () => {
    const data = await loadTodayData(fakeClient({}) as never, 'u', new Date())
    expect(data.hasData).toBe(false)
    expect(data.today).toBeNull()
  })

  it('counts staleness from the freshest of import and auto-sync', async () => {
    const data = await loadTodayData(
      fakeClient({
        metrics_daily: [{ date: day(3), hrv: 40, resting_heart_rate: 55, sleep_hours: 7, steps: 100 }],
        ingest_tokens: [{ last_ingest_at: '2026-07-24T00:00:00Z' }],
        imports: [{ imported_at: '2026-07-26T00:00:00Z' }],
      }) as never,
      'u',
      new Date('2026-07-27T00:00:00Z'),
    )
    // Свежайший сигнал — импорт 26-го, значит один день, а не три.
    expect(data.staleDays).toBe(1)
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run packages/shared/src/todayData.test.ts`
Expected: FAIL, module missing.

- [ ] **Step 3: Implement**

`packages/shared/src/todayData.ts`. Shape:

```ts
export const DISPLAY_DAYS = 14
// 30 дней базовой линии + 5 минимальных + видимое окно. Меньше — и оценки
// поедут относительно веба (см. комментарий в тесте).
export const FETCH_DAYS = DISPLAY_DAYS + 35

export interface TrendPoint { date: string; readiness: number | null }

export interface TodayData {
  hasData: boolean
  today: DailyScore | null
  trend: TrendPoint[]
  sleep: { hours: number; deep: number | null; rem: number | null } | null
  activity: { steps: number | null; exerciseMinutes: number | null; goalMet: boolean }
  staleDays: number | null
}

export async function loadTodayData(
  client: SupabaseClient<Database>,
  userId: string,
  now: Date,
): Promise<TodayData>
```

It queries `metrics_daily` (the mapped metrics for the window),
`sleep_sessions` (last night), `ingest_tokens.last_ingest_at` and
`imports.imported_at` (staleness inputs), runs `computeDailyScores` over the
full window, and slices the last `DISPLAY_DAYS` for the trend. Activity goal
matches the web: **7000 steps or 30 exercise minutes**.

- [ ] **Step 4: Green, then commit**

```bash
npx vitest run packages/shared/src/todayData.test.ts
git add packages/shared/src/todayData.ts packages/shared/src/todayData.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): load everything the Today screen renders"
```

### Task 3: The sparkline

**Files:**
- Create: `apps/mobile/src/components/Sparkline.tsx`
- Modify: `apps/mobile/package.json`

- [ ] **Step 1: Add the dependency**

```bash
cd apps/mobile && npx expo install react-native-svg
```

- [ ] **Step 2: Write the component**

Props: `points: (number | null)[]`, `width`, `height`, `color`. Behaviour that
matters:

- **nulls break the line rather than reading as zero.** A day without data is
  not a day with a readiness of 0, and drawing it as one would invent a crash
  that never happened. Render separate polylines per contiguous run.
- fewer than two points → render nothing, no crash.
- flat series (all values equal) → a horizontal line, not a divide-by-zero.

- [ ] **Step 3: Commit**

### Task 4: The screen

**Files:**
- Create: `apps/mobile/src/screens/TodayScreen.tsx`, `apps/mobile/src/useTodayData.ts`

- [ ] **Step 1: The hook** — load on mount, reload on `AppState` active, expose
  `refreshing` for pull-to-refresh. Setting state inside the effect
  synchronously trips the react-hooks rule; defer as in `HealthDebugScreen`.

- [ ] **Step 2: The screen**, in the spec's order: readiness hero, the three
  secondary scores, sparkline, sleep, activity, staleness banner.

- [ ] **Step 3: The three states, with real copy** — no data / stale / load
  failure. None of them is a bare spinner: an unexplained spinner is the exact
  defect this project already shipped once.

- [ ] **Step 4: Wire into `App.tsx`** as the signed-in home, plus a
  `tonus://today` deep link so CI can screenshot it without a human.

### Task 5: Verify

- [ ] `npm test`, `npm run lint`, `npm run -w tonus-mobile typecheck` — all green.
- [ ] `npx expo run:ios` on the simulator, signed in as a real user.
- [ ] **Compare every number against tonus-nu.vercel.app for the same day.**
      This is the actual test. The web is the reference implementation; a
      disagreement means the query or the window is wrong, not that the mobile
      number needs adjusting.
- [ ] Screenshot the screen and attach it to the PR.
- [ ] Confirm the empty state renders (point the window at a range with no data).

## Self-review notes

- Spec coverage: content and order (Task 4), react-native-svg over Victory
  (Task 3), shared data access with an injected client (Task 2), the scores
  facade instead of a reimplementation (Task 1), staleness via
  `_shared/staleness.ts` (Task 2), empty/stale/offline states (Task 4 Step 3),
  foreground refresh (Task 4 Step 1), deep link for CI (Task 4 Step 4).
- The fetch window is called out twice on purpose — it is the one mistake that
  produces a plausible-looking wrong answer instead of an obvious failure.
