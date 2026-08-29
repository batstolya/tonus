# Habits: abstinence tracking, inverted from supplements

Date: 2026-08-28
Status: approved

## Problem

The user wants to hold abstinence commitments ("no sweets") and see the streak
build up. Supplement tracking cannot express this: there, a day counts only once
the user acts. For abstinence the opposite is true -- doing nothing *is* the
success, and the only event worth recording is a slip.

Control lives mainly in Telegram, where the user already handles supplements.

## Decisions

Settled during brainstorming; each closes an alternative that was considered.

1. **A day with no break row is clean, today included.** Revised 2026-08-29
   after the first build shipped: the user asked for the day to mark itself done
   and to be unchecked by hand, so `pending` is gone -- a day is clean or broken.
2. **Telegram is passive.** No daily ping. The user opens the habits menu or
   sends `/break` when a slip happens. A nightly nudge can be added later.
3. **Telegram reaches back one day; the web page edits any past day.** Revised
   2026-08-29: the page is a month calendar with month navigation, so limiting it
   to today and yesterday would make paging through months pointless. Telegram
   still offers only today and yesterday.
4. **Unmarking is always allowed.** A break row can be removed (wrong habit,
   wrong day).
5. **Habits reach the AI chat and the doctor report**, not just the page.
6. **Every habit has a `start_date` and an `active` flag.** Without a start date
   an inverted log would claim clean days back to account creation. Archiving
   keeps history while removing the habit from the page, Telegram and AI.

## Data

```sql
habits (
  id uuid pk, user_id uuid not null,
  name text not null, note text,
  start_date date not null default current_date,
  active boolean not null default true,
  sort_order int default 0, created_at timestamptz
)

habit_breaks (
  id uuid pk, user_id uuid not null, habit_id uuid not null,
  date date not null, note text, created_at timestamptz,
  unique (user_id, habit_id, date)
)
```

A row in `habit_breaks` means failure; its absence means success. The table is
sparse by design -- a clean month stores zero rows, and that is a valid state
rather than missing data.

RLS `using (auth.uid() = user_id)` on both tables. `delete_user_data` gains a
delete per table, restated in full the way the observations migration did, or
this history outlives the account it belongs to.

`set_habit_break(p_user_id, p_habit_id, p_date, p_broken boolean)` --
`security definer`, rejecting a caller whose `auth.uid()` is neither null nor
`p_user_id`, mirroring `log_supplement_dose`. The Telegram bot runs as
service_role and resolves the user itself; the web calls it as the user. One
function both sets and clears the mark.

## Day model

`apps/web/src/lib/habits.ts` -- pure, no Supabase. Given
`(habit, breaks[], today, timezone)` it returns a status per day in the window:

- `clean` -- no break row
- `broken` -- a break row exists

Days before `start_date` fall outside the window entirely; they are not `clean`.
Derived: current streak (consecutive `clean` days ending at the last closed
day), best streak, breaks in the last 30 days.

## Screen

A new `habits` view in the "Дневник" nav group, next to supplements, with hash
`#habits`. Not a tab inside supplements -- the mechanic is inverted and mixing
them would confuse the two.

`HabitCard` per active habit, revised 2026-08-29 to mirror the supplement
calendar exactly, inverted:

- one month selector above the cards drives all of them
- header: name, current streak, best streak, clean-day percentage
- grid: the displayed month, Monday-first, in the same cells the supplement
  calendar uses. A clean day is checked (the `taken` fill); a slip is an
  unchecked cell; future days and days before `start_date` are disabled.
- action: clicking a checked day unchecks it and records the slip; clicking an
  unchecked day clears it. There are no separate buttons.
- footer: breaks in 30 days, clean days out of the window.

Archived habits sit in a collapsible "Завершённые" block, following goals.
The empty state offers "Добавить привычку"; the form takes name, note and
start date.

Statistics stay honest: with zero breaks the card shows an absolute count
("28 чистых дней подряд"). Percentages appear only once the window covers 30
days or more, since a fresh habit would otherwise read as a meaningless 100%.

## Telegram

`MAIN_MENU` gains "🚫 Привычки" beside "💊 Препараты". The habits screen lists
active habits with their streaks and a `hb:<id>` button; tapping one offers
today / yesterday / clear, and `hb:<id>:<offset>` calls `set_habit_break`.
`/срыв` and `/break` open the same list directly. Keyboards go in `menus.ts`,
callback branching in `callbacks.ts`, the command in `commands.ts`.

The callback carries no timezone, and the server's date is not necessarily the
user's. Resolve "today" from `profiles.timezone`, the way the biweekly report
has since PR #99 -- never from `current_date`.

## AI context and doctor report

`_shared/healthContext.ts` gains
`habits: { name, startDate, streakDays, breaks: string[] }[]` -- active habits
only, 30-day window -- and a prompt paragraph stating clean days and break
dates. That is enough for the model to line a slip up against the same day's
sleep or stress.

The doctor report gains a section built like `lib/doctorReport/supplements.ts`:
one line per habit with the adherence period and the break dates.

## Tests

- `lib/habits.test.ts` (node): streak across a break, `pending` today,
  `start_date` cutoff, a break on day one, clearing a mark.
- `HabitCard.test.tsx` (jsdom, `renderWithProviders`).
- Callback routing in the bot's existing `router.test.ts`.
- Doctor report section tests alongside the supplements ones.

## Manual steps after merge

`npx supabase db push`, `npm run gen:types`, redeploy `chat-health` and
`telegram-bot`.
