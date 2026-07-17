#!/bin/bash
# Daily read-only health pulse for Tonus prod. Same operating pattern as
# scripts/backup/tonus-backup.sh: launchd + quiet log + desktop notification
# on failure (a silently broken cron must be noticed).
#
# Checks:
#   1. frontend answers 200
#   2. telegram-bot webhook boots and stays fail-closed (401 without secret)
#   3. Apple Health auto-sync is fresh (ingest_tokens.last_ingest_at < 48h)
#   4. newest backup archive < 36h old
#
# Spec: docs/superpowers/specs/2026-07-17-prod-healthcheck-design.md
# Install: cp scripts/healthcheck/com.tonus.healthcheck.plist ~/Library/LaunchAgents/
#          launchctl load ~/Library/LaunchAgents/com.tonus.healthcheck.plist

set -uo pipefail

SITE_URL="${TONUS_SITE_URL:-https://tonus-anatolii-s-projects6.vercel.app}"
FUNCTIONS_URL="${TONUS_FUNCTIONS_URL:-https://mxnmubakfzqoosgsqmhh.supabase.co/functions/v1}"
BACKUP_DIR="${TONUS_BACKUP_DIR:-$HOME/TonusBackups}"
# Service key lives in claude-monitor/.env (local only, not in git).
MONITOR_ENV="${TONUS_MONITOR_ENV:-$(cd "$(dirname "$0")/../.." && pwd)/claude-monitor/.env}"
LOG="$BACKUP_DIR/healthcheck.log"
INGEST_MAX_AGE_H=48
BACKUP_MAX_AGE_H=36

mkdir -p "$BACKUP_DIR"
log() { echo "[$(date '+%F %T')] $*" >> "$LOG"; }

FAILURES=()

# 1. Frontend
code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$SITE_URL" || echo 000)"
[ "$code" = "200" ] || FAILURES+=("site $code (want 200)")

# 2. Edge functions: boot + fail-closed. 401 is the ONLY healthy answer.
code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 -X POST \
  "$FUNCTIONS_URL/telegram-bot" -H 'Content-Type: application/json' \
  -d '{"update_id":0}' || echo 000)"
[ "$code" = "401" ] || FAILURES+=("telegram-bot probe $code (want 401)")

# 3. Auto-sync freshness (best-effort: skip with a log line if env is missing).
if [ -f "$MONITOR_ENV" ]; then
  # shellcheck disable=SC1090
  source "$MONITOR_ENV"
  if [ -n "${SUPABASE_URL:-}" ] && [ -n "${SUPABASE_SERVICE_KEY:-}" ]; then
    last="$(curl -s --max-time 30 \
      "$SUPABASE_URL/rest/v1/ingest_tokens?select=last_ingest_at&last_ingest_at=not.is.null&order=last_ingest_at.desc.nullslast&limit=1" \
      -H "apikey: $SUPABASE_SERVICE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
      | sed -n 's/.*"last_ingest_at":"\([^"]*\)".*/\1/p')"
    if [ -z "$last" ]; then
      FAILURES+=("ingest freshness unreadable")
    else
      last_epoch="$(date -j -u -f '%Y-%m-%dT%H:%M:%S' "${last%%.*}" +%s 2>/dev/null || echo 0)"
      age_h=$(( ($(date +%s) - last_epoch) / 3600 ))
      [ "$last_epoch" != "0" ] && [ "$age_h" -le "$INGEST_MAX_AGE_H" ] \
        || FAILURES+=("auto-sync stale: last ingest ${age_h}h ago (max ${INGEST_MAX_AGE_H}h)")
    fi
  else
    log "SKIP ingest check: SUPABASE_URL/SUPABASE_SERVICE_KEY not in $MONITOR_ENV"
  fi
else
  log "SKIP ingest check: $MONITOR_ENV not found"
fi

# 4. Backup freshness
newest="$(ls -t "$BACKUP_DIR"/tonus-*.tar.gz.enc 2>/dev/null | head -1)"
if [ -z "$newest" ]; then
  FAILURES+=("no backup archives in $BACKUP_DIR")
else
  age_h=$(( ($(date +%s) - $(stat -f %m "$newest")) / 3600 ))
  [ "$age_h" -le "$BACKUP_MAX_AGE_H" ] \
    || FAILURES+=("backups stale: newest archive ${age_h}h old (max ${BACKUP_MAX_AGE_H}h)")
fi

if [ "${#FAILURES[@]}" -gt 0 ]; then
  msg="$(IFS='; '; echo "${FAILURES[*]}")"
  log "FAIL: $msg"
  osascript -e "display notification \"$msg\" with title \"Tonus healthcheck FAILED\"" 2>/dev/null || true
  exit 1
fi

log "OK: site 200, functions 401-closed, ingest fresh, backup fresh"
