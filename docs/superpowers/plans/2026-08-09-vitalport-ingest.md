# VitalPort Ingest Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept VitalPort daily Apple Health snapshots through Tonus's existing authenticated `ingest-health` endpoint and convert them into the daily rows Tonus already displays.

**Architecture:** A pure `_shared/vitalport.ts` adapter recognizes the narrowly defined VitalPort envelope and converts supported fields into the existing HAE payload contract. `ingest-health/index.ts` preserves the original body in `ingest_raw`, resolves the user's IANA timezone only for VitalPort requests, then passes the adapted payload through the unchanged HAE parser, staging/live promotion, scoring, and observability flow.

**Tech Stack:** TypeScript 6, Deno Edge Functions, Vitest 3, Supabase Edge Functions/Postgres

## Global Constraints

- Work only on branch `feat/vitalport-ingest` in the isolated clone at `/Users/anatolii/Documents/Codex/2026-08-09/new-chat-2/work/tonus-vitalport-ingest`.
- Use Node 24 for npm, test, lint, and build commands.
- Repository artifacts, identifiers, comments, and commit messages must be English.
- Do not change onboarding or settings UI in this release.
- Do not add a database migration, public function, secret, dependency, or second token type.
- Store the original unmodified body in `ingest_raw`.
- Keep Health Auto Export and Tonus mobile payload behavior unchanged.
- Use `profiles.timezone` for VitalPort calendar dates; use `UTC` only when it is missing or invalid.
- Treat `sleepBreakdown.inBedSeconds` as an approximate Xiaomi fallback and never fabricate sleep stages.
- Do not deploy or write production data during implementation; the first real phone send stays in `shadow` mode.

---

### Task 1: Pure VitalPort-to-HAE adapter

**Files:**
- Create: `supabase/functions/_shared/vitalport.ts`
- Create: `supabase/functions/_shared/vitalport.test.ts`
- Create: `supabase/functions/_shared/fixtures/vitalport-xiaomi.json`

**Interfaces:**
- Consumes: unknown decoded JSON and an IANA timezone string.
- Produces: `isVitalPortPayload(value: unknown): boolean`.
- Produces: `adaptVitalPortPayload(value: unknown, timezone: string): HaePayload | null`.
- Produces HAE points with source exactly `VitalPort · Apple Health`.

- [ ] **Step 1: Add the captured Xiaomi fixture**

Create a valid full envelope using the observed fields and values. Keep the
fixture small enough to review while preserving the local-midnight timestamp,
null measurements, duration-only sleep, and a current partial day:

```json
{
  "snapshots": [
    {
      "id": "01EECDCA-105B-485B-807B-D7EB8E5FE9A8",
      "date": "2026-08-05T22:00:00Z",
      "stepCount": 7124,
      "walkingRunningDistanceMeters": 4865.2,
      "activeEnergyKcal": 200,
      "restingEnergyKcal": 1464,
      "exerciseMinutes": null,
      "restingHeartRate": null,
      "hrv": null,
      "bloodOxygenSaturationPercent": null,
      "respiratoryRate": null,
      "vo2Max": null,
      "sleepHours": 0,
      "sleepBreakdown": {
        "asleepSeconds": 0,
        "inBedSeconds": 23020.45742201805,
        "rawSampleCount": 1,
        "stages": []
      },
      "workouts": []
    },
    {
      "id": "3BB300DB-8FB4-4EA1-A5AE-61497FD76E18",
      "date": "2026-08-08T22:00:00Z",
      "stepCount": 4788,
      "walkingRunningDistanceMeters": 3371.9,
      "activeEnergyKcal": 160,
      "sleepHours": 0,
      "sleepBreakdown": {
        "asleepSeconds": 0,
        "inBedSeconds": 3653,
        "rawSampleCount": 33,
        "stages": []
      },
      "workouts": []
    }
  ],
  "units": {
    "canonicalWeight": "kg",
    "displayWeight": "kg"
  }
}
```

- [ ] **Step 2: Write failing recognition and compatibility tests**

