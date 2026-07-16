-- Privacy-safe operational events. This table deliberately has no user_id,
-- message, stack, request body, or arbitrary metadata columns.
create table if not exists public.observability_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_timestamp timestamptz not null,
  environment text not null check (environment in ('preview', 'production')),
  service text not null check (service in ('web', 'edge')),
  operation text not null check (operation in (
    'web.global_error',
    'web.unhandled_rejection',
    'web.edge_function_failure',
    'edge.ingest_health',
    'edge.send_reminders',
    'edge.telegram_bot'
  )),
  request_id uuid not null,
  outcome text not null check (outcome in ('success', 'failure', 'delivery_unknown')),
  duration_ms integer check (duration_ms between 0 and 300000),
  error_code text check (error_code in (
    'client_error',
    'unhandled_rejection',
    'edge_request_failed',
    'http_5xx',
    'handler_exception'
  )),
  release text not null check (release ~ '^[0-9a-f]{40}$')
);

create index if not exists observability_events_created_at_idx
  on public.observability_events (created_at desc);

alter table public.observability_events enable row level security;

-- Edge Functions insert with the service role. Browser roles have no policy
-- and no direct table privileges; authenticated browser reports go through
-- report-client-error, which rebuilds the strict event contract server-side.
revoke all on table public.observability_events from anon, authenticated;
grant all on table public.observability_events to service_role;

comment on table public.observability_events is
  'Allowlisted operational metadata only; never store user, health, request, prompt, or credential data.';
