# Complete Account Deletion Implementation Plan (PR 6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Settings flow that, after password re-authentication and explicit confirmation, irreversibly deletes every user-owned record, Storage object, token, and the auth account itself — with an inventory-driven guard so new tables cannot silently escape deletion.

**Architecture:** One SECURITY DEFINER RPC `delete_user_data(p_user_id)` explicitly deletes rows from every user-owned table in the generated security inventory (FK cascades stay as backup, not the mechanism). A new `delete-account` Edge Function (gateway `verify_jwt=true`) verifies the user JWT, re-verifies the password server-side via `signInWithPassword`, rate-limits attempts, then runs storage cleanup → RPC → `auth.admin.deleteUser` (auth account last, so a failed run can be retried). A static guard test fails CI when an inventory user-owned table is missing from the RPC migration. UI is a new Settings danger-zone section.

**Tech Stack:** Deno Edge Function reusing PR 3 `_shared/cors.ts` + `_shared/rateLimit.ts` (branch stacks on `feat/internal-auth-abuse-controls`), pure `_shared/accountDeletion.ts` (vitest), Postgres migration, React Settings section with i18n (ru/uk/en).

**Spec:** `docs/superpowers/specs/2026-07-14-beta-safety-minimum-design.md` §4 "PR 6".

---

## Design decisions locked here

- **Recent re-authentication:** the request body carries the account password; the function verifies it server-side with a fresh `signInWithPassword` against the user's email (fetched via admin API). Wrong/missing password → 403 before any side effect. A durable rate limit `delete-account:<user id>` (5/hour) prevents password brute-force through this endpoint.
- **Explicit destructive confirmation:** body must carry `confirm: 'DELETE'` (UI requires typing the word); anything else → 400.
- **Deletion order:** Storage objects (`health-photos/<userId>/…`) → `delete_user_data` RPC (child tables before parents) → `auth.admin.deleteUser`. Any failure aborts before the auth user is removed, so the flow is safely repeatable; after success the JWT is invalid and repeats return 401.
- **Inventory guard:** `scripts/security/delete-user-data-coverage.test.mjs` asserts every `exposure: "user-owned"` table in `security/inventory.generated.json` appears as a `delete from public.<table>` statement in the `delete_user_data` migration SQL (profiles matches on `id`). New user-owned tables then fail CI until the RPC migration is extended — the table list lives in reviewed SQL, not UI code.
- **Export stays untouched;** a new static test asserts `exportAllJSON`'s table list contains no service-only inventory table.
- **Legacy tables:** `experiments` and `treatments` predate the migration baseline and their `auth.users` FK cascade is unverified — explicit RPC deletes cover them regardless.
- **Migration version:** `20260716140000_delete_user_data.sql` (after `20260716130000_rate_limit_counters.sql`).

---

### Task 1: Migration — `delete_user_data` RPC + coverage guard test

**Files:**
- Create: `supabase/migrations/20260716140000_delete_user_data.sql`
- Create: `scripts/security/delete-user-data-coverage.test.mjs` (picked up by `npm run test:scripts` if it globs `scripts/**`; otherwise place as `scripts/delete-user-data-coverage.test.mjs` next to the other `node --test` files)

- [ ] **Step 1: Write the failing guard test** — reads inventory user-owned tables, reads all migration SQL, asserts `delete from public.<t>` (or `where id = p_user_id` for profiles) present for each, and asserts the RPC has the standard revoke + service_role grant.
- [ ] **Step 2: Run it** → FAIL (migration missing).
- [ ] **Step 3: Write the migration** — `create or replace function public.delete_user_data(p_user_id uuid) returns jsonb`, `security definer set search_path = public`, deleting children before parents:
  chat_messages → chat_sessions; goal_progress → goals; concern_logs → health_concerns; supplement_logs, intake_events → supplements; lab_results → lab_files; football_match_responses, football_match_reminders, football_user_settings; then all remaining flat tables; profiles (`where id = p_user_id`) last. Returns jsonb of per-table deleted counts (no personal data). Revoke public/anon/authenticated; grant execute to service_role.
- [ ] **Step 4: Guard test passes.** **Step 5: Commit.**

### Task 2: `_shared/accountDeletion.ts` (pure orchestrator)

**Files:** Create `supabase/functions/_shared/accountDeletion.ts` + `accountDeletion.test.ts`.

