-- storage.objects has RLS enabled but production carried no policies at all,
-- so every authenticated upload/read of the private health-photos bucket was
-- denied: concern and hair photo uploads (src/lib/concerns.ts) failed for the
-- object owner. Cross-user access stays denied because no policy matches a
-- foreign path. Object paths are `${userId}/...`, so the first folder is the
-- owner id.
--
-- Post-merge: no Edge Function deploy needed; apply this migration only.

create policy "users upload own health photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'health-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users read own health photos"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'health-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
