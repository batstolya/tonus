-- Time of day for a concern observation.
--
-- The row already carries `date` as the user's local day, so a bare `time`
-- keeps 12:00 reading as 12:00 in the journal, the report and the export no
-- matter where the app is opened — no timezone arithmetic is introduced.
-- NULL means the time is unknown: every row written before this column
-- existed, and `created_at` is deliberately not used as a substitute because
-- it records when the row was inserted, not when the event happened.
alter table concern_logs add column if not exists at_time time;
