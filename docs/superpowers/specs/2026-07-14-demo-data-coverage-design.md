# Demo mode: full data coverage — design

Date: 2026-07-14
Status: approved, ready for implementation

## Problem

Demo mode (`VITE_DEMO=1` or the landing "View demo" button) only replaces Apple
Health metrics: `makeDemoDaily`, heart-rate samples, experiments, the workout
schedule, environment/geomagnetic data and correlations. Everything else is read
straight from Supabase, where a demo visitor has no session, so RLS returns
nothing:

- Quick log and Nutrition (`intake_events`) — empty, caffeine curve flat
- Supplements, adherence, reminders, treatments — empty
- Labs (files, results, trends) — empty
- Concerns and hair entries — empty
- Goals and AI recommendations — empty
- Context notes, health alerts (notification bell) — empty

On top of that, every `callFunction` edge call throws `401 Не авторизован` in
demo, so the AI chat, "Suggest with AI", the deep-research report and the doctor
report all surface an error instead of an answer.

The result: a visitor evaluating the product sees a half-empty app, and we
cannot use demo mode to eyeball whole screens.

## Goal

In demo mode every screen shows plausible, self-consistent data, and every
button a visitor can press does something sensible — without a Supabase session.

## Decisions

1. **In-memory demo DB.** A small store in `lib/`, seeded from fixtures, that
   the data layer reads from when `isDemoActive()`. Writes (log a coffee, tick a
   supplement, create a goal) go into the same store, so demo screens stay
   interactive.
2. **Reset on reload.** The store lives in module memory only. F5 restores the
   pristine fixture state — predictable for a demo visitor and for our own
   screen checks. No localStorage persistence, no reset button needed.
3. **One pass.** Data fixtures and AI stubs ship together, so no screen is left
   half-populated.

## Architecture

```
demoSeed.ts   fixtures for the Supabase-backed tables (pure data)
      │
      ▼
demoDb.ts     in-memory tables + list/insert/update/remove, lazily seeded
      │
      ├── lib loaders     (goals, supplements, labs, concerns, notes, research…)
      ├── components that query Supabase directly (QuickLog, Nutrition,
      │                    TreatmentTracker, NotificationBell)
      └── edgeFunctions.ts  callFunction() → canned demo responses
```

- `demoSeed.ts` is kept separate from `demoFixture.ts`: the latter owns the
  health-metric generators and is already 190 lines.
- Interception is an explicit `if (isDemoActive())` branch at the data-access
  boundary — the same pattern the Experiments screen already uses. No fake
  Supabase client: a shim over the query-builder chain would have to reimplement
  `select/eq/gte/order/limit/insert/upsert/delete` and would drift from the real
  client.
- Dates are generated relative to today so the fixtures always line up with the
  metric fixtures (`makeDemoDaily`) and never go stale.

## Fixture data (30 days unless noted)

| Table | Content |
|---|---|
| `intake_events` | ~200 events: coffee 1–2/day, water, breakfast/lunch/dinner with macros, weekend alcohol, meds, workouts, stress, one trip |
| `supplements` + `supplement_logs` | 5 supplements (vitamin D, magnesium, omega-3, creatine, iron) with stock counts; take-logs with gaps → ~80% adherence |
| `treatments` | one active course with check-ins |
| `lab_files` + `lab_results` | 2 panels (spring, summer), 8 markers, some flagged out of range → trends |
| `health_concerns` + `concern_logs` + `hair_entries` | 2 concerns (hair shedding, headaches) with severity logs |
| `goals` + `recommendations` | 1 active goal with progress, 1 finished, 2 AI recommendations |
| `context_notes` | wellbeing notes across the period |
| `health_alerts` | 2 unacknowledged alerts for the notification bell |

## AI stubs

`callFunction(name, body)` returns a canned response in demo instead of throwing:
`classify-meal`, `generate-recommendations`, `deep-research`, `analyze-health`,
`coach-weekly`, `suggest-experiments`, supplement schedule. The chat widget gets
a fixture reply. Stubs say they are stubs, so nobody mistakes them for real AI
output.

## i18n

Fixture strings are written in Russian because Russian text *is* the dictionary
key (see `i18n.tsx`), and demo screens translate them at render — the rule
established in PR #61. Every new string gets uk/en in `translations/demo.ts`, and
`demoI18n.test.ts` is extended to walk the new seed so a missing translation
fails CI.

## Testing

- Unit: `demoDb` seeds lazily, insert/update/remove round-trip, reset is total.
- i18n coverage: every seed string resolves in uk and en.
- Browser: walk every screen in demo (both languages), confirm no empty state
  and no AI error banner.

## Out of scope

Persisting demo edits across reloads; a "reset demo" button; making demo writes
reach Supabase.
