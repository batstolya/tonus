# Doctor report: stop overstating what the data supports

Follow-up to `2026-07-31-doctor-report-v2-design.md`, shipped as #163. The v2
report collects the right data; this design fixes the places where it presents
that data more confidently than it can support.

## 0. Why

An external review of a generated 90-day report raised about forty points. Each
was checked against the code. They fall into four layers — report rendering,
lab import, sleep aggregation in the ingest, and data the app does not collect
at all. **This design covers the first layer only**: the client-side report.
Nothing here touches the schema, the edge functions, the ingest, or the score
formulas.

Confirmed defects in the current report:

| Defect | Location |
|---|---|
| Coverage denominators exclude days with no record, inflating every percentage | `metrics.ts` `daysInPeriod: slice.length`, `weekly.ts` `coverage()` |
| Baseline comparison and deviations are printed at any coverage — VO₂max with 14 of 90 days reads like a trend | `metrics.ts`, `deviations.ts` |
| The "Нагрузка" score row is `100 − recovery`: the same number twice, the second time under a name that promises training volume | `_shared/scores.ts` `stress`, `model.ts` `SCORE_DEFS` |
| Daytime sleep episodes are counted as nights, dragging down averages and the under-6-hours count | `sleep.ts` over `DailyMetrics.sleepHours` |
| Bedtime and wake time print as bare `HH:MM`, so a night spanning midnight looks impossible (`02:14` → `01:55`) | `sleep.ts` `hhmm()` |
| The average bedtime is an arithmetic mean whose midnight-straddle rule breaks when a daytime episode is in the set | `metrics.ts` `avgTimeOfDay` |
| A lab result with no reference range and no lab flag is printed as "в норме" | `markdown.ts` labs table |
| Lab results group by marker name alone, so a percentage and an absolute count of the same analyte form one series with a nonsense delta | `labs.ts` `byMarker` |
| The baseline compared against a 90-day average is the rolling 30-day mean of the *last* day of that same period | `model.ts` |

## 1. Goals and non-goals

**Goals.** Every printed number is either measured or explained; every derived
claim carries the coverage that supports it, and disappears when that coverage
is too thin; no verdict is attributed to a source that did not give one.

**Non-goals.** Ingest changes (sleep episodes, workouts, heart-rate events,
ECG), lab date and unit normalisation at import, new data capture (weight,
blood pressure, structured wellbeing, RPE), adding intake events to the report,
and any change to the score formulas in `_shared/scores.ts`. Each is its own
spec; §12 lists the queue.

## 2. Architecture

The module layout from v2 holds. One new module, `doctorReport/reliability.ts`,
owns coverage bands and the gating decisions; the report's own baseline
calculation joins it there rather than growing `metrics.ts` further. Both
renderers — the print tables in `DoctorReport.tsx` and `toMarkdown` — stay
dumb: everything below is decided in the model, and the renderers gain fields,
not logic.

## 3. Denominators

`daysInPeriod` becomes the number of calendar days, not the number of rows that
happen to exist. The same denominator serves the metric table, the coverage
section and the weekly day counts.

When the user's history is shorter than the requested period, the denominator
counts from the first day with any record rather than from the nominal period
start. A three-month-old account asked for 365 days would otherwise report ~25%
coverage on everything and be unreadable. The header states both numbers, so
the clamp is never silent.

The header gains a data-quality line:

> Календарных дней: 90 · Дней хотя бы с одной записью: 88 · Полностью пустых
> дней: 2

## 4. Reliability and what it suppresses

`reliability.ts` computes, per metric: days with data, coverage percent against
the denominator from §3, the longest consecutive run of days without a value,
and a band.

| Band | Coverage |
|---|---|
| Высокая | ≥ 80% |
| Средняя | 60–79% |
| Низкая | 40–59% |
| Недостаточная | < 40% |

Measured values — average, min, max, days with data — are printed at every
band. Fourteen VO₂max measurements are fourteen measurements and a doctor wants
them. What the bands gate is everything *derived*:

