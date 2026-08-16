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
2. **Drinks** — water *and coffee* join the nutrition section: what the
   patient ate and drank is one question, and answering it should not mean
   flipping between two sections. Alcohol and medication stay in «Отмеченный
   приём», which is now purely about exposures.
3. **Default** — the «Питание» section is on by default, like the others.

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
  - `drinks` — one line per drink present (water first, then coffee), reusing
    `summarizeIntakeType` from `intake.ts` so a cup of coffee and a dose of
    medication are counted by identical rules; a drink never logged is omitted
    rather than printed as zero;
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
- **Markdown** — `## Питание и напитки` after the intake section: coverage and
  median table, a drinks table (напиток | дней с отметками | всего отметок |
  медиана за день | типичное время), then the full meal table
  (дата | время | что | ккал | Б | Ж | У).
- **Print** — new `SectionKey` `'nutrition'`, default on, rendering the same
  two tables from the same model.
- **Translations** — uk and en for every new string, since the report language
  is independent of the interface and now offers three.
