# Heart events on the Pulse screen — design

Status: approved by owner 2026-11-25 ("Так, на «Пульс»"). Small change.

## Intent

346 low-heart-rate notifications (since 2023-11) and 4 ECGs are stored in
`heart_events` but visible only in the doctor report (last 365 days). The owner
wants to see them in the app.

## Design

A "Heart events (Apple Watch)" block at the bottom of Body → Pulse
(`HeartRateScreen`), over the WHOLE history (not the screen's 14/30/90 preset —
events are sparse and the multi-year trend is the point):

- Stat cards: low-HR notification count, lowest heart rate seen, share at night
  (local 00:00–06:59), ECG count.
- Bar chart: notifications per month, months without events shown as 0, from
  the first event to the current month.
- "Recent events": newest first, 10 shown, "Show all" expands.
- ECG list: date/time, Apple classification, average heart rate when known.
- Facts only — no "good/bad", no diagnosis wording. uk/en translations.
- Demo mode: fixture events so the block renders.
- Hidden entirely when the user has no events.

## Builder's calls

- Pure `summarizeHeartEvents()` in `components/heart-rate/heartEventsSummary.ts`
  (tested); `HeartEventsBlock.tsx` renders it; data via the existing
  `loadHeartEvents()` (lib/doctorReport/load.ts) with an all-history `since`.
- Chart uses recharts with `isAnimationActive={false}` (bars otherwise do not
  render on recharts v3 + React 19) and `--chart-1`.