- **Baseline comparison** (§6) requires средняя or better.
- **Membership in Deviations** requires средняя or better, on top of the
  existing per-week rules (≥5 days in the week, ≥5 comparable weeks, 2 MAD,
  per-metric `minRel`).
- **A weekly-table cell** requires at least 3 days of that metric in that week.
  Today a single measurement is printed as a weekly average.
- **A score trend** (first third against last third) requires at least half the
  days in each third to carry that score; otherwise the trend column reads
  "не рассчитан" and the period average stands alone.

Every metric row carries its band and its longest gap, so a suppressed claim is
always explained rather than merely absent.

## 5. Scores

The "Нагрузка" row is removed. `stress_score` is defined as `100 − recovery`,
so the row restated the recovery score under a name that promises training
volume; a week of football and volleyball never moved it. Sleep and recovery
remain.

Beneath the table, one line per score: what goes into it, and how many days of
the period it was computed over. The section closes with the rule that makes
the numbers readable at all — scores average only the days that have data, so a
day without HRV does not lower recovery, it is simply not in it.

Daytime episodes (§7) are excluded from the sleep input the report feeds to
`computeDailyScores`. The report already recomputes scores client-side, so this
stays report-local; the stored scores and every other screen are untouched.

## 6. Personal baseline

Today the report takes `computeDailyScores`' rolling 30-day **mean** from the
**last day** of the period and compares a 90-day average against it — a
baseline that lies entirely inside the window it is supposed to judge, computed
by a method that a bad fortnight drags with it.

The report computes its own instead: the **median of the 28 days immediately
before the period start**, with the interquartile range of that same window as
the normal spread. It needs at least 14 days carrying a value; below that the
comparison is refused and the row says so. Because the baseline no longer comes
from the score module, it applies to every metric rather than to the four
`computeDailyScores` happens to expose.

The comparison is printed as position within a range, not as a percentage:

> Пульс покоя 50 · медиана 48 · обычный диапазон 44–53 · внутри диапазона

"+4%" on a resting heart rate of 48 is two beats, which is noise; the same +4%
on HRV is not. A range says which of the two the reader is looking at.

The score formulas in `_shared/scores.ts` stay untouched: they feed readiness
and recovery on every screen, in the bot, in the biweekly report and in stored
history, so changing them means an `ingest-health` redeploy and a recompute of
the past. That is a separate task, not part of fixing a report. The cost of
this decision is two definitions of "личная норма" in one product, so the
report names its own method under the table.

## 7. Sleep

**Daytime episodes.** An episode shorter than 3 hours that starts between 08:00
and 20:00 local time is classified as daytime. Its row stays in the night-by-
night table, marked, because a doctor should see that the patient slept during
the day. It is excluded from: nights under 6 hours, nights of 8 or more, the
bedtime and wake-time medians, the weekly sleep averages, the sleep metric
summary, and the sleep score.

The XML importer merges every asleep interval of a day into one record, so a
nap folded into a real night cannot be separated here — only whole episodes
that are themselves daytime can be identified. Splitting the rest belongs to
the ingest spec.

