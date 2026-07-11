-- Kp-индекс (магнитные бури) как фактор среды.
-- Планетарный геомагнитный индекс 0–9, максимум за день; буря = Kp >= 5.
alter table environment_daily add column if not exists kp_index numeric;
