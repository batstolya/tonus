-- AI recommendations
create table if not exists recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  metric text not null,
  text text not null,
  rationale text,
  suggested_target numeric,
  suggested_target_label text,
  status text not null default 'new', -- new | accepted | dismissed | snoozed
  source text default 'ai',
  created_at timestamptz default now()
);
alter table recommendations enable row level security;
create policy "own" on recommendations using (auth.uid() = user_id);

-- User goals
create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  metric text not null,
  title text not null,
  baseline_value numeric,
  target_value numeric not null,
  direction text not null, -- up | down | earlier | habit
  start_date date not null default current_date,
  end_date date not null,
  status text not null default 'active', -- active | paused | achieved | failed
  recommendation_id uuid references recommendations(id),
  step_size numeric,
  created_at timestamptz default now()
);
alter table goals enable row level security;
create policy "own" on goals using (auth.uid() = user_id);

-- Daily goal progress snapshots (optional, for history)
create table if not exists goal_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  goal_id uuid references goals(id) on delete cascade not null,
  date date not null,
  value numeric,
  on_target boolean,
  created_at timestamptz default now(),
  unique(goal_id, date)
);
alter table goal_progress enable row level security;
create policy "own" on goal_progress using (auth.uid() = user_id);
