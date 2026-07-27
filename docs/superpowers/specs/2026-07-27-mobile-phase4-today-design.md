# Mobile Phase 4 — Today Screen (closes v1)

**Date:** 2026-07-27
**Status:** Approved — the user asked for charts explicitly and delegated the
rest of the design ("остальное на твоё усмотрение"). Every judgement call below
is therefore mine, and each one is written with its reason so it can be argued
with rather than merely accepted.
**Parent:** `2026-07-18-mobile-monorepo-design.md` (Phase 4, "ends v1")
**Depends on:** Phase 2b auth (#151, merged). **Not** on Phase 3 sync.

## Goal

One screen that answers "how am I today?" in the time it takes to look at a
phone before getting out of bed. Shipping it closes mobile v1 as scoped
(auth + HealthKit sync + Today).

## Why this comes before 3c

The delivery half of Phase 3 cannot be verified without real Health data, and
inventing samples to test it would push fabricated numbers into the production
database, where they would mix with genuine metrics and be impossible to
separate afterwards.

Today has no such dependency: it reads what is already in Supabase — years of
it, put there by Health Auto Export — so it can be built *and* verified on the
simulator against real data today. Sync arrives when the device does.

## Decisions

### Not a copy of the web dashboard

The web dashboard is 471 lines of panels: streak calendar, correlations,
experiments, geo-storm badges, AI analysis. Reproducing that on a phone would
take weeks and produce a worse version of a thing that already exists and works.

The phone is for the ten-second morning glance. The web stays the place where
you dig. Concretely: **one screen, no tabs, no navigation** — v1 has exactly
two screens, auth and this.

### What is on it, in order

1. **Readiness as the hero.** One large number with a one-line reading of it.
   This is the number the whole product exists to produce.
2. **Recovery, sleep, stress** — three secondary numbers on one row. Present
   because readiness alone does not say *why*.
3. **A 14-day readiness sparkline.** The single chart. A number without a
   trend is not interpretable: 62 after a week of 50s means something
   different from 62 after a week of 80s.
4. **Last night's sleep** — hours plus deep/REM, since that is the input a
   person can actually act on tonight.
5. **Today's activity** — steps and exercise minutes against the day goal the
   web already uses (7000 steps or 30 minutes).
6. **A staleness banner when the data is old**, reusing
   `supabase/functions/_shared/staleness.ts` — the same rule the web uses, so
   the two clients cannot disagree about what "stale" means.

Deliberately absent: streak, correlations, experiments, AI. Each is a screen's
worth of work and none of them is a morning glance.

### Charts: `react-native-svg`, hand-rolled sparkline

Checked on npm 2026-07-27:

| Option | Native dependencies it drags in |
| --- | --- |
| **`react-native-svg` 15.15.5** | **one**, peers `react: *` / `react-native: *` |
| `victory-native` 41.26.0 | Skia + Reanimated + gesture-handler |
| `@shopify/react-native-skia` 2.10.0 | plus Reanimated ≥4 and react-native-worklets ≥0.7 |
| `react-native-gifted-charts` 1.4.77 | svg + linear-gradient |

A sparkline is a polyline through fourteen points. Victory Native would bring
a whole GPU rendering stack, another prebuild, and three more native modules
to keep compatible across SDK bumps — to draw a line. `react-native-svg` is
one dependency, Expo installs it directly, and the component is roughly forty
lines we control.

If interactive charts are ever wanted (pan, tooltips, multi-series), that is
the moment to add Victory — not before.

### Data access lives in `packages/shared`

A new module `packages/shared/src/todayData.ts` exporting

```ts
loadTodayData(client: SupabaseClient<Database>, userId: string, days: number)
```

Client-only logic, so per the shared-code boundary it is born in shared rather
than in `apps/mobile`. Taking the client as an argument rather than importing a
singleton is what makes it testable with a fake client — no device, no network,
no signed-in user.

**Scores are not recomputed.** `computeDailyScores` in
`supabase/functions/_shared/scores.ts` stays the single source; the mobile
screen reaches it through a facade in shared, exactly as the web does. A second
implementation of the formulas is the specific mistake this repo has already
made once and cleaned up.

### Empty and stale states are first-class

Three states, each with its own copy:

- **No data at all** (new account, sync never ran): explain that numbers appear
  after the first sync, and offer the demo. Not a spinner — we have already
  paid for one screen that sat spinning forever and said nothing.
- **Data, but old**: show it with the staleness banner rather than hiding it.
- **Offline**: show the last loaded numbers with a quiet marker. v1 does no
  caching of its own, so this means "the query failed, here is what we have" —
  and if there is nothing, say that plainly.

### Pull to refresh, and refresh on foreground

The obvious gesture must work, and returning to the app after a night should
not show yesterday. Foreground refresh also becomes the first authenticated
request the app makes — which is what finally makes the `AppState` token-refresh
wiring from 2b provable, since today nothing in the app calls the API at all.

## Verification

- `loadTodayData` under vitest with a fake client: shapes, missing days, and
  the score facade being used rather than a local reimplementation.
- The sparkline component with fourteen points, one point, and none.
- On the simulator, signed in as a real user: the numbers match what
  tonus-nu.vercel.app shows for the same day. That comparison is the real test
  — the web is the reference implementation.
- Empty state verified by signing in as a user with no data, or by pointing the
  query at a date range with none.
- The macOS CI job screenshots the screen; `tonus://today` gets the same
  deep-link treatment the health debug screen got, so CI can reach it without a
  human tapping.

## Risks

- **The web is the reference, and it may itself be wrong.** If the numbers
  disagree, the answer is not "make mobile match" but "find out which is
  right" — both now read the same formulas, so a disagreement means a data or
  query difference worth understanding.
- **`react-native-svg` needs a prebuild.** One more native module in the
  chain; the macOS job will catch a link failure, as it did for HealthKit.
- **Scope creep is the real risk.** Every panel on the web dashboard will look
  tempting. The line to hold: if it is not answerable in ten seconds before
  breakfast, it belongs on the web.

## Out of scope

Tabs and navigation, streak and calendar, correlations, experiments, AI chat,
settings, editing or logging data, offline caching, widgets, charts with axes
and tooltips.
