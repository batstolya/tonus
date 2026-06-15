-- Supplements registry
create table if not exists supplements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  default_dose text,
  unit text,
  active boolean default true,
  sort_order int default 0,
  created_at timestamptz default now()
);

alter table supplements enable row level security;
create policy "user supplements" on supplements for all using (auth.uid() = user_id);

-- Daily supplement logs
create table if not exists supplement_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  supplement_id uuid references supplements(id) on delete cascade not null,
  date date not null,
  taken boolean default true,
  dose text,
  note text,
  created_at timestamptz default now(),
  unique(user_id, supplement_id, date)
);

alter table supplement_logs enable row level security;
create policy "user supplement_logs" on supplement_logs for all using (auth.uid() = user_id);