**Dates on times.** Bedtime and wake time print with a date qualifier whenever
the calendar date differs from the row's date: `02:14 (12.06)` → `01:55
(13.06)`. Those rows were never broken; the date was being discarded. The
existing source-quality counter for genuinely impossible rows stays.

**Median instead of mean.** Bedtime and wake time report a circular median with
an interquartile range: «медиана отбоя 01:42, половина ночей 00:58–02:31».
Times map to minutes since 18:00 before ordering, which keeps a cluster around
midnight contiguous; with daytime episodes already excluded, no realistic
bedtime or wake time sits near the 18:00 seam.

## 8. Labs

**Grouping.** The key becomes marker plus normalised unit (trimmed,
case-folded) instead of marker alone. Lymphocytes at 42.2% and lymphocytes at
2.16 ×10³/µL become two rows and two series; a delta is computed only between
measurements sharing a unit. Converting between units of the same analyte —
iron at 171 µg/dL versus 30.5 µmol/L — needs an analyte dictionary and belongs
to the lab-import spec; here they simply stop being subtracted from each other.

**Status.** The single "в норме" fallback splits into three outcomes:

| Available | Printed |
|---|---|
| Parsed reference range | «в диапазоне лаборатории» / «выше» / «ниже» |
| No range, but a flag from the form | The flag, marked as the laboratory's |
| Neither | «статус не определён: лаборатория не указала референс» |

"В норме" disappears from the report even where a range exists: that range is
one laboratory's, not a clinical verdict.

**Two caveats under the tables.** Same-named markers in different units are
listed separately and never compared. Dates come from the upload form rather
than from the form's own collection date, so results from different
laboratories can share one date and their order within it is unknown.

## 9. What this data does not contain

The closing block gains: the time and duration of heart-rate extremes, workout
type and heart rate during exercise, time in bed and night-time awakenings. And
one line that is not about missing data at all — coffee, alcohol, medication
and events (illness, stress, travel) are logged in the app but deliberately
excluded from this report. Without it a language model reads the silence as
abstinence.

## 10. Testing

New: `reliability.test.ts` — band boundaries, longest-gap counting, and each
gating rule at the threshold and one day either side.

Extended: `metrics.test.ts` (calendar denominator, clamped denominator on short
history, circular median with a daytime episode in the set, baseline refusal
when the pre-period window is too thin), `sleep.test.ts` (classification
boundaries at 3 hours and 08:00/20:00, exclusion from each aggregate, date
qualifiers on a midnight-spanning night), `labs.test.ts` (percent and absolute
stay separate, no cross-unit delta, all three status outcomes),
`markdown.test.ts` (no "Нагрузка" row, no "в норме" anywhere, a low-coverage
metric prints its values and no baseline comparison), `DoctorReport.test.tsx`
(the same suppression in the printed page).

## 11. Acceptance criteria

1. Every coverage figure divides by calendar days; a period longer than the
   user's history states its clamped denominator in the header.
2. A metric below 60% coverage prints average, min, max and days with data, and
   prints no baseline comparison, appears in no deviation week, and shows its
   band and longest gap.
3. A week contributes a cell to the weekly table only with 3 or more days of
   that metric.
4. The report contains no row labelled "Нагрузка", and each remaining score
   states its inputs and the number of days behind it.
5. An episode under 3 hours starting between 08:00 and 20:00 is marked as
   daytime, appears in the night table, and is absent from every sleep
   aggregate and from the sleep score.
6. A night whose bedtime falls on the previous calendar day prints both dates.
7. Bedtime and wake time are reported as medians with an interquartile range.
8. A lab result with neither a parsed range nor a flag prints "статус не
   определён"; the string "в норме" appears nowhere in either renderer.
9. A marker measured in two units yields two rows and no delta between them.
10. A metric with a sufficient pre-period window prints median and normal range
    instead of a percentage; with fewer than 14 days in that window it prints
    the refusal and its reason. No percentage against a personal baseline
    survives anywhere in the report.
11. The closing block names the intake data the app holds but the report omits.
12. Demo mode renders every section, including the damaged fixture.

## 12. The queue behind this

Ordered by value against cost, to be specced separately:

1. **Read what the export already contains** — workouts (type, duration, mean
   and max heart rate), `LowHeartRateEvent` / `HighHeartRateEvent` /
   `IrregularHeartRhythmEvent`, and the timing of heart-rate extremes from the
   per-minute samples already parsed and discarded. This is unread ingest, not
   new collection.
2. **Lab import** — collection date read from the form itself, several forms and
   dates in one file, canonical units and analytes, the laboratory's own flag
   preserved, migration of existing rows.
3. **Sleep episodes** — main sleep against naps in the schema, full timestamps
   with time zone, both ingest paths, time in bed and efficiency where the
   source supplies them.
4. **Intake in the report** — reverses the 2026-07-31 decision; the data is
   already collected.
5. **New capture** — weight (external scales), blood pressure (external cuff),
   body temperature, structured wellbeing, RPE. None of it exists in the watch.
