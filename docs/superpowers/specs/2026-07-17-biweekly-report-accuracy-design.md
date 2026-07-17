# Biweekly report accuracy — design

Date: 2026-07-17. Status: approved by owner ("да делай") after external review
of a production report (ChatGPT critique, triaged against the code).

## Problem

The biweekly report (`supabase/functions/biweekly-report/index.ts`) mixes
deterministic digest numbers with Gemini prose, and four defects surfaced:

1. **Timezone is hardcoded twice, differently.** The report renders bedtimes in
   `Europe/Moscow` and detects "late" via a fixed `>= 22:00 UTC` threshold,
   while chat-health renders the same bedtimes in `profiles.timezone` with an
   `Europe/Berlin` fallback. In July both Moscow and Kyiv are UTC+3, so the
   report happened to be right for a Kyiv user and chat was an hour early —
   the external reviewer saw the mismatch and blamed DST. From late October
   (Kyiv → UTC+2, Moscow stays UTC+3) the report itself drifts +1h and starts
   flagging 00:00–00:59 bedtimes as "late".
2. **Cross-period comparisons are left to Gemini.** It produced "10 cases…
   more than the previous period's 12" — a self-contradiction. Facts must be
   computed, not generated.
3. **Data coverage is invisible.** A "two-week" report silently built on 11
   nights of sleep data reads as complete.
4. **"Stress days" threshold is period-relative** (< 80% of the current
   period's own average; the code comment even says 75%). A personal 4-week
   baseline is both more honest and already cheap: the function fetches the
   previous period anyway, so 28 days of HRV are in memory.

Additionally the prose overclaims (RHR 46 "очень хороший", "здоровая структура
сна", diagnosis guesses like "вирусное заболевание или отравление").

## Decision

**A. One timezone source.** New `_shared/userTimezone.ts`:
`loadUserTimezone(supabase, userId)` → `profiles.timezone ?? 'Europe/Kyiv'`
(validated IANA). Used by biweekly-report *and* chat-health (replacing its
Berlin fallback — the product's users are ru/ua; a silent Berlin default was
the actual source of the reviewer's +1h). `healthContext.ts` internals are
untouched (it already accepts a tz option).

**B. Pure, tested digest logic.** New `biweekly-report/digest.ts` — no Deno
imports, so the vitest node project tests it directly (same pattern as
`telegram-bot/router.ts`):
- `localHHMM(iso, tz)` — render an instant as HH:MM in a tz (Intl-based).
- `lateBedtimes(sleep, tz)` — late = local time in **[01:00, 09:00)**,
  computed per-instant in the user tz (DST-correct), returning local strings.
- `median(vals)`.
- `lowHrvDays(rows, baseline)` — days with hrv < 80% of the personal baseline
  (median HRV across both fetched periods ≈ 4 weeks), labeled as such in the
  digest instead of "high stress".
- `coverage(periodDays, metricDays, sleepNights)` — explicit line, e.g.
  `Покрытие данных: метрики 14/14 дней, сон 11/14 ночей`.
- `lateComparisonLine(currentCount, prevCount)` — the cross-period fact,
  precomputed.

`index.ts` keeps only orchestration: fetch, call digest helpers with the
loaded tz and 28-day HRV median, feed results to the prompt. `fmtBedtime`
and the UTC threshold are deleted.

**C. Prompt hardening.** Added requirements: never compute cross-period
comparisons yourself — use only the precomputed fact lines; state data
coverage in the summary; qualify physiology cautiously (low RHR/HRV wording
tied to personal trend, not verdicts); no disease guesses — describe symptoms
and say the cause cannot be determined from the data; mark each claim as fact
(from data), possible link, or assumption.

## Testing

Vitest (node project) on `digest.ts`; the DST regression is the key case:
`2026-01-10T22:30:00Z` in `Europe/Kyiv` is 00:30 → **not** late (the old
Moscow rendering said 01:30 and the old UTC threshold flagged it), while
`2026-07-10T23:13:00Z` → 02:13 → late. Boundary: exactly 01:00 local is late,
00:59 is not. `check:functions` (deno) type-checks the function side.

## Deploy

`biweekly-report` and `chat-health` (both import the new `_shared/userTimezone.ts`).

## Out of scope

- Gemini prose quality beyond prompt constraints (model-side).
- SpO2 rounding investigation; sleep-phase vs total-sleep denominator note is
  handled by the coverage line, not by re-aggregating phases.
- `profiles.timezone` settings UI (fallback covers the gap).
