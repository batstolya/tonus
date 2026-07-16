begin;

create table if not exists public.ai_processing_consents (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  purpose text not null,
  policy_version text not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (user_id, provider, purpose, policy_version)
);

alter table public.ai_processing_consents enable row level security;

create policy "users read own ai consent"
  on public.ai_processing_consents for select to authenticated
  using (auth.uid() = user_id);

create policy "users grant own ai consent"
  on public.ai_processing_consents for insert to authenticated
  with check (auth.uid() = user_id);

create policy "users update own ai consent"
  on public.ai_processing_consents for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

commit;