Test that `snapshots`, `dailySnapshots`, and `days` envelopes are recognized
only when an entry contains string `id`, parseable string `date`, and at least
one known measurement key. Assert rejection of `{}`, HAE JSON, unrelated arrays,
non-object entries, invalid dates, and a single coincidental `stepCount` field.

```ts
expect(isVitalPortPayload(fixture)).toBe(true)
expect(isVitalPortPayload({ data: { metrics: [] } })).toBe(false)
expect(isVitalPortPayload({ snapshots: [{ stepCount: 10 }] })).toBe(false)
expect(adaptVitalPortPayload({ data: { metrics: [] } }, 'Europe/Berlin')).toBeNull()
```

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
npx vitest run supabase/functions/_shared/vitalport.test.ts
```

Expected: FAIL because `_shared/vitalport.ts` does not exist.

- [ ] **Step 4: Implement runtime guards and local-day formatting**

Implement unknown-safe object/array guards. Check only the three approved
top-level keys. Format the ISO instant with `Intl.DateTimeFormat('en-CA', {
timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })`, and verify the
formatter output in tests. Catch invalid IANA zones and retry with `UTC`.

The local-day helper remains private. For the fixture:

```ts
const payload = adaptVitalPortPayload(fixture, 'Europe/Berlin')!
const steps = payload.data!.metrics!.find(metric => metric.name === 'step_count')!
expect(steps.data![0].date).toBe('2026-08-06')
```

- [ ] **Step 5: Write failing metric mapping and validation tests**

Assert the exact mappings, units, source, rounding, and ranges from the design.
Include explicit cases for real zero, `null`, numeric strings, booleans,
negative numbers, infinity, and above-range values. Test oxygen end-to-end
through `parseHAE()` so `97` becomes `0.97`, and distance so `4865.2 m` becomes
`4.8652 km`.

Expected HAE names and units:

```ts
[
  ['step_count', 'count'],
  ['distance_walking_running', 'm'],
  ['active_energy', 'kcal'],
  ['apple_exercise_time', 'min'],
  ['resting_heart_rate', 'count/min'],
  ['heart_rate_variability', 'ms'],
  ['blood_oxygen_saturation', '%'],
  ['respiratory_rate', 'count/min'],
  ['vo2_max', 'mL/kg/min'],
]
```

- [ ] **Step 6: Implement the metric table and conversion**

Use a declarative mapping table whose entries define source field, HAE name,
units, inclusive minimum/maximum, and optional integer rounding. Emit one HAE
metric only when it has at least one valid point. Do not emit resting energy,
weight, body fat, workout objects, or any unknown field.

- [ ] **Step 7: Write failing sleep precedence tests**

Cover all four outcomes:

```ts
// asleepSeconds wins over every fallback
{ asleepSeconds: 25200, inBedSeconds: 28800, sleepHours: 6 }
// positive sleepHours wins when asleepSeconds is zero
{ asleepSeconds: 0, inBedSeconds: 28800, sleepHours: 6 }
// Xiaomi fallback uses inBedSeconds when both measured-sleep fields are zero
{ asleepSeconds: 0, inBedSeconds: 23020.45742201805, sleepHours: 0 }
// zero, negative, >16 h, null, or malformed candidates create no sleep point
```

Assert `deep`, `rem`, `core`, `sleepStart`, and `sleepEnd` are absent, and that
the existing parser returns approximately `6.39457` hours for the captured
fallback.

- [ ] **Step 8: Implement sleep conversion and run GREEN**

Emit one `sleep_analysis` point per valid snapshot with `totalSleep` in hours.
Do not pass stage or clock-time fields. Run:

```bash
npx vitest run supabase/functions/_shared/vitalport.test.ts supabase/functions/_shared/hae.test.ts
```

Expected: all adapter and existing HAE tests PASS.

- [ ] **Step 9: Commit the adapter**

```bash
git add supabase/functions/_shared/vitalport.ts \
  supabase/functions/_shared/vitalport.test.ts \
  supabase/functions/_shared/fixtures/vitalport-xiaomi.json
