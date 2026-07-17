# Prod healthcheck pulse — design

Date: 2026-07-17. Status: approved (owner delegated: "делай, что можешь без меня";
improvement #4 in the senior-level assessment).

## Problem

Failure signals today are reactive: the staleness banner needs the owner to open
the app, alert paths live server-side, and a silently broken cron (auto-sync
dead, backups stopped, functions failing to boot) can go unnoticed for days.
The nightly backup already solved this shape locally — launchd + log +
desktop notification on failure — but only for itself.

## Decision

One read-only script, same pattern as `scripts/backup/tonus-backup.sh`:

`scripts/healthcheck/tonus-healthcheck.sh`, run daily at 10:00 by launchd
(`com.tonus.healthcheck.plist`). Four checks:

1. **Frontend up** — prod URL returns HTTP 200.
2. **Edge functions alive & fail-closed** — POST to the `telegram-bot` webhook
   without the secret returns exactly **401** (proves the runtime boots the
   split-module bundle AND the auth gate holds; 500 or 200 are both failures).
3. **Auto-sync fresh** — `ingest_tokens.last_ingest_at` via PostgREST (service
   key sourced at runtime from `claude-monitor/.env`, never printed) is younger
   than 48 h.
4. **Backups running** — newest archive in `~/TonusBackups` is younger than 36 h.

Any failure → line in `~/TonusBackups/healthcheck.log` + macOS notification
("Tonus healthcheck FAILED: …") + exit 1. Success → one quiet OK log line.

## Non-goals

- Telegram alerting (bot token is a Supabase secret, not available locally;
  desktop notification matches the backup precedent and the owner's Mac-centric
  workflow).
- Uptime SLos/metrics dashboards — overkill pre-beta.
- Checking every function — one representative cold-boot probe is the signal;
  per-function health belongs to Supabase dashboard logs.

## Install (owner or agent)

```bash
cp scripts/healthcheck/com.tonus.healthcheck.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.tonus.healthcheck.plist
```
