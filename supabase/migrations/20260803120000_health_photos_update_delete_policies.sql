-- The health-photos bucket carried insert and select policies only
-- (20260716120000). That is enough to upload a new object and read it back, but
-- not to overwrite or remove one, so a profile photo could be set once and then
-- never replaced or deleted — the first upload succeeds and every later one
-- fails on permissions.
--
-- Same owner scoping as the existing pair: object paths are `${userId}/...`, so
-- the first folder is the owner id. Cross-user access stays denied because no
-- policy matches a foreign path. update needs both using (which rows may be
-- targeted) and with check (what they may become), or an owner could rename an
-- object into somebody else's prefix.
--
-- Post-merge: no Edge Function deploy needed; apply this migration only.

create policy "users replace own health photos"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'health-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'health-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users delete own health photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'health-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
