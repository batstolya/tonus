-- Самочувствие 1–5 как субъективный исход дня (вводится из вечернего вопроса в Telegram).
alter table context_notes add column if not exists wellbeing smallint;
-- Разрешаем строку без текстовой заметки (день, где есть только оценка 1–5).
alter table context_notes alter column note drop not null;
