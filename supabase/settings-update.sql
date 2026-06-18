-- ════════════════════════════════════════════════════════════════
-- Настройки отчёта (частота уже есть: frequency_days) + подробность + B4
-- ════════════════════════════════════════════════════════════════

-- Подробность отчёта: 'short' | 'medium' | 'full'
alter table report_settings add column if not exists detail_level text not null default 'full';

-- B4: слать ли в Telegram чувствительное (анализы/препараты) — по умолчанию только сводка
alter table report_settings add column if not exists send_sensitive boolean not null default false;

-- B4: утренняя сводка самочувствия — выкл по умолчанию
alter table report_settings add column if not exists morning_summary boolean not null default false;
alter table report_settings add column if not exists morning_time text not null default '09:00';
alter table report_settings add column if not exists morning_last_sent date;
alter table report_settings add column if not exists timezone text not null default 'Europe/Kyiv';
