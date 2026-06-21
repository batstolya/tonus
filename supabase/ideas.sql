-- Личный «ящик идей» по проекту (через Telegram-бота, /idea и /ideas).
-- Не показывается на сайте. Применено 2026-06-21.

create table if not exists public.ideas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);

alter table public.ideas enable row level security;

create policy "users manage own ideas" on public.ideas for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists ideas_user_created_idx on public.ideas(user_id, created_at desc);
