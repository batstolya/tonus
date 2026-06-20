-- Per-user cal.com auto-sync config + encrypted credentials.
create table if not exists cal_sync (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  cal_email        text not null,
  cal_password_enc text not null,            -- base64( iv(12B) || AES-GCM ciphertext )
  enabled          boolean not null default true,
  last_sync_at     timestamptz,
  last_status      text,
  event_count      int,
  updated_at       timestamptz not null default now()
);

alter table cal_sync enable row level security;

-- Owner may READ their row (UI selects only non-secret columns; never cal_password_enc).
drop policy if exists "cal_sync owner read" on cal_sync;
create policy "cal_sync owner read" on cal_sync
  for select using (auth.uid() = user_id);

-- No client insert/update/delete policy on purpose: all writes go through the
-- sync-cal edge function using the service role (bypasses RLS).
