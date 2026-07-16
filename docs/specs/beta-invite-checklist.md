# Beta invite gate — remaining checklist

Status snapshot 2026-07-16. Companion to the Phase 0 spec
(`docs/superpowers/specs/2026-07-14-beta-safety-minimum-design.md`).
**Do not send the first invitation until every blocker below is checked.**

## Done (Phase 0 core, all merged + deployed + smoked 2026-07-16)

- [x] PR 0–2, 4, 5 — auth fix, governance, negative matrix, consent, observability (#63, #72–#79)
- [x] PR 3 (#81) — internal auth (`x-internal-secret`), CORS allowlist, durable rate limits
- [x] PR 3b (#84) — service-role bearer path removed; smoke: service-role-as-bearer → 401
- [x] PR 6 (#82) — complete account deletion (`delete-account` fn + `delete_user_data` RPC)
- [x] PR 7 (#83, #85, #86) — recovery docs + nightly encrypted backups
- [x] Backups running: native pg_dump, AES-256, launchd nightly 09:30,
      first archive verified (decrypts; public 126 MB + auth rows)
- [x] Owner smoke: Telegram `/report` works end-to-end on the new secret

## Blockers before the first invite

- [ ] **Restore test on a scratch project** — prove an archive restores into a
      working database. Owner creates a second free Supabase project; then run
      the procedure in `docs/guides/backup-restore.md` (§ scratch-project
      restore) + `scripts/security/restore-verify.mjs`, and record the restore
      log per the template there.
- [ ] **Keychain items exported to the owner's password manager** —
      `tonus-backup-key` (AES key; without it backups are undecryptable if the
      Mac is lost) and the database password (`tonus-db-url`).

## Strongly recommended (not hard blockers)

- [ ] PR 8 — Playwright user journeys (needs the same scratch project)
- [ ] Credential rotation checklist ticked (`docs/guides/backup-restore.md`,
      § rotation) — verify names/status privately
- [ ] Monthly habit: copy one archive from `~/TonusBackups` offsite
      (iCloud Drive is fine — archives are encrypted)
- [ ] Revisit Supabase Pro (managed daily backups + PITR) once real users
      accumulate; the free pg_dump path loses up to one day in the worst case
