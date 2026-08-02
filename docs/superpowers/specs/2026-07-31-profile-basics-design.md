# Profile basics — birth year and sex in Settings

Small companion to `2026-07-31-doctor-report-v2-design.md`. The doctor report
prints a page with no patient identification; this puts birth year and sex in
the user's profile so the report can carry an age.

## 0. Current state

The data layer already exists and has since 2026-07-10:

- `profiles.birth_year int` and `profiles.sex text` are in the baseline
  migration (`20260710120000_baseline_schema.sql:901`) and in the generated
  types (`packages/shared/src/database.types.ts:1402`).
- `loadProfileBasics()` / `saveProfileBasics()` live in `src/lib/supplements.ts`,
  an accidental home — every other `profiles` accessor sits in
  `src/lib/api/settings.ts`.

What is missing is a place to enter the values. Today the only input is an
inline form inside the AI "ideal supplement timing" block on the Supplements
screen (`SupplementSchedule.tsx`), next to a banner instructing the user to run
`alter table profiles add column …` in the Supabase SQL editor. That banner has
been wrong since the migration shipped: it tells the user to fix a schema that
is already correct.

## 1. Scope

**In.** A Profile section in Settings with birth year and sex; the loaders moved
to the settings API; the Supplements screen reduced to a pointer at Settings;
the stale SQL banner deleted; the age printed in the doctor report header.

**Out.** Name, height, weight (no columns, and weight has no data source at
all — see the doctor report spec §1). Birthday precision: only the year is
stored, so age is approximate by design.

## 2. Design

**Storage is unchanged.** `birth_year` stays a year rather than an age or a
date: an age would silently rot, and a full birth date is more identifying
data than the report needs.

**`ProfileSection.tsx`** joins `src/components/settings/sections/`, following
the shape of the neighbouring sections (`settings-section` wrapper,
`ArchiveBtn`, `settings-section-title`). A four-digit numeric input for the
year and a select for sex, both saving on change through
`saveProfileBasics()`. It renders first in `SettingsScreen`, above the language
picker: it identifies the person rather than configuring the app.

**Loaders move** from `src/lib/supplements.ts` to `src/lib/api/settings.ts`,
joining `getProfileLocation` and `syncProfileTimezone`, and gain a demo branch —
today `loadProfileBasics` queries Supabase unconditionally, so in demo mode it
returns null and both the new section and the report header render empty on the
screenshot stand.

**One edit point.** The inline form on the Supplements screen is removed and
replaced with a line pointing at Settings, together with the obsolete SQL
banner and its `colMissing` state. Two editors for one field drift apart.

**Report header.** The model gains a `patient` block: `{ birthYear, sex, age }`,
where `age` is the current year minus the birth year. Print and markdown render
`Возраст (по году рождения): 38 · Пол: мужской`. With no birth year stored, the
existing blank `Пациент: ________` line stays as it is today. The age is always
included when known — the report is already generated on an explicit user
action, and an age without a name identifies no one.

## 3. Testing

- `src/lib/api/settings.test.ts` — `loadProfileBasics` selects `birth_year, sex`
  by profile id and returns nulls when the row is absent; `saveProfileBasics`
  updates only the patched keys; both short-circuit in demo mode.
- `src/components/settings/sections/ProfileSection.test.tsx` — entering a year
  calls the save function; non-digits are rejected by the input.
- `src/lib/doctorReport/model.test.ts` — `patient.age` is computed from the
  birth year, and is null when the profile is empty.

## 4. Acceptance criteria

1. Settings shows a Profile section; a birth year entered there survives a page
   reload.
2. The Supplements screen no longer edits the profile and no longer shows the
   SQL banner.
3. The doctor report header prints the age when the profile has a birth year,
   and the blank patient line when it does not.
4. Demo mode shows a filled profile section and an age in the report.
