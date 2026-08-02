-- Backfill for 20260802100000_lab_sample_provenance.sql.
--
-- NOT a migration, on purpose. It rewrites the only surviving copy of a year of
-- lab history: the source PDFs were never stored (lab_files.file_path is null)
-- and lab_files.extracted_text holds an AI summary rather than the form, so
-- nothing here can be re-derived if it goes in wrong. Read it, run it by hand,
-- check the row counts it prints.
--
-- Run:  psql "$TONUS_DB_URL" -f scripts/backfill-lab-sample-dates.sql
--
-- Step 2 lists the four files literally rather than parsing their names with a
-- regex. A regex that mis-reads one name moves a patient's lab history by
-- months and nothing downstream would notice.

begin;

-- ── Step 1: state the truth about every legacy row ────────────────────────
-- A date exists, but it is the import date and its meaning is not established.
update public.lab_results
   set sample_date = date,
       sample_date_precision = 'unknown'
 where sample_date is null;

update public.lab_files
   set sample_date = date,
       sample_date_precision = 'unknown'
 where sample_date is null;

-- ── Step 2: the four files whose names carry their collection month ───────
--   3c6bb3cf  2024-09_Analisis_Spain.pdf       30 results
--   7ee35257  2025-03_Analisis_Poland.pdf      13 results
--   e21b720e  2025-09_Analisis_Poznan_1.pdf    38 results
--   bc441b9e  2025-09_Analisis_Poznan_2.pdf     2 results
--
-- Poznan_1 and Poznan_2 share a month; at month precision their order within
-- September 2025 is unknown and must never be implied.
update public.lab_files f
   set sample_date = v.sample_date,
       sample_date_precision = 'month'
  from (values
    ('3c6bb3cf-26d2-42cc-a752-efc707348326'::uuid, date '2024-09-01'),
    ('7ee35257-74e5-4911-b28d-1a97f48b3773'::uuid, date '2025-03-01'),
    ('e21b720e-490c-4903-95ae-217b8b0a731a'::uuid, date '2025-09-01'),
    ('bc441b9e-4d26-4569-9349-611c982fc306'::uuid, date '2025-09-01')
  ) as v(id, sample_date)
 where f.id = v.id;

-- Results inherit their file's date and precision.
update public.lab_results r
   set sample_date = f.sample_date,
       sample_date_precision = f.sample_date_precision
  from public.lab_files f
 where r.lab_file_id = f.id
   and f.sample_date_precision = 'month';

-- ── Step 3: read back before committing ───────────────────────────────────
-- Expect: 2024-09-01 → 30, 2025-03-01 → 13, 2025-09-01 → 40, and no remaining
-- row at 'unknown' for these four files.
select sample_date, sample_date_precision, count(*)
  from public.lab_results
 group by 1, 2
 order by 1, 2;

commit;
