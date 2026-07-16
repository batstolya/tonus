# Telegram Link Token RLS Emergency Hardening

- **Date:** 2026-07-15
- **Status:** Approved under the owner's advance security authorization
- **Discovery:** live catalog inventory plus a two-user synthetic exploit probe

## Problem

`telegram_link_tokens` contains short-lived credentials that bind a Tonus user
to a Telegram chat. Production had RLS disabled while `anon` and
`authenticated` retained table privileges. A signed-in attacker could read a
victim's token and use `/start <token>` to redirect the victim's Telegram link.

The exploit was reproduced only with two synthetic Auth users and one synthetic
token. The attacker read the victim token successfully; all fixtures were then
hard-deleted and verified absent. No real token or user row was read.

## Selected design

An append-only migration:

- enables RLS on `public.telegram_link_tokens`;
- revokes every table privilege from `anon`;
- replaces broad authenticated privileges with `SELECT`, `INSERT`, and
  `DELETE` only;
- permits those three operations only when `auth.uid() = user_id`;
- leaves `service_role` access unchanged for `telegram-bot`.

Update is intentionally unavailable: a token is replaced, not mutated. The
frontend's current direct insert remains supported, and the bot continues to
consume and delete tokens through its service-role client.

## Verification and release

Static tests reject a migration that omits RLS, least-privilege grants, or any
owner predicate. The production smoke uses only synthetic accounts and proves:

1. anonymous reads are denied;
2. an attacker cannot select a victim token;
3. an attacker cannot delete a victim token;
4. an attacker cannot insert a token for the victim;
5. the attacker can insert, read, and delete its own token;
6. both Auth users and all synthetic rows are absent after cleanup.

The migration is applied only after a linked-schema type check, migration
dry-run, clean exact-SHA review, and full repository gate.

## Rollback

Never disable RLS or restore anonymous access. If the legitimate frontend flow
breaks, forward-fix the narrow authenticated policy or grant required by the
observed request while preserving `auth.uid() = user_id`.
