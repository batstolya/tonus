-- One-time Telegram linking tokens are user credentials. The browser may
-- create and manage only its own token; telegram-bot uses service_role.

begin;

alter table public.telegram_link_tokens enable row level security;

revoke all on table public.telegram_link_tokens from anon;
revoke all on table public.telegram_link_tokens from authenticated;
grant select, insert, delete on table public.telegram_link_tokens to authenticated;

drop policy if exists "telegram link tokens own select" on public.telegram_link_tokens;
create policy "telegram link tokens own select"
  on public.telegram_link_tokens
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "telegram link tokens own insert" on public.telegram_link_tokens;
create policy "telegram link tokens own insert"
  on public.telegram_link_tokens
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "telegram link tokens own delete" on public.telegram_link_tokens;
create policy "telegram link tokens own delete"
  on public.telegram_link_tokens
  for delete
  to authenticated
  using (auth.uid() = user_id);

commit;