git commit -m "feat(ingest): adapt VitalPort health snapshots"
```

---

### Task 2: Wire VitalPort into the existing ingest endpoint

**Files:**
- Create: `supabase/functions/ingest-health/normalize.ts`
- Create: `supabase/functions/ingest-health/normalize.test.ts`
- Modify: `supabase/functions/ingest-health/index.ts`

**Interfaces:**
- Consumes: `adaptVitalPortPayload()` and `isVitalPortPayload()` from Task 1.
- Produces: `normalizeHealthPayload(value: unknown, timezone: string): HaePayload`.
- Handler behavior: raw storage receives the original body; parsing receives the normalized body.

- [ ] **Step 1: Write failing normalization compatibility tests**

Assert that an HAE payload is returned by object identity without modification,
while a VitalPort payload becomes HAE metrics using the supplied timezone:

```ts
const hae = { data: { metrics: [] } }
expect(normalizeHealthPayload(hae, 'Europe/Berlin')).toBe(hae)

const normalized = normalizeHealthPayload(fixture, 'Europe/Berlin')
expect(normalized.data?.metrics?.some(metric => metric.name === 'step_count')).toBe(true)
```

Also assert that an unrelated JSON object safely normalizes to the same object,
preserving today's no-rows behavior in `parseHAE()`.

- [ ] **Step 2: Run the focused test and verify RED**

```bash
npx vitest run supabase/functions/ingest-health/normalize.test.ts
```

Expected: FAIL because `normalize.ts` does not exist.

- [ ] **Step 3: Implement the minimal normalization boundary**

`normalizeHealthPayload()` calls the VitalPort adapter only after positive
recognition. If adaptation unexpectedly returns `null`, it returns an empty HAE
payload rather than casting malformed external JSON.

- [ ] **Step 4: Refactor the handler without changing security order**

In `index.ts`:

1. Keep token extraction, rate limiting, and token lookup before payload work.
2. Decode the request body as `unknown`.
3. Insert that original value into `ingest_raw` exactly as received.
4. If `isVitalPortPayload(payload)` is true, query
   `profiles.select('timezone').eq('id', userId).maybeSingle()`.
5. Normalize with the returned non-empty timezone or `UTC`.
6. Pass only the normalized value to `parseHAE()` and `parseHRSamples()`.
7. Keep staging/live writes, status text, response shape, scores, alerts, and
   failure behavior unchanged.

Do not add VitalPort to CORS authorization headers: the approved setup uses the
token in the existing query-string webhook URL and VitalPort is a native client.

- [ ] **Step 5: Run focused and complete Edge Function tests**

```bash
npx vitest run supabase/functions/ingest-health/normalize.test.ts \
  supabase/functions/_shared/vitalport.test.ts \
  supabase/functions/_shared/hae.test.ts
npm run check:functions
```

Expected: all tests PASS and Deno reports no type errors.

- [ ] **Step 6: Commit endpoint wiring**

```bash
git add supabase/functions/ingest-health/index.ts \
  supabase/functions/ingest-health/normalize.ts \
  supabase/functions/ingest-health/normalize.test.ts
