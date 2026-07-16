-- Durable request rate limiting (beta-safety PR 3).
-- One row per (bucket, window); consume_rate_limit() increments atomically and
-- reports whether the request is still within its limit. Buckets are
-- '<scope>:<subject>' where subject is a user id or a SHA-256 token hash —
-- raw tokens never reach this table. Service-role only: RLS enabled with no
-- policies, and the RPC is revoked from every client role.

create table if not exists public.rate_limit_counters (
  bucket text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (bucket, window_start)
);

alter table public.rate_limit_counters enable row level security;
revoke all on table public.rate_limit_counters from public, anon, authenticated;

create or replace function public.consume_rate_limit(p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_count integer;
begin
  if p_limit <= 0 or p_window_seconds <= 0 then
    return false; -- fail closed on nonsense configuration
  end if;
  v_window_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  -- keep the table tiny: expired windows for this bucket are dead weight
  delete from rate_limit_counters
    where bucket = p_bucket and window_start < v_window_start;
  insert into rate_limit_counters (bucket, window_start, count)
    values (p_bucket, v_window_start, 1)
    on conflict (bucket, window_start)
    do update set count = rate_limit_counters.count + 1
    returning count into v_count;
  return v_count <= p_limit;
end $$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;
