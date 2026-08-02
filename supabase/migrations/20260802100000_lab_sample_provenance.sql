-- Lab results: when the sample was taken, separate from when it was imported.
--
-- Every one of this account's 83 lab results carries date 2026-06-20 — the day
-- four PDFs were uploaded, not the day any blood was drawn. The four files span
-- 2024-09 to 2025-09 and say so in their names. `date` therefore means "import
-- date" and nothing else; `sample_date` carries the truth, and
-- `sample_date_precision` carries how much of it is known, because the original
-- PDFs are gone (lab_files.file_path is null) and only the month survives.
--
-- Additive only. `date` is left in place: several readers still use it, and a
-- rollback is a `drop column`.

alter table public.lab_results
  add column if not exists sample_date date,
  add column if not exists sample_date_precision text,
  add column if not exists analyte_key text;

alter table public.lab_files
  add column if not exists sample_date date,
  add column if not exists sample_date_precision text;

do $$ begin
  alter table public.lab_results
    add constraint lab_results_sample_precision_check
    check (sample_date_precision in ('day', 'month', 'unknown'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.lab_files
    add constraint lab_files_sample_precision_check
    check (sample_date_precision in ('day', 'month', 'unknown'));
exception when duplicate_object then null; end $$;

create index if not exists lab_results_user_analyte
  on public.lab_results(user_id, analyte_key, sample_date);

comment on column public.lab_results.date is
  'Import date. Kept for compatibility; use sample_date for anything chronological.';
comment on column public.lab_results.sample_date is
  'When the sample was taken, as far as it is known. Read sample_date_precision before comparing two rows.';
comment on column public.lab_results.sample_date_precision is
  'day | month | unknown. Two month-precision rows in the same month cannot be ordered.';
comment on column public.lab_results.analyte_key is
  'Canonical analyte slug from _shared/analytes.ts. Null when the marker name was not recognised.';
