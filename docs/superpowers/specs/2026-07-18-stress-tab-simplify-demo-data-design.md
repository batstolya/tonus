# Stress tab: simplify connect flow + populate the demo

**Date:** 2026-07-18
**Status:** Design approved, pending spec review

## Problem

The Stress tab (`StressMapScreen`) doubles as a calendar-import surface. Its
empty state shows three inline connectors — `.ics` file upload, a
`cal_bookings.json` upload, and a Google Calendar button — even though calendar
connection already has a home in Settings. This clutters the tab for new users
and, in demo mode, the tab is simply empty (the demo fixture generates daily
metrics and heart-rate samples but no calendar events), so a visitor who taps
"Посмотреть демо" sees an import prompt instead of a working stress map.

## Goals

1. The Stress tab is a **viewing** surface, not an import surface. Its empty
   state offers a single lightweight way in (Google Calendar) and points
   everything else to Settings. This applies to real new users, not only demo.
2. Every import method that leaves the tab still has a reachable home.
3. Demo mode shows a populated stress map (real heart-rate deltas, charts, a
   tagged physical-activity event) the moment demo is enabled.

## Non-goals

- No changes to `buildStressMap` scoring logic.
- No changes to Cal.com sync (`CalSyncSection`) or Google
  (`GoogleCalendarSection`).
- No new nav gating — the simplified empty state serves new users implicitly.

## Current state (verified)

- `.ics` upload: exists in **two** places — the Stress tab empty state and
  `UploadScreen` (`accept=".ics"`, reachable via Settings → Import → "Загрузить
  данные"). Already has a home outside the tab.
- Cal.com: `CalSyncSection` in Settings (email/password + session token, live
  sync). Already in Settings.
- Google Calendar: `GoogleCalendarSection` in Settings. Already in Settings.
- `cal_bookings.json` upload (`parseCalBookings`): exists **only** in the Stress
  tab. The one orphaned connector.
- Demo (`demoFixture.ts`): `makeDemoDaily(90)`, `makeDemoHRSamples(7)` (every 10
  min, 24h/day for the last 7 days), but **no** `makeDemoEvents`. `App.tsx` demo
  path loads daily + HR samples + intake events, never calls `setEvents`.

## Design

### 1. Stress tab empty state (`src/components/stress-map/StressMapScreen.tsx`)

Replace the three-button empty state with:

- A single **🗓 Google Calendar** connect button, rendered only when
  `onGoogleCalendar` is provided (i.e. `isGoogleCalendarAvailable()`).
- A hint line: "Другие способы подключить календарь — в Настройках" (ru/uk via
  i18n).

Remove from this component: `parseICS`, `parseCalBookings` imports; `handleICS`,
`handleCal` handlers; `icsRef`, `calRef`; the `.ics` and `cal_bookings.json`
`<input>`/`<button>` markup. The `onEvents` prop is no longer used by the empty
state and is removed from `Props`; `App.tsx` stops passing it.

The populated view (sort tabs, list, charts, Google toggle) is unchanged.

### 2. Relocate `cal_bookings.json` to `UploadScreen`

Add a second `UploadZone` in `src/components/upload/UploadScreen.tsx` next to the
existing `.ics` zone:

- `accept=".json"`, label "Перетащите cal_bookings.json", sublabel "Экспорт
  Cal.com", `optional`.
- Handler parses with `parseCalBookings` and calls the existing `onEvents`
  prop (same path the `.ics` zone uses).

Both calendar file imports now live in the upload flow reachable from Settings →
Import. `.ics` is untouched (already there).

### 3. Demo calendar events (`src/lib/demoFixture.ts` + `src/App.tsx`)

Add `makeDemoEvents(days = 7): CalendarEvent[]` returning ~10–14 deterministic
events placed within the `makeDemoHRSamples` window (last 7 days) so each event
overlaps real HR samples and yields a non-null `heartRateDelta`. Seeded the same
way as the other `make*` fixtures for stable output.

Event mix (titles in ru; uk provided via i18n if these strings are surfaced):

- 2–3 high-stress events in working hours (e.g. "Созвон с клиентом", "Дедлайн по
  проекту") — scheduled where the HR base is elevated (h 9–19) to produce a
  visible positive delta.
- Calm events ("Обед", "1:1 с руководителем").
- One physical-activity event whose title matches `PHYSICAL_KEYWORDS` (e.g.
  "Тренировка в зале") so it renders the 🏃 badge.

Wire into the demo branch of `App.tsx` (alongside `makeDemoDaily` /
`makeDemoHRSamples`): import `makeDemoEvents` and call `setEvents(makeDemoEvents())`
so the Stress tab shows a populated map, sort tabs, and charts immediately.

### 4. Translations

New/changed UI strings ("Другие способы подключить календарь — в Настройках" and
any demo event titles that reach the UI) added to the ru/uk i18n catalogs per
the `adding-translations` skill. `npm run lint` enforces `--max-warnings 0`, so
no missing-key drift.

## Testing

- `stressMap.ts` logic unchanged → existing tests stand.
- Component test for `StressMapScreen` empty state: asserts the `.ics` and
  `cal_bookings.json` controls are gone and the Google button + Settings hint
  render (and that the button is absent when `onGoogleCalendar` is undefined).
- `demoFixture` test: `makeDemoEvents()` returns events inside the HR window,
  includes at least one `PHYSICAL_KEYWORDS` match, and `buildStressMap` over the
  demo HR samples yields entries with non-null `heartRateDelta` for the
  working-hours events.
- Manual: enable demo, open Стресс → populated map with deltas, sort tabs, and a
  🏃-tagged event; charts tab renders.

## Files touched

- `src/components/stress-map/StressMapScreen.tsx` — trim empty state.
- `src/components/upload/UploadScreen.tsx` — add cal_bookings.json zone.
- `src/lib/demoFixture.ts` — add `makeDemoEvents`.
- `src/App.tsx` — wire demo events; drop unused `onEvents` on `StressMapScreen`.
- i18n catalogs — new strings.
- Tests as above.
