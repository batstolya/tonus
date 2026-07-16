# Security inventory and isolated negative matrix

Tonus keeps a deterministic inventory of every public data/auth surface in
`security/inventory.generated.json`. It is generated from:

- `src/lib/database.types.ts` for public tables, views, and RPCs;
- Edge Function directories and `supabase/config.toml` for function names and
  effective JWT gateway modes;
- function source for current CORS and AI-budget controls;
- `security/inventory-classification.json` for reviewed auth owners,
  credential classes, Storage buckets, and data sensitivity.

The current artifact covers 52 tables, 2 views, 8 RPCs, 1 private Storage
buckets, and 22 Edge Functions. A new or removed schema/function surface, a JWT
mode change, a CORS change, a budget-control change, or stale/missing reviewed
classification fails CI.

## Commands

Generate after an intentional surface change:

    npm run security:inventory:generate

Review the JSON diff, then verify it is deterministic:

    npm run security:inventory:check

CI runs the check but never regenerates the reviewed artifact automatically.

## Findings

The generator also checks that service-only RPC signatures have an explicit
`REVOKE ... FROM PUBLIC, anon, authenticated`. The current branch records four
high findings for football worker RPCs and links their remediation to PR #77.
They are recorded rather than silently treated as fixed; until #77 is merged,
applied, and live permissions are rechecked, the Phase 0 safety gate is open.

## Isolated negative-read runner

`npm run security:matrix` is intentionally not a production command. Before
creating a Supabase client or synthetic user, it reads the linked production
project ID from `supabase/config.toml` and refuses that target. It accepts only
localhost or a different `*.supabase.co` project.

Required environment variables:

    SECURITY_MATRIX_SUPABASE_URL=https://<scratch-ref>.supabase.co
    SECURITY_MATRIX_ANON_KEY=<scratch-anon-key>
    SECURITY_MATRIX_SERVICE_ROLE_KEY=<scratch-service-role-key>

Run against a disposable project whose schema/functions match the reviewed
commit:

    npm run security:matrix

The runner:

- creates two synthetic `example.invalid` users and always deletes them;
- seeds non-personal canaries in profiles/ideas/context notes;
- requires user A to read those canaries and its own Storage object as positive
  controls before accepting foreign-read denial;
- checks anonymous and user-B reads of every protected table/view for user A;
- uploads synthetic objects to each private bucket and checks cross-user list
  and download denial;
- sends missing/invalid credentials to every `verify_jwt=false` function in the
  isolated project and requires denial before side effects;
- prints aggregate counts only, never credentials, response bodies, user IDs,
  or object paths.

## Evidence boundary

This runner provides broad negative-read and custom-auth evidence. It does not
yet claim a valid INSERT/UPDATE/DELETE fixture for every one of the 52 tables;
many surfaces have required foreign keys and domain constraints, so a malformed
write would prove validation rather than RLS. The existing targeted chat and
Telegram-token smokes cover the highest-risk cross-user write boundaries.

The complete all-table CRUD fixture matrix and live Storage/function receipt
remain pending an isolated Supabase project (or local Docker). Never substitute
production for that missing environment. This PR changes no production
behavior and must not be described as full Phase 0 acceptance until that
evidence exists.
