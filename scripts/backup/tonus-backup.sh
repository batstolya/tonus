#!/bin/bash
# Nightly encrypted logical backup of the Tonus production database.
#
# Runs via launchd (see scripts/backup/com.tonus.backup.plist). Uses the
# locally authenticated supabase CLI (login lives in the macOS Keychain),
# so no database password or service key is stored anywhere.
#
# Output: $BACKUP_DIR/tonus-YYYY-MM-DD_HHMMSS.tar.gz.enc
#   - roles.sql   (cluster roles)
#   - schema.sql  (full schema incl. dashboard-created objects)
#   - data.sql    (all rows, COPY format)
# Encryption: AES-256-CBC (pbkdf2), key in Keychain item "tonus-backup-key".
# Retention: last $KEEP archives (default 30).
#
# Restore (see docs/guides/backup-restore.md for the full procedure):
#   security find-generic-password -s tonus-backup-key -w > /tmp/key
#   openssl enc -d -aes-256-cbc -pbkdf2 -pass file:/tmp/key \
#     -in tonus-<date>.tar.gz.enc | tar xz

set -euo pipefail

REPO_DIR="${TONUS_REPO_DIR:-$HOME/tonus}"
BACKUP_DIR="${TONUS_BACKUP_DIR:-$HOME/TonusBackups}"
KEEP="${TONUS_BACKUP_KEEP:-30}"
KEYCHAIN_ITEM="tonus-backup-key"

# Node 24 (nvm) + deno paths; launchd starts with a minimal PATH.
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"

STAMP="$(date +%Y-%m-%d_%H%M%S)"
WORK="$(mktemp -d)"
LOG="$BACKUP_DIR/backup.log"
mkdir -p "$BACKUP_DIR"

log() { echo "[$(date '+%F %T')] $*" >> "$LOG"; }

fail() {
  log "FAIL: $*"
  # Surface the failure on the desktop so a silently broken cron is noticed.
  osascript -e "display notification \"$*\" with title \"Tonus backup FAILED\"" 2>/dev/null || true
  rm -rf "$WORK"
  exit 1
}

cd "$REPO_DIR" || fail "repo dir not found: $REPO_DIR"

KEY="$(security find-generic-password -s "$KEYCHAIN_ITEM" -w 2>/dev/null)" \
  || fail "encryption key '$KEYCHAIN_ITEM' not found in Keychain"

log "dump started"
npx --yes supabase db dump --linked --role-only -f "$WORK/roles.sql"  >> "$LOG" 2>&1 || fail "roles dump failed"
npx --yes supabase db dump --linked             -f "$WORK/schema.sql" >> "$LOG" 2>&1 || fail "schema dump failed"
npx --yes supabase db dump --linked --data-only --use-copy -f "$WORK/data.sql" >> "$LOG" 2>&1 || fail "data dump failed"

# Empty data dump means the dump silently produced nothing — treat as failure.
[ -s "$WORK/data.sql" ] || fail "data.sql is empty"

ARCHIVE="$BACKUP_DIR/tonus-$STAMP.tar.gz.enc"
tar -czf - -C "$WORK" roles.sql schema.sql data.sql \
  | openssl enc -aes-256-cbc -pbkdf2 -pass "pass:$KEY" -out "$ARCHIVE" \
  || fail "encryption failed"
rm -rf "$WORK"

SIZE="$(du -h "$ARCHIVE" | cut -f1)"
log "OK: $ARCHIVE ($SIZE)"

# Rotate: keep the newest $KEEP archives.
ls -t "$BACKUP_DIR"/tonus-*.tar.gz.enc 2>/dev/null | tail -n "+$((KEEP + 1))" | while read -r old; do
  rm -f "$old"
  log "rotated out: $old"
done
