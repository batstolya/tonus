# Lab import: when the sample was taken, and what it measured (spec B)

Sibling of `2026-08-02-report-completeness-client-design.md` (A) and
`2026-08-02-ingest-null-vs-zero-design.md` (C). This one covers the lab import:
a migration, an edge function and the report's lab section.

**This is the most valuable of the three and the only one that rewrites stored
rows.** It must not be applied unattended.

## 0. Why

Production, read on 2026-08-02: 83 lab results, every one dated `2026-06-20`.
That is the day four PDFs were uploaded, not the day any blood was drawn.

```
lab_files
  2024-09_Analisis_Spain.pdf      date=2026-06-20   30 results
  2025-03_Analisis_Poland.pdf     date=2026-06-20   13 results
  2025-09_Analisis_Poznan_1.pdf   date=2026-06-20   38 results
  2025-09_Analisis_Poznan_2.pdf   date=2026-06-20    2 results
```

A year of lab history — September 2024 through September 2025 — is collapsed
onto a single day. Every trend the report could draw is destroyed, and the two
markers that genuinely moved are indistinguishable from two spellings of the
same draw.

The cause is one line. `extract-lab/index.ts`:

```ts
const resultDate = date || new Date().toISOString().slice(0, 10)
```

The date comes from the upload form; when the field is empty it becomes today.
The Gemini prompt asks for `marker`, `value`, `unit`, `ref_range` and `flag`,
and never asks for the date printed on the form.

The second defect compounds it. The same analyte arrives under every spelling
its laboratory used, and nothing reconciles them:

| Analyte | Stored as |
|---|---|
| Ferritin | `FERRITINA`, `Ferrytyna (L05)`, `[L05] Ferrytyna` |
| Iron | `HIERRO`, `Żelazo`, `[095] Żelazo` |
| Vitamin D | `Witamina 25(OH)D Total`, `[091] Witamina 25-OH D3` |
| TSH | `TSH (L69)`, `[L69] TSH` |

83 results carry 78 distinct marker names for roughly 40 analytes. The report
therefore shows 78 unrelated single-point markers and builds no trend where a
year-long trend exists. An earlier review read this backwards — it assumed
duplicates were being merged. They are not: nothing that should be joined is
joined.

Reference ranges are effectively absent: **1 of 83** rows has `ref_range`, 10
carry a laboratory `flag`. #170 already stops the report calling those results
normal; it cannot invent the ranges.

## 1. Goals and non-goals

**Goals.** Every lab result carries the date its sample was taken, at a stated
precision, separate from the date it was imported. Results of the same analyte
join into one series regardless of the language or code the laboratory used. A
delta is printed only between two results the data can actually order and
compare.

**Non-goals.** Unit conversion between measurement systems (mg/dL to mmol/L is
analyte-specific and belongs to a later pass — this spec keeps unit families
apart rather than converting them). Re-reading the original PDFs: `file_path`
is `null` for all four files and `extracted_text` holds an AI summary, not the
form, so the documents are gone. Reference-range backfill from an external
catalogue. New lab capture UI beyond the date field.

## 2. What can and cannot be recovered

The PDFs are not stored. The only surviving evidence of when each sample was
taken is the file name, which carries a year and a month:

```
2024-09_Analisis_Spain.pdf  →  2024-09, precision = month
```

Day precision is unrecoverable for the existing four files. Two of them share
`2025-09`, so their order within that month is unknown and must never be
implied.

This forces the shape of the fix: a date alone cannot carry the truth, so the
schema stores the precision beside it.

## 3. Schema

Migration `20260802_lab_sample_provenance.sql`, additive only — no column is
dropped or retyped, so a rollback is a `drop column`.

```sql
alter table public.lab_results
  add column if not exists sample_date date,
  add column if not exists sample_date_precision text
    check (sample_date_precision in ('day','month','unknown')),
  add column if not exists analyte_key text;

alter table public.lab_files
  add column if not exists sample_date date,
  add column if not exists sample_date_precision text
    check (sample_date_precision in ('day','month','unknown'));

create index if not exists lab_results_user_analyte
  on public.lab_results(user_id, analyte_key, sample_date);
```

`date` stays. It is the import date and is documented as such; readers stop
using it for anything chronological. Dropping it is a separate cleanup once no
code reads it.

### 3.1 Backfill

Two statements, both reversible, both reviewed before they run:

1. Every existing row gets `sample_date = date`, `sample_date_precision =
   'unknown'`. This states the truth about legacy rows: a date exists but its
   meaning is not established.
