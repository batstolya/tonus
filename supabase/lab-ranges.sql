-- Референсные диапазоны и пометки отклонений для анализов
alter table lab_results add column if not exists ref_range text;
alter table lab_results add column if not exists flag text; -- 'low' | 'high' | 'normal'

-- Алерты (проактивные уведомления) — чтобы не слать одно и то же часто
create table if not exists health_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  type text not null,
  created_at timestamptz default now()
);
alter table health_alerts enable row level security;
create policy "user health_alerts" on health_alerts for all using (auth.uid() = user_id);
create index if not exists idx_health_alerts_user on health_alerts (user_id, type, created_at desc);
