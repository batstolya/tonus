-- These SECURITY DEFINER workers operate across users and are called only by
-- trusted Edge Functions with the service role. PostgreSQL grants EXECUTE on
-- new functions to PUBLIC by default, so granting service_role alone is not a
-- restriction: the public grants must be revoked explicitly.

revoke all on function public.generate_football_reminders()
  from public, anon, authenticated;
revoke all on function public.claim_due_football_reminders()
  from public, anon, authenticated;
revoke all on function public.mark_football_reminder_sent(uuid, bigint)
  from public, anon, authenticated;
revoke all on function public.mark_football_reminder_failed(uuid, text)
  from public, anon, authenticated;

grant execute on function public.generate_football_reminders()
  to service_role;
grant execute on function public.claim_due_football_reminders()
  to service_role;
grant execute on function public.mark_football_reminder_sent(uuid, bigint)
  to service_role;
grant execute on function public.mark_football_reminder_failed(uuid, text)
  to service_role;