2. The four known files get their month from the file name, and their results
   inherit it at `'month'` precision.

Step 2 is written as an explicit four-row update with the ids listed, not a
regex over file names. A regex that mis-parses a file name silently moves a
patient's lab history by months; four literal rows can be read and checked by a
human before they run.

## 4. Analyte identity

New shared module `_shared/analytes.ts`, used by the edge function and mirrored
to the client through the existing facade pattern.

```ts
export interface AnalyteId {
  key: string            // 'ferritin'
  measurement: 'absolute' | 'relative' | 'ratio' | 'unknown'
  unitFamily: string     // 'ng/ml' — normalised spelling, not converted
}
export function identifyAnalyte(marker: string, unit: string | null): AnalyteId | null
```

A lookup table maps observed spellings to keys. It is explicit and hand-written,
covering the 78 names present, with the laboratory code prefixes (`[L05]`,
`(L05)`) stripped before matching and case and diacritics normalised.

**An unrecognised name is not guessed.** `identifyAnalyte` returns `null`, the
row keeps `analyte_key = null`, and the report prints it under its original
name as a standalone marker — exactly today's behaviour. The report states how
many markers are unidentified, so the gap is visible instead of silent.

Two results join into one series only when `analyte_key`, `measurement` and
`unitFamily` all match. That keeps percent apart from absolute count (which
#170 already achieves by unit) and keeps mg/dL apart from mmol/L until a later
pass teaches the module to convert.

## 5. Reading the date from the form

`extract-lab` changes in three places:

1. The Gemini schema gains `sample_date` (`YYYY-MM-DD`, or `YYYY-MM` when the
   form shows only a month) and `sample_date_source` (`'form'` when printed on
   the document, `'absent'` otherwise). The prompt says to copy the collection
   date, not the print or report date, and to leave it absent rather than guess.
2. When Gemini returns no date, the file name is parsed for a leading
   `YYYY-MM-DD` or `YYYY-MM`. This is the path that would have saved the four
   existing files.
3. Only when both fail does the upload-form date apply, and if that is empty
   too the row is stored with `sample_date = null`, `precision = 'unknown'`.
   **The silent fallback to today is deleted.**

The upload UI gains a line stating that the date is read from the document and
that the field overrides it — so an empty field is no longer a trap.

## 6. Report

The lab section, already reworked in #170, changes in four ways:

1. Rows sort and print by `sample_date`, not `date`. A month-precision date
   prints as `09.2024`; an unknown one prints «дата сдачи неизвестна».
2. Series group by `analyte_key` when present, by `[marker, unit]` when not —
   the #170 behaviour stays as the fallback.
3. A delta is printed only between two results whose dates can be ordered.
   Two month-precision results in the same month print both values and no
   delta, with «порядок внутри месяца неизвестен».
4. The section note replaces today's «Дата берётся из формы загрузки» with what
   is now true, and states the count of unidentified markers.

## 7. Rollout

Ordered, because the migration must land before the function that writes the
new columns:

1. Migration applied to production (`supabase db push`) — **by the repository
   owner, reviewed first**. It is additive; existing reads are unaffected.
2. Backfill statements, run and their row counts checked against 83 and 4.
3. `extract-lab` deployed.
4. Client changes released through the normal Vercel path.

Steps 1 and 2 are handed over as ready commands rather than executed
autonomously: they rewrite the only copy of a year of a patient's lab history,
and the source documents no longer exist to re-derive it from.

## 8. Testing

`analytes.test.ts` — the full observed name list maps to the expected keys;
bracketed codes strip; diacritics fold (`Żelazo` and `ZELAZO` reach the same
key); an invented name returns `null` rather than a near match; percent and
absolute of the same analyte differ in `measurement`.

`extract-lab` tests — a Gemini response with a date, without a date but with a
parseable file name, with neither; the assertion that no path produces today's
date.

Report tests — month-precision rendering, the suppressed delta inside one
month, the unidentified-marker count, and the existing #170 assertions
unchanged.

A migration test is not written: the repository has no harness for one. The
backfill is verified by row counts read back from production after it runs.

## 9. Acceptance criteria

1. No code path assigns the current date to a lab result.
2. Every existing result carries a `sample_date_precision`, and the four known
   files carry their month from the file name.
3. Ferritin, iron, vitamin D and TSH each form one series across the Spanish
   and Polish spellings.
4. No delta is printed between two results of different `measurement` or
   `unitFamily`, or between two results in the same month at month precision.
5. An unrecognised marker keeps its original name and is counted in the note.
6. The report never prints a lab date without stating its precision.
