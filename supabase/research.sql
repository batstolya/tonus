-- Архив «дип-ресёрча»: каждый запуск со списком связей и разбором ИИ
create table if not exists research_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  period_days int not null,
  findings jsonb not null default '[]',
  reply text,
  created_at timestamptz default now()
);

alter table research_runs enable row level security;
create policy "user research_runs" on research_runs for all using (auth.uid() = user_id);

create index if not exists idx_research_runs_user on research_runs (user_id, created_at desc);
