# Complete account deletion

Beta-safety PR 6 (spec: `docs/superpowers/specs/2026-07-14-beta-safety-minimum-design.md` §4).

## Flow

Settings → "Delete account" danger zone → the user enters their password and
types `DELETE` → `delete-account` Edge Function:

1. **Auth:** gateway `verify_jwt = true` plus `auth.getUser()` in the handler.
2. **Abuse guard:** durable rate limit `delete-account:<user id>`, 5 attempts
   per hour (protects the password check from brute force).
3. **Recent re-authentication:** the password is verified server-side with a
   fresh `signInWithPassword`; failure → 403, zero side effects.
4. **Deletion order (load-bearing):**
   1. Storage: every object under `health-photos/<user id>/…` (recursive list).
   2. Rows: `public.delete_user_data(p_user_id)` — explicit `DELETE` for every
      user-owned table from the security inventory, children before parents,
      `profiles` last. Returns per-table counts only.
   3. Auth account: `auth.admin.deleteUser` — revokes sessions and refresh
      tokens; the login can never be reused.

Any failure aborts **before** the auth account is removed, so the flow can be
retried with the same credentials. After success the JWT is invalid and any
repeat returns 401 — repeating deletion is safe and cannot restore state.

Tokens and integration credentials (`ingest_tokens`, `widget_tokens`,
`telegram_links`, `telegram_link_tokens`, `cal_sync`) are user-owned rows and
are deleted by the RPC, which is what invalidates HAE auto-sync, the iPhone
widget, and the Telegram link.

## Inventory guard

`scripts/delete-user-data-coverage.test.mjs` (runs in `npm run test:scripts`
and CI) asserts every `exposure: "user-owned"` table in
`security/inventory.generated.json` has a `delete from public.<table> where
user_id = p_user_id` statement in the `delete_user_data` migration. Adding a
user-owned table without extending the RPC fails CI. The deletion list lives
in reviewed SQL — never in UI code.

Export safety: `src/lib/exportData.inventory.test.ts` asserts the export reads
only user-owned tables/views, never service-only ones.

## Isolated end-to-end verification

`scripts/security/account-deletion-verify.mjs` runs against a scratch project
only (`assertIsolatedTarget` refuses the production ref):

```bash
SECURITY_MATRIX_SUPABASE_URL=https://<scratch-ref>.supabase.co \
SECURITY_MATRIX_SERVICE_ROLE_KEY=<scratch service key> \
node scripts/security/account-deletion-verify.mjs
```

It creates a fixture user, seeds every user-owned table and one storage
object, performs the deletion steps, then proves zero residue: every table
returns no rows for the user, the storage prefix is empty, and sign-in fails.

## Rollback

There is none by design — deletion is irreversible. Operational rollback is
limited to disabling the Settings entry point; never bypass the password check
or the confirmation word.
