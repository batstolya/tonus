-- AI usage log: tracks all Gemini API calls and token counts
create table if not exists ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  source text not null, -- 'chat', 'analyze', 'extract-lab'
  tokens_used integer,
  created_at timestamptz default now()
);

alter table ai_usage enable row level security;
create policy "Users see own usage" on ai_usage for select using (auth.uid() = user_id);
create policy "Users insert own usage" on ai_usage for insert with check (auth.uid() = user_id);

-- User budget setting
alter table profiles add column if not exists ai_budget_usd numeric(6,2) default 5.00;
