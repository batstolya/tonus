# Nutrition and drinks in the doctor report

## Problem

`intake_events` already carries meals with macros (`calories`, `protein_g`,
`carbs_g`, `fat_g`, `note`) and water (`amount` in ml), logged from
`NutritionScreen` / `MealLogger` and `QuickLog`. The doctor report prints
neither: `REPORTED_TYPES` is `meds | alcohol | coffee`, and "Питания" sits in
the "what this data does not contain" list.

The patient wants to hand the doctor what they ate and drank over the same
selected period (30 / 90 / 365 days) as the rest of the report.

## Decisions

Taken in brainstorming, 2026-08-16:

1. **Depth** — summary *and* the full list of meals, not a truncated sample.
   A doctor reading a 90-day report wants to scan the actual entries.
2. **Drinks** — every drink lives in one «Напитки» table: water, coffee *and*
   alcohol. Splitting them by how the app classifies each type left "what does
   the patient drink" answerable only by reading two sections. Medication is
   left alone in its own section — it is neither food nor drink, and its rows
   share no units with either.
3. **Day by day** — the period is also printed one row per day: totals and
   meal times and drink volumes for that date. Medians answer "how much
   usually", but a doctor also reads the run of days.
4. **Default** — the nutrition sections are on by default, like the others,
   behind a single «Питание и напитки» checkbox.

## Shape

New module `lib/doctorReport/nutrition.ts`, mirroring how `intake.ts` and
`supplements.ts` own their own section:

- `NutritionEvent` — an intake row widened with the macro columns.
- `NutritionMeal` — one printed meal: date, time, note, macros.
- `NutritionSection`:
  - coverage: `days` with at least one meal out of `calendarDays`, `meals`
    total, `macroDays` (days carrying calories at all);
  - medians of the **per-day totals over days with a mark** — the same
    convention `buildIntake` uses, so a day of three meals doesn't read like a
    day of one: calories, protein, carbs, fat;
  - `mealTime` — `timeOfDayStats` over meal timestamps, reusing
    `INTAKE_ORIGIN_MIN` (04:00) so the evening meal isn't split by midnight;
  - `drinks` — one line per drink present (water, then coffee, then alcohol),
    reusing `summarizeIntakeType` from `intake.ts` so a cup of coffee and a
    dose of medication are counted by identical rules; a drink never logged is
    omitted rather than printed as zero;
  - `byDay` — one `NutritionDay` per calendar day carrying any mark: day
    totals per macro, the clock times of that day's meals, and a total per
    drink type. Days with nothing logged get **no row** — an empty row reads
    as a day of eating nothing, which this data can never say;
  - `meals` list, chronological, complete.
- `buildNutrition(events, frame)` returns `null` when the period holds neither
  meals nor drinks, so the section disappears rather than printing zeros.

## Honesty rules

These are patient ticks, not measurements, and the section says so in the same
voice as the intake section:

- Absence of a mark is not a measurement of zero — an unlogged lunch and a
  skipped lunch look identical in this data.
- Calories and macros are the values the patient (or their food app) entered,
  not a measured intake.
- Coverage is printed as `N из M дней` on every line so a doctor can see how
  thin the record is before reading a median.

`MISSING_LINES` loses «Питания» and the clause about food and water being
excluded, and now points food, water and coffee at the nutrition section; what remains uncovered (portion weights, micronutrients) is stated
instead.

## Surfaces

- **Loader** — `loadNutritionEvents(userId, since)` selects the macro columns
  for `meal` and `water`; a separate call from `loadIntakeEvents`, which must
  keep its narrow column list and its own type filter. Added to
  `ReportSources` as `nutrition`, failure-tolerant like every other source.
- **Model** — `nutrition: NutritionSection | null` on `DoctorReportModel`.
- **Markdown** — three sections in order: `## Питание` (coverage and median
  table), `## Напитки` (напиток | дней с отметками | всего отметок | медиана
  за день | типичное время), `## Питание и напитки по дням`
  (дата | ккал | Б/Ж/У | приёмы пищи | одна колонка на каждый логированный
  напиток), then the full meal table, then `## Лекарства`. The day table grows
  a drink column only for drinks the period actually carried.
- **Print** — new `SectionKey` `'nutrition'`, default on, gating all three
  sections and rendering the same tables from the same model via the shared
  `nutritionDayHeader` / `nutritionDayRow` cells.
- **Translations** — uk and en for every new string, since the report language
  is independent of the interface and now offers three.
