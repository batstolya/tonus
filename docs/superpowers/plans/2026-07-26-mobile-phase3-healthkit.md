# Mobile Phase 3 — HealthKit Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The phone reads Apple Health and delivers it to the existing `ingest-health` edge function in HAE's own payload dialect, so Tonus stops depending on the Health Auto Export app.

**Architecture:** No server change at all. The phone emits the same JSON shape HAE emits, stamped with `source: "Tonus iOS"`, and the existing 297-line parser, its per-source dedup and the anomaly detection handle it unchanged. The conversion from HealthKit samples to that JSON is a pure module in `packages/shared` under vitest; the diff tooling that proves the phone agrees with HAE is a pure module in `supabase/functions/_shared` plus a runner script.

**Tech Stack:** `@kingstinct/react-native-healthkit` v14 (Nitro), `react-native-nitro-modules`, Expo config plugin, vitest, Node 24 type-stripping for the ops script.

**Spec:** `docs/superpowers/specs/2026-07-25-mobile-phase3-healthkit-design.md` (approved 2026-07-26)

**Depends on:** Phase 2b auth (#148) — sync needs a signed-in user, since the ingest token is fetched under that user's RLS.

---

## Environment

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
```

Deno is needed for `npm run check:functions`:

```bash
export PATH="$HOME/.deno/bin:$PATH"
```

## Ship this as four PRs

| PR | Content | Verifiable by |
| --- | --- | --- |
| **C1** | Extract the HAE parser into `_shared`, add the diff module and runner script | vitest + `deno check`, no device |
| **3a** | Permissions + read + debug screen; sends nothing | the phone |
| **3b** | Payload builder in `packages/shared` | vitest, no device |
| **3c** | Delivery + background delivery; HAE keeps running | the phone, then the diff script |

C1 and 3b need no hardware, so they can land while the device work waits.

## What the library actually offers

Read from `@kingstinct/react-native-healthkit@14.0.2`'s type definitions on
2026-07-26, not from memory:

| Need | API |
| --- | --- |
| Ask for permissions | `requestAuthorization(toRequest)`, or the `useHealthkitAuthorization({ toRead })` hook |
| Per-day sums, split by source | `queryStatisticsCollectionForQuantitySeparateBySource(identifier, statistics, anchorDate, intervalComponents, options)` |
| Per-day averages | `queryStatisticsCollectionForQuantity(...)` — same shape, merged sources |
| Raw samples | `queryQuantitySamples(identifier, options)` |
| Sleep | `queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', options)` |
| Background | `enableBackgroundDelivery(typeIdentifier, updateFrequency)`, `subscribeToChanges(identifier, cb)` |
| Availability | `isHealthDataAvailable()` |

`queryStatisticsCollectionForQuantitySeparateBySource` is the one that matters:
the server dedups sums by taking the **maximum across sources**, so the phone
must report per-source figures rather than one merged number, or an iPhone +
Watch day gets flattened before the server ever sees it.

**The library ships an Expo config plugin** (`app.plugin.js`, confirmed in the
package). It sets the `com.apple.developer.healthkit` entitlement, turns on
`healthkit.background-delivery` unless `background: false`, and writes the
Info.plist usage strings. So `app.json` gains a plugin entry — no manual
entitlement editing.

## Metric mapping (the contract both sides must agree on)

`ingest-health`'s `METRIC_MAP` is the source of truth for names. HealthKit
identifiers on the left, the HAE name the phone must emit on the right:

| HealthKit identifier | HAE `name` | Kind |
| --- | --- | --- |
| `HKQuantityTypeIdentifierStepCount` | `step_count` | sum |
| `HKQuantityTypeIdentifierDistanceWalkingRunning` | `distance_walking_running` | sum, **km** |
| `HKQuantityTypeIdentifierActiveEnergyBurned` | `active_energy` | sum, **kcal** |
| `HKQuantityTypeIdentifierAppleExerciseTime` | `apple_exercise_time` | sum, minutes |
| `HKQuantityTypeIdentifierFlightsClimbed` | `flights_climbed` | sum |
| `HKQuantityTypeIdentifierHeartRate` | `heart_rate` | avg/min/max |
| `HKQuantityTypeIdentifierRestingHeartRate` | `resting_heart_rate` | avg |
| `HKQuantityTypeIdentifierWalkingHeartRateAverage` | `walking_heart_rate_average` | avg |
| `HKQuantityTypeIdentifierHeartRateVariabilitySDNN` | `heart_rate_variability` | avg |
| `HKQuantityTypeIdentifierOxygenSaturation` | `blood_oxygen_saturation` | avg, **fraction** |
| `HKQuantityTypeIdentifierRespiratoryRate` | `respiratory_rate` | avg |
| `HKQuantityTypeIdentifierAppleSleepingWristTemperature` | `apple_sleeping_wrist_temperature` | avg |
| `HKQuantityTypeIdentifierVO2Max` | `vo2_max` | avg |
| `HKCategoryTypeIdentifierSleepAnalysis` | `sleep_analysis` | sessions |

Units matter: the server divides distance by 1000 when it exceeds 100 (metres
heuristic), converts active energy from kJ only when `units` says so, and
normalises saturation above 1.5 by dividing by 100. Emit km, kcal and a
fraction, and set `units` truthfully so those heuristics stay no-ops.

---

# PR C1 — parser extraction and diff tooling (no device)

### Task 1: Extract the HAE parser into `_shared`

The parser currently lives inside `supabase/functions/ingest-health/index.ts`
and cannot be reused by anything. The diff script needs exactly it — the same
code, or the comparison proves nothing.

**Files:**
- Create: `supabase/functions/_shared/hae.ts`
- Modify: `supabase/functions/ingest-health/index.ts`
- Test: `supabase/functions/_shared/hae.test.ts`

- [ ] **Step 1: Move the code verbatim**

Cut from `index.ts` into `_shared/hae.ts`, changing nothing but adding
`export` in front of each: `METRIC_MAP`, `SUM_METRICS`, `dayOf`, `num`, the
`HaePoint` / `HaeMetric` / `HaePayload` / `MetricRow` / `SleepRow` interfaces,
and `parseHAE`.

Header comment:

```ts
// Разбор payload'а Health Auto Export → строки staging. ЕДИНСТВЕННАЯ реализация:
// её импортируют и edge-функция ingest-health, и скрипт сверки источников
// (scripts/diff-ingest-sources.ts). Мобильное приложение эмитит ЭТОТ ЖЕ формат,
// поэтому его данные проходят тот же парсер и тот же дедуп.
```

- [ ] **Step 2: Import it back in the function**

In `index.ts`, replace the removed block with:

```ts
import { parseHAE, type HaePayload } from '../_shared/hae.ts'
```

Nothing else in `index.ts` changes — `parseHAE(userId, payload)` keeps its
signature.

- [ ] **Step 3: Write the characterisation test**

`supabase/functions/_shared/hae.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseHAE } from './hae.ts'

const USER = '00000000-0000-0000-0000-000000000001'

describe('parseHAE', () => {
  it('sums a metric within a source and takes the max across sources', () => {
    const { metrics } = parseHAE(USER, {
      data: {
        metrics: [{
          name: 'step_count',
          units: 'count',
          data: [
            { date: '2026-07-20 00:00:00 +0000', source: 'iPhone', qty: 4000 },
            { date: '2026-07-20 00:00:00 +0000', source: 'iPhone', qty: 1000 },
            { date: '2026-07-20 00:00:00 +0000', source: 'Watch', qty: 4800 },
          ],
        }],
      },
    })
    const steps = metrics.find(m => m.metric === 'steps')
    // iPhone 4000+1000 = 5000, Watch 4800 → max 5000, not the 9800 sum.
    expect(steps?.sum_val).toBe(5000)
  })

  it('averages a metric across all points of a day', () => {
    const { metrics } = parseHAE(USER, {
      data: {
        metrics: [{
          name: 'heart_rate_variability',
          units: 'ms',
          data: [
            { date: '2026-07-20 03:00:00 +0000', Avg: 40, Min: 30, Max: 50 },
            { date: '2026-07-20 04:00:00 +0000', Avg: 60, Min: 55, Max: 70 },
          ],
        }],
      },
    })
    const hrv = metrics.find(m => m.metric === 'hrv')
    expect(hrv?.avg_val).toBe(50)
    expect(hrv?.min_val).toBe(30)
    expect(hrv?.max_val).toBe(70)
  })

  it('normalises saturation given as a percentage', () => {
    const { metrics } = parseHAE(USER, {
      data: { metrics: [{ name: 'blood_oxygen_saturation', units: '%', data: [{ date: '2026-07-20 00:00:00 +0000', Avg: 97 }] }] },
    })
    expect(metrics.find(m => m.metric === 'oxygenSaturation')?.avg_val).toBeCloseTo(0.97)
  })

  it('reads sleep phases into one row per day', () => {
    const { sleep } = parseHAE(USER, {
      data: {
        metrics: [{
          name: 'sleep_analysis',
          data: [{
            date: '2026-07-20 00:00:00 +0000',
            totalSleep: 7.5, deep: 1.2, rem: 1.8, core: 4.5,
            sleepStart: '2026-07-19 23:10:00 +0000',
            sleepEnd: '2026-07-20 06:40:00 +0000',
          }],
        }],
      },
    })
    expect(sleep).toHaveLength(1)
    expect(sleep[0].duration_hours).toBeCloseTo(7.5)
    expect(sleep[0].deep_hours).toBeCloseTo(1.2)
  })

  it('ignores metrics the server does not map', () => {
    const { metrics } = parseHAE(USER, {
      data: { metrics: [{ name: 'handwashing', data: [{ date: '2026-07-20 00:00:00 +0000', qty: 3 }] }] },
    })
    expect(metrics).toEqual([])
  })
})
```

- [ ] **Step 4: Run the tests and the deno check**

```bash
npx vitest run supabase/functions/_shared/hae.test.ts
npm run check:functions
```

Expected: tests pass, `deno check clean: N files, 0 errors`. If the test
reveals behaviour you did not expect, the test is right and your expectation
was wrong — this is characterisation, the production behaviour is the spec.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/hae.ts supabase/functions/_shared/hae.test.ts supabase/functions/ingest-health/index.ts
git commit -m "refactor(functions): extract the HAE parser into _shared with tests"
```

**No redeploy needed:** the extraction is behaviour-preserving, so the running
`ingest-health` stays correct. Deploy it whenever the next behavioural change
to that function ships.

### Task 2: The diff module

Given the archived payloads of two senders for the same day, say where they
disagree. Pure, no I/O.

**Files:**
- Create: `supabase/functions/_shared/ingestDiff.ts`
- Test: `supabase/functions/_shared/ingestDiff.test.ts`

- [ ] **Step 1: Write the failing test**

`supabase/functions/_shared/ingestDiff.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { diffParsedMetrics } from './ingestDiff.ts'

const row = (date: string, metric: string, over: Record<string, number> = {}) => ({
  user_id: 'u', date, metric, ...over,
})

describe('diffParsedMetrics', () => {
  it('reports nothing when both sides agree within tolerance', () => {
    const a = [row('2026-07-20', 'steps', { sum_val: 5000 })]
    const b = [row('2026-07-20', 'steps', { sum_val: 5001 })]
    expect(diffParsedMetrics(a, b, { relativeTolerance: 0.01 })).toEqual([])
  })

  it('reports a value gap beyond tolerance', () => {
    const a = [row('2026-07-20', 'steps', { sum_val: 5000 })]
    const b = [row('2026-07-20', 'steps', { sum_val: 9000 })]
    const [d] = diffParsedMetrics(a, b, { relativeTolerance: 0.01 })
    expect(d).toMatchObject({ date: '2026-07-20', metric: 'steps', kind: 'value', left: 5000, right: 9000 })
  })

  it('reports a metric present on one side only', () => {
    const a = [row('2026-07-20', 'hrv', { avg_val: 44 })]
    const [d] = diffParsedMetrics(a, [], { relativeTolerance: 0.01 })
    expect(d).toMatchObject({ metric: 'hrv', kind: 'missing-right' })
  })

  it('treats a zero on one side as a real gap, not a rounding difference', () => {
    const a = [row('2026-07-20', 'steps', { sum_val: 0 })]
    const b = [row('2026-07-20', 'steps', { sum_val: 4000 })]
    expect(diffParsedMetrics(a, b, { relativeTolerance: 0.5 })).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run supabase/functions/_shared/ingestDiff.test.ts`
Expected: FAIL — the module does not exist.

- [ ] **Step 3: Implement**

`supabase/functions/_shared/ingestDiff.ts`:

```ts
// Сверка двух источников автосинка (мобильное приложение vs Health Auto Export).
// Оба payload'а лежат в ingest_raw, разбираются ОДНИМ парсером (_shared/hae.ts),
// и различаются только тем, кто их прислал. Нужно, потому что shadow-режим для
// параллельного прогона не годится: ingest_tokens.user_id — первичный ключ, то
// есть один токен и один режим на юзера (см. спеку фазы 3).
import type { MetricRow } from './hae.ts'

export type DiffKind = 'value' | 'missing-left' | 'missing-right'

export interface MetricDiff {
  date: string
  metric: string
  kind: DiffKind
  left: number | null
  right: number | null
}

export interface DiffOptions {
  /** Доля, в пределах которой расхождение считается округлением (0.01 = 1%). */
  relativeTolerance: number
}

// У строки заполнено ровно одно из полей: sum_val для сумм, avg_val для средних.
function valueOf(row: MetricRow): number | null {
  return row.sum_val ?? row.avg_val ?? null
}

const keyOf = (row: MetricRow) => `${row.date}|${row.metric}`

export function diffParsedMetrics(
  left: MetricRow[],
  right: MetricRow[],
  { relativeTolerance }: DiffOptions,
): MetricDiff[] {
  const byKey = new Map<string, { left?: MetricRow; right?: MetricRow }>()
  for (const row of left) (byKey.get(keyOf(row)) ?? byKey.set(keyOf(row), {}).get(keyOf(row))!).left = row
  for (const row of right) (byKey.get(keyOf(row)) ?? byKey.set(keyOf(row), {}).get(keyOf(row))!).right = row

  const out: MetricDiff[] = []
  for (const [key, pair] of [...byKey.entries()].sort()) {
    const [date, metric] = key.split('|')
    const l = pair.left ? valueOf(pair.left) : null
    const r = pair.right ? valueOf(pair.right) : null

    if (!pair.right) { out.push({ date, metric, kind: 'missing-right', left: l, right: null }); continue }
    if (!pair.left) { out.push({ date, metric, kind: 'missing-left', left: null, right: r }); continue }
    if (l == null || r == null) continue

    // Ноль на одной стороне — это не округление, а пропущенные данные, поэтому
    // относительный допуск к нему неприменим.
    const bothNonZero = l !== 0 && r !== 0
    const within = bothNonZero && Math.abs(l - r) / Math.max(Math.abs(l), Math.abs(r)) <= relativeTolerance
    if (!within && l !== r) out.push({ date, metric, kind: 'value', left: l, right: r })
  }
  return out
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run supabase/functions/_shared/ingestDiff.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/ingestDiff.ts supabase/functions/_shared/ingestDiff.test.ts
git commit -m "feat(functions): add the ingest source diff module"
```

### Task 3: The runner script

**Files:**
- Create: `scripts/diff-ingest-sources.ts`

- [ ] **Step 1: Write the runner**

TypeScript, not `.mjs`, so it can import the `_shared` modules directly —
Node 24 strips types natively and the Deno-style `.ts` import extensions are
what Node's ESM resolver wants anyway.

```ts
// Сверка мобильного синка с Health Auto Export по архиву ingest_raw.
//
// Оба отправителя пишут в ingest_raw под одним токеном (shadow-режим для этого
// не годится: ingest_tokens.user_id — первичный ключ). Скрипт разбирает их
// payload'ы одним парсером и печатает расхождения по дням и метрикам.
//
// Использование:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/diff-ingest-sources.ts --user <uuid> --since 2026-08-01
//
// Ключ сервис-роли не хранится в репозитории (см. claude-monitor/.env локально).
import { createClient } from '@supabase/supabase-js'
import { parseHAE, type HaePayload } from '../supabase/functions/_shared/hae.ts'
import { diffParsedMetrics } from '../supabase/functions/_shared/ingestDiff.ts'

const MOBILE_SOURCE = 'Tonus iOS'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const user = arg('user')
const since = arg('since') ?? new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)

if (!url || !key || !user) {
  console.error('need SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and --user <uuid>')
  process.exit(1)
}

const supabase = createClient(url, key)
const { data, error } = await supabase
  .from('ingest_raw')
  .select('payload, created_at')
  .eq('user_id', user)
  .gte('created_at', `${since}T00:00:00Z`)
  .order('created_at')

if (error) { console.error(error.message); process.exit(1) }

// Разделяем архив по отправителю: у мобильных точек source = 'Tonus iOS'.
const isMobile = (payload: HaePayload) =>
  (payload?.data?.metrics ?? payload?.metrics ?? [])
    .some(m => (m.data ?? []).some(p => p.source === MOBILE_SOURCE))

const mobile = [], hae = []
for (const row of data ?? []) {
  const payload = row.payload as HaePayload
  ;(isMobile(payload) ? mobile : hae).push(...parseHAE(user, payload).metrics)
}

console.log(`ingest_raw since ${since}: ${mobile.length} mobile rows, ${hae.length} HAE rows`)

const diffs = diffParsedMetrics(mobile, hae, { relativeTolerance: 0.02 })
if (diffs.length === 0) {
  console.log('no differences beyond 2% — the phone agrees with HAE')
  process.exit(0)
}

for (const d of diffs) {
  const detail = d.kind === 'value'
    ? `mobile ${d.left} vs HAE ${d.right}`
    : d.kind === 'missing-right' ? 'HAE has no value' : 'mobile has no value'
  console.log(`${d.date}  ${d.metric.padEnd(24)} ${detail}`)
}
console.log(`\n${diffs.length} difference(s). A clean week here is what turns HAE off.`)
process.exit(diffs.length > 0 ? 1 : 0)
```

- [ ] **Step 2: Check it at least runs and explains itself**

Run: `node scripts/diff-ingest-sources.ts`
Expected: exits 1 with the usage message (no env vars set). This proves Node's
type stripping accepts the file and the `_shared` imports resolve.

- [ ] **Step 3: Lint and commit**

```bash
npm run lint
git add scripts/diff-ingest-sources.ts
git commit -m "feat(scripts): diff the mobile ingest against Health Auto Export"
```

- [ ] **Step 4: Full gate and PR**

```bash
npm test && npm run lint && npm run check:functions
```

---

# PR 3a — read and show (needs the phone)

### Task 4: Add the library and its config plugin

**Files:**
- Modify: `apps/mobile/package.json`, `apps/mobile/app.json`

- [ ] **Step 1: Install**

```bash
cd apps/mobile && npx expo install @kingstinct/react-native-healthkit
```

`react-native-nitro-modules` is already a dependency (MMKV needs it), so this
should not add a second native runtime.

- [ ] **Step 2: Register the config plugin**

In `apps/mobile/app.json`, inside `expo`, add:

```json
    "plugins": [
      [
        "@kingstinct/react-native-healthkit",
        {
          "NSHealthShareUsageDescription": "Tonus читает показатели Здоровья, чтобы считать готовность, восстановление и сон.",
          "background": true
        }
      ]
    ]
```

The plugin sets the `com.apple.developer.healthkit` entitlement and the
background-delivery entitlement. Do not hand-edit entitlements — they are
regenerated by every prebuild.

- [ ] **Step 3: Prebuild and confirm the entitlement landed**

```bash
npx expo prebuild --platform ios --clean
grep -A2 healthkit ios/Tonus/Tonus.entitlements
```

Expected: `com.apple.developer.healthkit` present.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/package.json apps/mobile/app.json package-lock.json
git commit -m "feat(mobile): add the HealthKit library and its config plugin"
```

### Task 5: Permissions and a read-only debug screen

**Files:**
- Create: `apps/mobile/src/health/identifiers.ts`, `apps/mobile/src/health/read.ts`, `apps/mobile/src/screens/HealthDebugScreen.tsx`
- Modify: `apps/mobile/App.tsx`

- [ ] **Step 1: The identifier table**

`apps/mobile/src/health/identifiers.ts` — the left column of the mapping table
above, as data:

```ts
// HealthKit → имя метрики в payload'е HAE. Имена справа обязаны совпадать с
// METRIC_MAP в supabase/functions/ingest-health/index.ts, иначе сервер молча
// проигнорирует метрику.
export const SUM_QUANTITIES = [
  { hk: 'HKQuantityTypeIdentifierStepCount', hae: 'step_count', unit: 'count' },
  { hk: 'HKQuantityTypeIdentifierDistanceWalkingRunning', hae: 'distance_walking_running', unit: 'km' },
  { hk: 'HKQuantityTypeIdentifierActiveEnergyBurned', hae: 'active_energy', unit: 'kcal' },
  { hk: 'HKQuantityTypeIdentifierAppleExerciseTime', hae: 'apple_exercise_time', unit: 'min' },
  { hk: 'HKQuantityTypeIdentifierFlightsClimbed', hae: 'flights_climbed', unit: 'count' },
] as const

export const AVG_QUANTITIES = [
  { hk: 'HKQuantityTypeIdentifierHeartRate', hae: 'heart_rate', unit: 'count/min' },
  { hk: 'HKQuantityTypeIdentifierRestingHeartRate', hae: 'resting_heart_rate', unit: 'count/min' },
  { hk: 'HKQuantityTypeIdentifierWalkingHeartRateAverage', hae: 'walking_heart_rate_average', unit: 'count/min' },
  { hk: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN', hae: 'heart_rate_variability', unit: 'ms' },
  { hk: 'HKQuantityTypeIdentifierOxygenSaturation', hae: 'blood_oxygen_saturation', unit: '%' },
  { hk: 'HKQuantityTypeIdentifierRespiratoryRate', hae: 'respiratory_rate', unit: 'count/min' },
  { hk: 'HKQuantityTypeIdentifierAppleSleepingWristTemperature', hae: 'apple_sleeping_wrist_temperature', unit: 'degC' },
  { hk: 'HKQuantityTypeIdentifierVO2Max', hae: 'vo2_max', unit: 'ml/(kg*min)' },
] as const

export const SLEEP_CATEGORY = 'HKCategoryTypeIdentifierSleepAnalysis' as const

export const READ_PERMISSIONS = [
  ...SUM_QUANTITIES.map(q => q.hk),
  ...AVG_QUANTITIES.map(q => q.hk),
  SLEEP_CATEGORY,
] as const
```

- [ ] **Step 2: The read layer**

`apps/mobile/src/health/read.ts` uses
`queryStatisticsCollectionForQuantitySeparateBySource` for the sum metrics —
per-source figures, because the server takes the maximum across sources — and
`queryStatisticsCollectionForQuantity` for the averages. Write it against the
signatures in the table above and let `tsc` correct the details; the exact
option object shapes are typed by the library, so typecheck is the authority
here, not this document.

- [ ] **Step 3: The debug screen**

A `ScrollView` listing, per day for the last 7 days, every metric read and its
value, plus the sleep session. **It must not send anything** — this milestone
exists to prove the phone can read what HAE reads.

- [ ] **Step 4: Verify on the phone**

Build to the device (Xcode, free provisioning), grant permissions, and compare
the screen against the Health app for the same days. Discrepancies here are
mapping bugs and must be fixed before anything is sent.

- [ ] **Step 5: Commit**

# PR 3b — the payload builder (no device)

### Task 6: HealthKit readings → HAE JSON

**Files:**
- Create: `packages/shared/src/haePayload.ts`
- Test: `packages/shared/src/haePayload.test.ts`

Client-only logic, so it is born in `packages/shared` (the shared-code
boundary rule). Pure: readings in, JSON out, no HealthKit imports — the RN
layer passes plain arrays, which is what makes this testable without a phone.

- [ ] **Step 1: Write the failing tests** — one per rule the server relies on:
  per-source sums stay separate, distance is emitted in km, energy in kcal,
  saturation as a fraction, `source` is `'Tonus iOS'` on every point, dates are
  `YYYY-MM-DD HH:mm:ss +0000`, and sleep phases map to
  `totalSleep`/`deep`/`rem`/`core`.
- [ ] **Step 2: Run them, watch them fail.**
- [ ] **Step 3: Implement `buildHaePayload(readings): HaePayload`.**
- [ ] **Step 4: Round-trip test** — feed the output through `parseHAE` from
  Task 1 and assert the resulting rows. This is the real proof: the phone's
  JSON survives the server's own parser with the values intended.
- [ ] **Step 5: Commit.**

# PR 3c — delivery (needs the phone)

### Task 7: Send on open

- [ ] Fetch the ingest token: `select token from ingest_tokens where user_id = auth.uid()` (RLS allows the owner). Reuse the create-if-missing logic from `apps/web/src/lib/autosync.ts` — move it to `packages/shared` as part of this task rather than copying it.
- [ ] POST the payload to `${SUPABASE_URL}/functions/v1/ingest-health?token=…` on app foreground, covering the last 7 days so a missed day self-heals.
- [ ] Show the last sync time and outcome on the debug screen.

### Task 8: Background delivery

- [ ] `enableBackgroundDelivery` for the mapped types, `subscribeToChanges` to trigger a sync. Best-effort by design: iOS throttles it, and the on-open catch-up is what guarantees correctness.

### Task 9: Prove it against HAE

- [ ] Let both senders run for a week.
- [ ] `node scripts/diff-ingest-sources.ts --user <uuid> --since <date>` — a clean week is what earns turning HAE off.
- [ ] Only then disable HAE, in one deliberate step.

---

## Self-review notes

- Spec coverage: HAE dialect and zero server change (Task 1, 6), per-source dedup (Tasks 5, 6), the library decision and its plugin (Task 4), three milestones (3a/3b/3c), `ingest_raw` diffing as the approved parallel-run mechanism (Tasks 2, 3, 9), HAE off after a clean week (Task 9).
- The device-free work (C1, 3b) is deliberately first so it can land while the hardware work waits.
- Task 5 Step 2 intentionally does not spell out the query option objects: they are typed by the library, and inventing their shape here from a type signature would be the kind of plan detail that ages badly. Typecheck is the authority.
