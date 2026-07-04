# Football Match Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the MVP from `docs/specs/football_match_reminders_spec.md`: sync World Cup fixtures, create due reminders, send Telegram messages, and save watch responses from inline buttons.

**Architecture:** Use Supabase SQL as the durable scheduler state, Supabase Edge Functions for provider sync and Telegram sending, and the existing `telegram-bot` function for callback/command handling. Keep reusable football mapping, formatting, and callback parsing in `supabase/functions/_shared/football.ts` so it can be tested with Vitest without Deno network/runtime concerns.

**Tech Stack:** Supabase Postgres, Supabase Edge Functions on Deno, Telegram Bot API, API-Football/API-SPORTS, Vitest for pure shared logic.

## Global Constraints

- Node 24 is required for build/lint/dev: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"`.
- Edge functions use `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, and for sync `API_FOOTBALL_KEY`.
- API-Football key must stay server-only.
- Telegram callback data must stay under 64 bytes, using `fw:<short_id>:yes|no`.
- Do not touch unrelated dirty files such as `claude-monitor/data/*`.

---

### Task 1: Shared Football Logic

**Files:**
- Create: `supabase/functions/_shared/football.ts`
- Test: `supabase/functions/_shared/football.test.ts`

**Interfaces:**
- Produces: `mapApiFootballFixture(fixture): FootballMatchUpsert`
- Produces: `parseFootballCallback(data): { shortId: string; response: 'watching' | 'not_watching' } | null`
- Produces: `buildFootballReminderText(reminder, now?, locale?, timeZone?): string`
- Produces: `buildFootballReminderKeyboard(shortId): { inline_keyboard: ... }`

- [ ] Write failing tests for fixture mapping, callback parsing, keyboard callback data, and Berlin reminder text.
- [ ] Run: `npm test -- supabase/functions/_shared/football.test.ts`; expected fail because module does not exist.
- [ ] Implement the minimal shared module.
- [ ] Re-run the same test; expected pass.

### Task 2: Database Schema And RPC

**Files:**
- Create: `supabase/football-reminders.sql`

**Interfaces:**
- Produces tables: `football_matches`, `football_user_settings`, `football_match_reminders`, `football_match_responses`
- Produces RPCs: `generate_football_reminders()`, `claim_due_football_reminders()`, `mark_football_reminder_sent(uuid,bigint)`, `mark_football_reminder_failed(uuid,text)`

- [ ] Add enum/types/tables/indexes with `short_id` for compact Telegram callbacks.
- [ ] Add `generate_football_reminders()` that inserts pending reminders for active users and updates existing pending reminders when kickoff time changes.
- [ ] Add `claim_due_football_reminders()` that atomically changes `pending` to `processing` using `for update skip locked`.
- [ ] Add sent/failed marker RPCs.
- [ ] Add pg_cron entries for sync every 30 minutes and sender every 5 minutes.

### Task 3: Sync Edge Function

**Files:**
- Create: `supabase/functions/sync-football-fixtures/index.ts`
- Modify: `supabase/config.toml`

**Interfaces:**
- Consumes: `mapApiFootballFixture`
- Consumes RPC: `generate_football_reminders()`

- [ ] Implement request guard using `x-cron-secret` when `FOOTBALL_INTERNAL_SECRET` is set.
- [ ] Fetch `https://v3.football.api-sports.io/fixtures?league=1&season=2026&from=<today>&to=<today+30d>`.
- [ ] Upsert mapped fixtures on `provider_fixture_id`.
- [ ] Cancel pending reminders for `PST`, `CANC`, `ABD`.
- [ ] Call `generate_football_reminders()`.

### Task 4: Send Edge Function

**Files:**
- Create: `supabase/functions/send-football-reminders/index.ts`
- Modify: `supabase/config.toml`

**Interfaces:**
- Consumes: `buildFootballReminderText`, `buildFootballReminderKeyboard`
- Consumes RPCs: `claim_due_football_reminders()`, `mark_football_reminder_sent`, `mark_football_reminder_failed`

- [ ] Implement request guard using `x-cron-secret` when `FOOTBALL_INTERNAL_SECRET` is set.
- [ ] Claim due reminders.
- [ ] Send Telegram messages with HTML parse mode and inline keyboard.
- [ ] Mark sent with Telegram `message_id`, or failed with response body/error.

### Task 5: Telegram Callback And Commands

**Files:**
- Modify: `supabase/functions/telegram-bot/index.ts`

**Interfaces:**
- Consumes: `parseFootballCallback`
- Consumes tables: `football_matches`, `football_user_settings`, `football_match_responses`

- [ ] Add `/football`, `/matches`, `/football_on`, and `/football_off`.
- [ ] Add `fw:<short_id>:yes|no` callback branch.
- [ ] Upsert watch responses and edit the original Telegram message to remove buttons.
- [ ] Keep existing supplement and wellbeing callback behavior unchanged.

### Task 6: Verification

**Files:**
- No production edits.

- [ ] Run: `npm test -- supabase/functions/_shared/football.test.ts`
- [ ] Run: `npm test`
- [ ] Run: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" && npm run build`
- [ ] Run a targeted diff review: `git diff -- supabase/functions/_shared/football.ts supabase/functions/_shared/football.test.ts supabase/football-reminders.sql supabase/functions/sync-football-fixtures/index.ts supabase/functions/send-football-reminders/index.ts supabase/functions/telegram-bot/index.ts supabase/config.toml`

## Known MVP Gaps

- No favorite-team filtering; `watch_all_worldcup = true` is the only targeting mode.
- No user-facing web settings screen for football reminders.
- No post-send reschedule notification for already-sent reminders when a match moves; pending reminders are corrected.
