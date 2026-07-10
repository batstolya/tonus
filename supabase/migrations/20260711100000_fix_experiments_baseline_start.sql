-- Старая формула создания эксперимента писала baseline_start = start_date − 2×baseline_days
-- (окно вдвое длиннее заявленного). Приводим к контракту: start_date − baseline_days.
update public.experiments
set baseline_start = start_date - baseline_days
where baseline_start is distinct from start_date - baseline_days;
