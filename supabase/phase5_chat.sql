-- Chat sessions
create table if not exists chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  period_start date,
  period_end date,
  context_snapshot text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table chat_sessions enable row level security;
create policy "user chat_sessions" on chat_sessions for all using (auth.uid() = user_id);

-- Chat messages
create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  session_id uuid references chat_sessions(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  tokens_used int,
  created_at timestamptz default now()
);

alter table chat_messages enable row level security;
create policy "user chat_messages" on chat_messages for all using (auth.uid() = user_id);

-- Context notes (daily journal)
create table if not exists context_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  date date not null,
  note text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, date)
);

alter table context_notes enable row level security;
create policy "user context_notes" on context_notes for all using (auth.uid() = user_id);