- [ ] Failing tests: `isValidDeletionConfirmation` accepts only `'DELETE'`; `deleteAccount(deps, userId)` calls deps in order storage→rows→auth, aborts (returns `{ ok: false, stage }`) without `deleteAuthUser` when storage listing/removal or the RPC fails, returns `{ ok: true, tables }` on success; storage removal iterates every listed object path under the user prefix, including nested folders.
- [ ] Implement with injected deps `{ listUserObjects, removeObjects, deleteUserRows, deleteAuthUser }`, all failures fail closed. Run tests → PASS. Commit.

### Task 3: `delete-account` Edge Function

**Files:** Create `supabase/functions/delete-account/index.ts`; modify `supabase/config.toml` (explicit `verify_jwt = true`).

- [ ] Handler: allowlist CORS; POST only; `auth.getUser(jwt)` → user; durable rate limit `delete-account:<user id>` 5/3600s (before password check); body `{ password, confirm }`; `confirm !== 'DELETE'` → 400; fresh anon client `signInWithPassword({ email, password })` → failure 403; then `deleteAccount()` with real deps (storage list+remove on `health-photos`, RPC `delete_user_data`, `auth.admin.deleteUser`). Success → `{ deleted: true }`; partial failure → 500 with stage name only.
- [ ] `npm run check:functions` ≤ ceiling. Commit.

### Task 4: Settings UI section + i18n

**Files:** Create `src/components/settings/sections/DeleteAccountSection.tsx` + test; wire into `SettingsScreen.tsx`; add strings to the i18n domain files (ru/uk/en).

- [ ] jsdom test: delete button disabled until the confirmation word and password are entered; successful call signs out; error path shows the message and keeps the account.
- [ ] Component: danger-zone card, warning copy (export nudge → points at the existing Export section), password field (`type="password"`), text input requiring `DELETE`, calls `callFunction('delete-account', { password, confirm })`, on success `supabase.auth.signOut()` + `location.assign('/')`.
- [ ] Demo mode: section renders but the button explains deletion is unavailable in demo.
- [ ] Commit.

### Task 5: Inventory, export guard, docs

- [ ] Classification: `delete-account` edge function (`gateway:user-jwt`, cors `allowlist`, rateLimit `durable`, sensitivity `health`); RPC `delete_user_data(uuid)` service-role. Regenerate inventory; `check-security-inventory` green.
- [ ] Export guard test: `exportAllJSON` table list ∩ service-only inventory tables = ∅.
- [ ] `docs/guides/account-deletion.md`: flow, ordering, guard, isolated verification script usage, "repeat is safe" semantics.
- [ ] Commit.

### Task 6: Isolated end-to-end deletion verification script (env-gated, not CI)

**Files:** Create `scripts/security/account-deletion-verify.mjs` (+ reuse `assertIsolatedTarget`).

- [ ] Refuses production ref; against `SECURITY_MATRIX_SUPABASE_URL` + service key: creates a fixture user, seeds one row into every user-owned table (minimal valid columns from `database.types.ts`), uploads one storage object, invokes deletion deps directly (RPC + storage + admin delete), then asserts every table returns zero rows for the user, storage prefix is empty, and sign-in fails.
- [ ] Commit. (Run recorded when a scratch project is available — same gate as the PR 2 negative matrix.)

### Task 7: Full gate + PR

- [ ] Full Phase 0 gate (vitest, build, lint:ceiling, check:functions, test:scripts, test:readme, test:e2e — `VITE_DEMO=0` locally).
- [ ] Branch `feat/account-deletion` (stacked on `feat/internal-auth-abuse-controls`), PR titled `feat(privacy): complete account deletion`, note the PR 3 dependency and the deploy checklist (migration `delete_user_data`, deploy `delete-account`, smoke: wrong password 403, wrong confirm 400, rate limit 429 after 5 tries).

## Acceptance mapping (spec §4 PR 6)

- Re-auth + explicit confirmation → Task 3 (password verify + `confirm: 'DELETE'`).
- Every owned surface deleted per inventory → Task 1 RPC + coverage guard; Storage + tokens are user-owned rows/objects covered by RPC and storage cleanup.
- Sessions revoked / credentials unusable → `auth.admin.deleteUser` (JWT invalid, sign-in impossible); ingest/widget/telegram tokens deleted as rows.
- Export intact, excludes internal secrets → Task 5 export guard.
- Full fixture deletion test → Task 6 (isolated project, same env gate as PR 2 matrix).
- Repeat deletion safe → orchestrator ordering (auth account last) + 401 after completion.
