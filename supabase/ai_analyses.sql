create table if not exists ai_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  period_start date not null,
  period_end date not null,
  created_at timestamptz default now(),
  summary text not null,
  good jsonb not null default '[]',
  improve jsonb not null default '[]',
  focus jsonb not null default '[]',
  model text not null,
  tokens_used integer
);

alter table ai_analyses enable row level security;
create policy "users see own analyses" on ai_analyses for all using (auth.uid() = user_id);