git commit -m "feat(ingest): accept VitalPort webhook payloads"
```

---

### Task 3: Simulate the phone payload through Tonus's parsing boundary

**Files:**
- Create: `scripts/simulate-vitalport-ingest.ts`
- Create: `scripts/vitalport-ingest-simulation.test.ts`

**Interfaces:**
- Consumes: the captured JSON fixture, `normalizeHealthPayload()`, and `parseHAE()`.
- Produces: `simulateVitalPortIngest(payload: unknown, userId: string, timezone: string)` returning `{ metrics, sleep }` in the exact row shapes passed to Supabase.

- [ ] **Step 1: Write the failing end-to-end simulation test**

Run the captured fixture through normalization and the production HAE parser.
Assert that the first observed day becomes `2026-08-06` in Europe/Berlin and
produces exactly:

```ts
expect(metricsForFirstDay).toEqual(expect.arrayContaining([
  expect.objectContaining({ metric: 'steps', sum_val: 7124 }),
  expect.objectContaining({ metric: 'distance', sum_val: 4.8652 }),
  expect.objectContaining({ metric: 'activeEnergy', sum_val: 200 }),
]))
expect(sleepForFirstDay).toEqual(expect.objectContaining({
  date: '2026-08-06',
  duration_hours: 23020.45742201805 / 3600,
  deep_hours: null,
  rem_hours: null,
  core_hours: null,
}))
```

Assert there are no rows for `restingEnergyKcal` and no zero-valued rows for
the null recovery measurements.

- [ ] **Step 2: Run the simulation test and verify RED**

```bash
npx vitest run scripts/vitalport-ingest-simulation.test.ts
```

Expected: FAIL because the simulation helper does not exist.

- [ ] **Step 3: Implement the thin simulation helper**

The helper must contain no duplicate mapping logic:

```ts
export function simulateVitalPortIngest(payload: unknown, userId: string, timezone: string) {
  return parseHAE(userId, normalizeHealthPayload(payload, timezone))
}
```

When executed directly with the fixture, print a JSON object containing
`metrics` and `sleep`. Do not contact Supabase or any network service.

- [ ] **Step 4: Run the simulation and capture its output**

```bash
npx vitest run scripts/vitalport-ingest-simulation.test.ts
npx vite-node scripts/simulate-vitalport-ingest.ts \
  supabase/functions/_shared/fixtures/vitalport-xiaomi.json \
  Europe/Berlin
```

Expected output includes 6 August: `steps=7124`, `distance=4.8652 km`,
`activeEnergy=200 kcal`, and approximate sleep duration `6.39457 h`, with no
sleep stages.

- [ ] **Step 5: Commit the simulation harness**

```bash
git add scripts/simulate-vitalport-ingest.ts \
  scripts/vitalport-ingest-simulation.test.ts
git commit -m "test(ingest): simulate a VitalPort phone export"
```

---

### Task 4: Full verification and evening handoff

**Files:**
- Modify only if verification exposes an in-scope defect in files from Tasks 1-3.

**Interfaces:**
- Consumes all deliverables from Tasks 1-3.
- Produces a clean branch, verification evidence, and exact shadow-mode phone setup instructions.

- [ ] **Step 1: Run the complete repository verification**

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
npm test
npm run check:functions
npm run lint
npm run build
git diff --check source-local/main...HEAD
git status --short --branch
```

Expected: tests, Deno checks, lint, and build all PASS; no uncommitted files.
If a pre-existing baseline failure appears, record the exact command and output
and distinguish it from the focused VitalPort checks.

- [ ] **Step 2: Review the branch against the approved design**

Confirm manually that:

- raw storage still receives `payload`, not `normalizedPayload`;
- profile timezone is queried only for recognized VitalPort JSON;
- HAE and mobile payloads bypass conversion;
- no schema, UI, dependency, configuration, or secret changed;
- no logs contain the ingest token or health payload;
- all generated points carry `VitalPort · Apple Health`.

- [ ] **Step 3: Prepare the evening shadow-mode test**

Give the user these exact app settings only after a testable deployment exists:

```text
Destination: Custom Webhook
URL: the complete Tonus auto-sync URL, including ?token=...
Auth type: None
Timeout: 15s
Retry: On
```

Sequence: `Save destination` → `Run Export Test` → `Send Export`. Keep the
Tonus ingest mode `shadow`, inspect `ingest_raw`, `metrics_daily_staging`, and
`sleep_sessions_staging`, then decide separately whether to promote to `live`.

- [ ] **Step 4: Do not deploy without a separate explicit deployment decision**

Implementation completion means the branch is tested and ready. Production
deployment changes external state and remains a separate approved operation,
including merge-to-main and `supabase functions deploy ingest-health
--no-verify-jwt` in the repository's required order.
