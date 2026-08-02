# Doctor report: what the app already knows but never printed (spec A)

Third design in the doctor-report line, after `2026-07-31-doctor-report-v2-design.md`
(#163) and `2026-08-01-doctor-report-honesty-design.md` (#170). v2 collected the
data; the honesty pass stopped the report claiming more than the data supports.
This one closes the remaining **client-side** gaps: two defects a second external
review found that #170 does not cover, and one whole category of collected data
the report has never printed.

**This spec is client-only.** No migration, no edge function, no ingest change.
Two sibling specs cover the rest of the review:
`2026-08-02-lab-import-provenance-design.md` (B) and
`2026-08-02-ingest-null-vs-zero-design.md` (C).

## 0. Why

An external review of a 90-day report generated on production (which runs v2,
without #170) raised ten points. Each was checked against the code and against
the production database on 2026-08-02. Four were already fixed by #170
(calendar denominators, unclassified sleep, labs without a reference range,
percent-versus-absolute lab grouping). Three belong to the lab import or the
ingest and are specced separately. The three that remain are here.

| Defect | Evidence |
|---|---|
| The weekly table prints one shared day count while each metric averages over its own days | `weekly.ts` `days: rows.length`. Week of 2026-07-20 prints "Сон 8.3 · Дней 7" from three nights: 07-22 (7.53), 07-24 (8.18), 07-25 (9.08) |
| A sleep session whose bed window is physically implausible is printed without comment | 2026-06-13 stores `bedtime 00:14:24`, `wake_time 23:55:33` — a 23h41m window holding 7.3h of sleep. 80 of 525 sessions have a window over 16h or non-positive |
| Coffee, alcohol and medication are recorded in `intake_events` but the report states they are not included | `MISSING_LINES` in `markdown.ts` versus the rows `QuickLog.tsx` writes |

## 1. Goals and non-goals

**Goals.** Every weekly cell carries the coverage that produced it. A sleep row
whose bed window cannot be true says so. The intake the patient records — the
part a doctor asks about out loud — appears in the report instead of being
listed as absent.

**Non-goals.** Lab dates and analyte identity (spec B). The `null`-versus-zero
defect in the HAE ingest (spec C). Illness/stress/travel episodes, food and
water, environment, workouts, heart-rate sample timing, sleep episodes in the
schema, and any new data capture. Each was considered and deliberately left
out; §6 records why.

## 2. Architecture

The v2 module layout holds: one model, two renderers that print the same facts.
One new module, `doctorReport/intake.ts`, owns the intake section and nothing
else. `weekly.ts` and `sleep.ts` gain fields; no module gains a new dependency
direction. `timeOfDayStats` moves from `sleep.ts` to `math.ts` because a second
caller now needs it and the sleep module is not its owner.

## 3. Weekly coverage per metric

`WeeklyRow.days` is one number for the whole week — the count of rows in the
bucket. Every metric's mean is computed over its own non-null values, gated at
`MIN_WEEK_DAYS` (3). A reader who sees "Дней 7" next to a sleep average built
from three nights is being told something false by juxtaposition.

`WeeklyRow` gains `counts: Partial<Record<MetricKey, number>>`, filled in the
same loop that fills `values`. Both renderers print the count inside the cell:

```
| 2026-07-20 | 56 (7) | 39 (5) | 8.3 (3) | … |
```

The parenthesised number is days of *that* metric in *that* week. The shared
`Дней` column is dropped: with per-cell counts it carries no information the
cells do not, and its presence is the defect. The table header gains a line
saying the number in brackets is the days behind the average.

An empty cell already means "fewer than three days" — that stays, and the
header line says so too.

## 4. Implausible sleep windows

`buildSleep` already counts `implausible` as nights whose sleep exceeds the bed
window. That catches only one direction. The production data shows the other
direction is the common one: a merged or mis-paired session leaves a window of
20–28 hours around a normal night of sleep.

Add to `SleepNight`:

- `windowHours: number | null` — wake minus bedtime, or `null` when either
  timestamp is missing.
- `suspicious: boolean` — `true` when `windowHours` is non-positive, or over
  `MAX_BED_WINDOW_HOURS = 16`, or below the night's own sleep total.

The night table gains no column. Instead a suspicious row's bedtime and wake
cells carry a marker (`⚠`), and the section note states the count and what it
means: the source recorded a bed window that cannot hold the sleep it reports,
so bedtime and wake time for those nights are not trustworthy — the sleep
duration itself is unaffected.

`SleepSection.implausible` is replaced by `suspiciousNights: number`, counting
the union of both directions. The bedtime and wake-time medians exclude
suspicious nights: a 23-hour window contributes a bedtime that is not a
bedtime. Their `count` already prints as "N из M", so the exclusion is visible
rather than silent.

**16 hours is a threshold, not a truth.** It is documented in the code as the
point past which a single sleep opportunity stops being plausible for an adult,
chosen because the production data clusters either under 14 or over 20.

## 5. Recorded intake

A new section, placed directly after «Добавки и приём» — both answer "what does
the patient take" — reading `intake_events` for types `meds`, `alcohol` and
`coffee` inside the period frame.

`load.ts` gains the source; `ReportSources.intake: IntakeEvent[]`.
`buildIntake(events, frame)` returns one line per type present:

| Тип | Дней с отметками | Всего отметок | Медиана за день с отметкой | Типичное время |
|---|---|---|---|---|
| Кофе | 62 из 90 | 94 | 200 мл | 09:40 · половина 08:55–11:20 |
| Алкоголь | 11 из 90 | 14 | 150 мл | 20:15 · половина 19:30–21:40 |
| Лекарства | 23 из 90 | 23 | — | 08:10 · половина 07:50–08:40 |

- The denominator is `frame.calendarDays`, the same rule as every other count
  in the report.
- The dose column prints only when the type's events carry an `amount`; `meds`
  normally does not, and prints `—` rather than a zero.
- «Типичное время» is the circular median and interquartile range of the event
  timestamps.

Medication without a name tells a doctor nothing, and the name lives in the
free-text `note`. Under the `meds` row the section prints the distinct notes
with their counts — «Магний — 14, ибупрофен — 6, без названия — 3» — sorted by
count. This is the only place the section goes deeper than one row per type.

### 5.1 The circular-median seam

`timeOfDayStats` maps times to minutes since 18:00 before ordering, and its own
comment justifies that seam by noting no realistic bedtime falls near it.
Alcohol falls exactly there: a drink at 17:55 and one at 18:05 would land at
opposite ends of the scale and drag the median to nonsense.

The origin becomes a parameter. Sleep keeps 18:00; intake uses 04:00, the
emptiest hour for all three types. The function moves to `math.ts` with both
callers passing their own origin explicitly — no default, so a third caller has
to think about it.

### 5.2 What the section must not claim

Three rules, the same class of honesty the previous pass established:

1. The heading names the source: «Отмеченный приём (со слов пациента)».
2. A note states that a missing tick is not a missing intake — the same trap
   that turned «Соблюдение 13%» into «Доля дней с отметкой».
3. Amounts are what the patient typed, not measurements. Millilitres of coffee
   are a default the app suggested, not a measured volume.

### 5.3 The absence list changes

`MISSING_LINES` currently promises that coffee, alcohol, medication and events
are all absent. Half of that becomes false. The line splits: events (illness,
stress, travel), food and water stay listed as absent; intake leaves the list.
The pinned nine-line test in `markdown.test.ts` is updated to the new list —
deliberately, as the guard against silent drift.

## 6. Considered and rejected

- **Illness / stress / travel episodes.** Real explanatory value for a dip in
  HRV, but they are ticked irregularly, so their absence reads as "nothing
  happened" far more strongly than intake does. Needs its own honesty treatment.
- **Food and water.** The sparsest data in the table and the least useful to a
  doctor without portions or composition.
- **Environment.** Invites causal reading the data cannot support.
- **`health_alerts`.** A deduplication ledger of `type` and `created_at`; no
  clinical content.
- **Heart-rate sample timing.** `heart_rate_samples` is populated and would
  answer "when were the extremes", but a 90-day window is a large client-side
  query and belongs with the workouts work.

## 7. Testing

New `intake.test.ts`: calendar-day denominator; dose median only when amounts
exist; `meds` names counted and sorted; the 18:00 seam proved on alcohol (a set
straddling 18:00 must produce a median near 18:00, not near 06:00); an empty
result when the period holds no events of these types.

Extended `weekly.test.ts`: per-metric counts match the values they accompany,
including a week where two metrics have different day counts. Extended
`sleep.test.ts`: the 16-hour boundary and one hour either side; a non-positive
window; suspicious nights excluded from the bedtime and wake medians.

Both renderers: `markdown.test.ts` and `DoctorReport.copy.test.tsx` assert the
same rows, the updated `MISSING_LINES`, and the suspicious-night marker.

The demo fixture gains one deliberately damaged day — a session with a 22-hour
bed window — so the suspicious path is visible in demo mode instead of living
only in tests. This closes acceptance criterion 12 of the previous spec, which
was written but never planned.

## 8. Acceptance criteria

1. Every weekly cell prints the number of days of that metric behind it; the
   shared `Дней` column is gone.
2. A night whose bed window exceeds 16 hours, is non-positive, or is shorter
   than its own sleep total is marked, counted in the section note, and
   excluded from the bedtime and wake-time medians.
3. The intake section prints one row per present type with a calendar-day
   denominator, and medication names with counts.
4. A median intake time computed over timestamps straddling 18:00 lands
   between them, not twelve hours away.
5. The report no longer lists coffee, alcohol and medication as data it does
   not contain, and still lists events, food and water.
6. Demo mode renders the intake section and at least one suspicious night.
