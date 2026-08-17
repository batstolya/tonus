# Time of day on concern observations

Date: 2026-08-17

## Problem

A concern observation (`concern_logs`) carries a calendar date and nothing
finer. The user records bowel movements, skin flare-ups and similar events
whose time of day is part of the clinical picture, so the time ends up typed
into the free-text note by hand ("кашеобразный и прилипало сильно к унитазу 12
00"). The consequences:

- Two observations on the same day sort arbitrarily in the journal, so the
  order of events is lost.
- The doctor report prints the date only; the time survives only as noise
  inside the note text, in whatever format was typed that day.
- Nothing can be computed over time of day.

The row already has `created_at`, but that is the moment the row was inserted
— often hours after the event — so it cannot stand in for the time of the
event.

## Decisions

1. **Time is prefilled, and editable.** The form defaults to the current date
   and time; the user may correct either before saving. Automatic-only was
   rejected: the user habitually writes up events later in the day, so an
   insert-time clock would record a time that is simply wrong, and that wrong
   time would reach the doctor report.
2. **Existing rows get no time.** The 19 stored observations keep date only —
   no backfill from `created_at` (it would invent times) and no parsing of
   times out of note text (formats vary: "12 00", "16 00", "10 44"; the
   information also already reads fine inside the note).
3. **Report prints the time next to the date on the same line** rather than
   grouping entries per day, matching the surrounding report layout.

## Data model

Add one column to `concern_logs`:

```sql
alter table concern_logs add column if not exists at_time time;
```

- `at_time` is a wall-clock local time, nullable. `null` means "recorded
  before this feature existed, or the time is unknown".
- Not `timestamptz`: the row already carries `date` as the user's local day,
  and a separate time field keeps 12:00 reading as 12:00 in the journal, the
  report and the export regardless of the viewer's timezone. No timezone
  arithmetic is introduced.
- `created_at` keeps its current meaning (insert timestamp, internal) and stays
  out of the interface.

Regenerating `database.types.ts` after the migration is part of the work, and
`ConcernLog` in `src/lib/concerns.ts` gains `at_time: string | null`.

## Interface

`ConcernsScreen` — concern detail view.

**New observation form.** The severity row (`Виражeність: 1 2 3 4 5`) gains a
date input and a time input on its right, both using the existing `.log-input`
class (the concern-creation form already renders a `type="date"` input with
that class, so the look is established). Both are prefilled from the client
clock on mount and re-prefilled after a successful save. Untouched, they
record "now"; corrected, they record the event.

**Observation journal.** The time renders to the right of the date, in the
existing date/severity row:

```
● 2026-08-16  12:00  3/5
  кашеобразный и прилипало сильно к унитазу
```

Rows without `at_time` print the date alone, exactly as today — no dash, no
placeholder, so the list does not look ragged.

Sort order: date descending as today, and within one date by `at_time`
descending (latest first). Rows without a time sort after the timed rows of
the same date.

**Severity chart** is unchanged — it plots by day, and time does not enter it.

## Doctor report

`buildConcerns` (`src/lib/doctorReport/journal.ts`) carries `at_time` through
into its `logs` entries and sorts within a date by time, ascending — the report
reads oldest-first, so the day reads as a sequence of events.

`markdown.ts` prints the time after the date when present:

```
- 2026-08-16 12:00 (тяжесть 3/5): кашеобразный и прилипало сильно к унитазу
- 2026-08-13 (тяжесть 3/5): прилипает к туалету
```

The second line is an untimed legacy row: date only, unchanged from today.
Seconds are never printed; the time renders as `HH:MM`.

## Data export

`src/lib/exportData.ts` includes the new column so an export stays a full copy
of the row.

## Testing

- `journal.test.ts`: entries of one date come back ordered by time; an untimed
  entry is placed after timed entries of the same date; an entry with a time
  survives the round trip with its time intact.
- `markdown` test: a timed entry prints `YYYY-MM-DD HH:MM`, an untimed entry
  prints the date alone, and no seconds appear.
- `ConcernsScreen` component test: the form prefills date and time; saving with
  an edited time passes that time to `addLog`; the journal renders the time for
  a timed entry and renders nothing extra for an untimed one.
- Demo fixtures (`demoSeed.ts` / `demoFixture.ts`) get times on some concern
  logs and none on others, so the demo shows both states.

## Out of scope

- Times on diary notes, hair entries, or any log other than `concern_logs`.
- Editing the time of an already-saved observation (today an observation is
  deleted and re-added; that stays true).
- Any analytics over time of day.
