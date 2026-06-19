-- Оценка калорий и БЖУ для событий-еды (из текста, позже — из фото).
alter table intake_events add column if not exists calories int;
alter table intake_events add column if not exists protein_g real;
alter table intake_events add column if not exists carbs_g real;
alter table intake_events add column if not exists fat_g real;
