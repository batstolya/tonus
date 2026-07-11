-- Приватные проблемы за PIN: флаг на проблеме + хэш PIN в профиле.
-- Маскировка только в UI; анализ (research, AI) видит всё как раньше.
alter table health_concerns add column if not exists is_private boolean not null default false;
alter table profiles add column if not exists privacy_pin_hash text;
