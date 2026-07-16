# Backup, restore, and recovery inventory

Beta-safety Phase 0, PR 7 (spec: `docs/superpowers/specs/2026-07-14-beta-safety-minimum-design.md` §4).

## Verified backup status — 2026-07-16

Checked via `npx supabase backups list --project-ref <prod-ref>`:

| Capability | Status |
|---|---|
| WAL-G (provider-side physical WAL archiving) | enabled |
| PITR (point-in-time recovery) | **disabled** |
| Automated backups list | **empty — no restorable backups exist** |

**Finding (blocker):** the project runs on a plan without automated database
backups. Until a recovery path is selected and tested, external invitations
remain blocked per the Phase 0 release rule.

### Options (owner decision required)

1. **Upgrade the Supabase project to Pro** — daily automated backups,
   optional PITR add-on. Smallest operational surface; recommended.
2. **Self-managed logical dumps** — scheduled `pg_dump` to private storage.
   Requires new credentials, a scheduler outside the public repo, encryption,
   and its own restore test. More moving parts; only worth it if staying on
   the free plan is a hard constraint.

Whichever is chosen, the scratch-project restore below must be performed once
and recorded before the first invitation.

## Recovery requirements inventory

| Asset | Source of truth | Restore mechanism |
|---|---|---|
| Database schema | `supabase/migrations/` (full baseline 2026-07-10 + increments) | `supabase db push` against the new project |
| Database data | Provider backup (once enabled) / logical dump | Provider restore / `psql` import |
| Legacy pre-baseline objects (`experiments`, `treatments`, dashboard-created view DDL) | **not fully in migrations** — capture with `supabase db dump --schema public` once and commit the diff | included in dump |
| Storage | `health-photos` bucket (user photos) | bucket re-creation + object copy (no provider backup on free plan) |
| Edge Function code | git (`supabase/functions/`) | `supabase functions deploy` per `docs/guides/security-secrets-runbook.md` deploy order |
| Edge Function secrets | names in `security-secrets-runbook.md`; values only in Supabase secrets + owner's manager | `supabase secrets set` (values re-entered by owner) |
| JWT verify modes | `supabase/config.toml` (complete list) | applied on deploy |
| pg_cron jobs | migrations (`env_autosync_cron`, reminder/football/coach jobs) | re-run migrations; re-point `x-cron-secret` |
| Telegram webhook | `register-webhook` function | re-register with new URL + admin secret |
| HAE auto-sync | `ingest_tokens` rows + iPhone app config pointing at the functions URL | tokens restored with data; app URL update if ref changes |
| Scriptable widget | `widget_tokens` rows + widget script URL | same as HAE |
| Frontend | git + Vercel (env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) | update Vercel env to the new project ref |

## Scratch-project restore procedure

Use synthetic or approved non-production data only; never restore personal
health records into a shared scratch project.

1. Create a scratch Supabase project (different ref than production).
2. `supabase db push` from a clean checkout of the reviewed commit.
3. Create the `health-photos` bucket (private) and apply its owner policies
   (migration `20260716120000_health_photos_owner_policies.sql` covers this).
4. Set required function secrets with scratch values; deploy Edge Functions in
   the runbook order (keep `--no-verify-jwt` for `ingest-health`).
5. Run the automated smoke:

   ```bash
   SECURITY_MATRIX_SUPABASE_URL=https://<scratch-ref>.supabase.co \
   SECURITY_MATRIX_SERVICE_ROLE_KEY=<scratch service key> \
   node scripts/security/restore-verify.mjs
   ```

   It refuses the production ref and checks: schema surfaces exist for every
   inventory table/view/RPC, anonymous access is denied on protected tables,
   auth sign-up works, ingest accepts a fixture token payload path shape, and
   consent + deletion RPCs are callable.
6. Run the PR 2 negative matrix and the PR 6 deletion verification against the
   same scratch project.
7. Record a dated restore log (template below) in the PR or issue — never
   include personal production data or secret values.

### Restore log template

```
date: YYYY-MM-DD
operator: <name>
source commit: <sha>
scratch ref: <ref>
migrations applied: ok/fail
functions deployed: <list>
restore-verify.mjs: ok/fail
negative matrix: ok/fail
deletion verification: ok/fail
notes: <deviations>
```

## Credential and session rotation checklist

Historical browser-profile/session material and three keys were removed from
git history on 2026-07-11 (see memory of `secrets-history-rewrite`); the repo
became public 2026-07-15. Verify privately and record **name, status, date,
owner — never the value**:

| Credential family | Where used | Status | Verified date | Owner |
|---|---|---|---|---|
| Supabase service-role key | Edge Functions env | ☐ rotated / ☐ confirmed unexposed | | owner |
| Supabase anon key | frontend env (public by design) | ☐ n/a | | owner |
| Gemini API key | Edge Functions env | ☐ rotated | | owner |
| Telegram bot token | BotFather / functions env | ☐ rotated | | owner |
| Telegram webhook secret | functions env | ☐ rotated | | owner |
| Cron/admin secrets (`TONUS_CRON_SECRET`, `TONUS_ADMIN_SECRET`) | functions env + pg_cron | ☐ rotated | | owner |
| cal.beskarstaff.com session cookies | `cal_sync` | ☐ re-issued | | owner |
| Browser-profile sessions (Telegram Web, Google, Supabase dashboard) | removed `claude-monitor/browser-profile/` | ☐ signed out everywhere / re-authed | | owner |
| GitHub PATs / deploy hooks | CI + Vercel | ☐ confirmed scoped | | owner |

Rotation of `TONUS_INTERNAL_SECRET` / `TONUS_ALLOWED_ORIGINS` (added in PR 3)
is covered in `docs/guides/abuse-controls.md`.
