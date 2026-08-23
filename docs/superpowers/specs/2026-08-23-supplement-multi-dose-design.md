# Multiple doses per day for supplements

## Problem

`supplement_logs` stores one row per (supplement, date) with a boolean `taken`.
A supplement taken three times a day with meals can only be marked as "taken",
so the calendar and the adherence percentage cannot tell one dose from three.

## Schema

One migration:

- `supplements.doses_per_day int not null default 1`, check between 1 and 10.
- `supplement_logs.taken_count int not null default 1`, check >= 0. Existing rows
  become one dose, which is what they already meant.
- `taken` stays and holds the invariant `taken = (taken_count > 0)`. Seven
  consumers read it (telegram-bot, biweekly-report, coach-weekly, healthContext,
  doctorReport, exportData, research); none of them change.
- RPC `log_supplement_dose(p_supplement_id uuid, p_date date, p_delta int)`:
  atomic increment clamped to `[0, doses_per_day]`, `security definer`, asserts
  the supplement belongs to `auth.uid()`. Returns the new `taken_count`.

## Web

- Clicking a day cell cycles `0 -> 1 -> ... -> N -> 0` and writes `taken_count`
  with a direct upsert (the web knows the exact target value).
- A full day renders as today (green fill, checkmark). A partial day renders the
  same green at reduced opacity with `2/3` in place of the checkmark. With
  `doses_per_day = 1` the cell looks exactly as it does now.
- `doses_per_day` is a field in the add form and an inline editor in the card
  header next to the stock counter.
- Stock decrements per dose: -1 for each dose added today, +1 when a dose is
  rolled back.

## Percentages

`compliance()` in the calendar and `computeAdherence()` both count fractionally:
`sum(taken_count) / (days * doses_per_day)`, clamped to 100%.

## Telegram

The reminder "taken" button and the `take` menu action call the RPC with
`delta = 1`. The reply shows `2/3` while the day is partial and keeps the current
wording once it is complete.

## Tests

- node: counter cycle, fractional adherence, clamping at both ends, and that
  `doses_per_day = 1` behaves exactly like the old boolean.
- jsdom: a partial cell renders `2/3` and advances on click.

## Manual steps after merge

`npx supabase db push`, `npm run gen:types`, redeploy `telegram-bot` and
`send-reminders`.
