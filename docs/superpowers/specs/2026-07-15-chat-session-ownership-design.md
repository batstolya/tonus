# Chat Session Ownership Emergency Hardening

- **Date:** 2026-07-15
- **Status:** Approved under the owner's advance authorization; implementation in progress
- **Parent:** `2026-07-14-beta-safety-minimum-design.md`, rule: active security and privacy failures are never deferred

## Problem

Two service-role chat consumers bypass database RLS and previously trusted a
stored or caller-supplied session UUID without proving that the authenticated
user owns that session:

- `chat-health` accepted a browser `sessionId` and loaded history by session;
- `telegram-bot` accepted `telegram_links.tg_session_id`, a field the linked
  user can update under the current RLS policy, and loaded history by session.

Knowing another session UUID could therefore expose or influence another
user's health-chat context. The first smoke design used the AI budget as a
no-egress sentinel, but the shared budget guard is not a suitable release
oracle because its existing database-read behavior belongs to every AI
function, not only these two chat consumers.

## Selected design

One shared ownership module validates canonical UUIDs and performs all
service-role session lookups with both `chat_sessions.id` and
`chat_sessions.user_id`.

- The browser endpoint returns the same `404` for a foreign or missing supplied
  session before budget, health-data, or Gemini access. It creates a session
  only when no session was supplied.
- Telegram treats a missing, malformed, deleted, or foreign stored session as
  stale state and creates a fresh session owned by the linked user. It never
  reveals why the stored ID was rejected.
- Both consumers load history with `session_id + user_id`, write messages with
  the authenticated `user_id`, and scope mutable session/link updates by the
  same owner.
- Both handlers enforce a 4,096-character input boundary immediately after
  ownership resolution. The positive smoke control uses oversized synthetic
  input and therefore stops before budget, health data, message writes, tools,
  classifiers, or Gemini without changing shared AI behavior.

No database migration is required. A composite database constraint may be
considered later as defense in depth after the generated inventory; it is not a
substitute for explicit authorization in service-role code.

## Verification and release

Unit tests prove the exact service-role query chains, Telegram stale-session
replacement, owner-scoped history, caller headers, and input boundary. The
`chat-health` production smoke creates two synthetic users and owned sessions
and proves:

1. missing and malformed authorization are denied;
2. the browser's `Authorization + apikey` shape reaches the handler;
3. a foreign session returns `404`;
4. an attacker-owned session reaches the oversized-input stop and returns
   `413`, proving the endpoint is not hardcoded to reject every session;
5. browser CORS preflight permits the required headers;
6. both Auth users and their `profiles`, `ai_usage`, `chat_sessions`, and
   `chat_messages` rows are absent after cleanup.

The separate Telegram smoke uses the authenticated webhook path, a deliberately
impossible chat ID, and oversized synthetic input. It proves the stored foreign
session is replaced by an attacker-owned session before any classifier,
health-context, message-write, or Gemini path, while the victim session remains
unchanged. Both receipts contain only assertion identifiers and HTTP status
codes.

The reviewed commit is deployed only from a clean detached checkout through
the fail-closed wrapper. `chat-health` and `telegram-bot` use separate receipts
and exact-target smoke contracts. Telegram deployment additionally requires a
private webhook secret available to the operator; its value is never retained.

The stacked dependency change pins all 22 source entrypoints, but this emergency
release mutates only `chat-health` and `telegram-bot`. In their reachable shared
modules, the only cross-importer diff is a dependency/type-import specifier;
there is no shared executable behavior change. Both selected graphs are frozen
by `deno.lock` before deployment. The remaining functions stay on their current
live bundles until the full dependency PR stack is reviewed and merged, which
is the tracked importer rollout required by the deployment guide's narrow
emergency exception.

## Rollback

Never restore unscoped session access. If the change breaks a legitimate flow,
disable the affected AI chat path and forward-fix it. Only a version with the
ownership boundary may be redeployed.
