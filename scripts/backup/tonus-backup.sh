#!/bin/bash
# Nightly encrypted logical backup of the Tonus production database.
#
# Runs via launchd (see scripts/backup/com.tonus.backup.plist). Uses native
# pg_dump (brew libpq) with a connection URL stored only in the macOS
# Keychain — no Docker required (supabase CLI's `db dump` needs Docker).
#
# One-time setup (owner):
#   brew install libpq
#   security add-generic-password -s tonus-db-url -a tonus \
#     -w "postgresql://postgres.<ref>:<DB_PASSWORD>@<pooler-host>:5432/postgres"
#   security add-generic-password -s tonus-backup-key -a tonus -w "$(openssl rand -hex 32)"
#
# Output: $BACKUP_DIR/tonus-YYYY-MM-DD_HHMMSS.tar.gz.enc
#   - public.sql     (public schema: DDL + data, owner/privilege-free)
#   - auth_data.sql  (auth schema data — user accounts; best-effort)
# Encryption: AES-256-CBC (pbkdf2), key in Keychain item "tonus-backup-key".
# Retention: last $KEEP archives (default 30).
#
# Restore (see docs/guides/backup-restore.md for the full procedure):
#   security find-generic-password -s tonus-backup-key -w > /tmp/key
#   openssl enc -d -aes-256-cbc -pbkdf2 -pass file:/tmp/key \
#     -in tonus-<stamp>.tar.gz.enc | tar xz

set -euo pipefail

BACKUP_DIR="${TONUS_BACKUP_DIR:-$HOME/TonusBackups}"
KEEP="${TONUS_BACKUP_KEEP:-30}"
KEY_ITEM="tonus-backup-key"
URL_ITEM="tonus-db-url"
PG_DUMP="${TONUS_PG_DUMP:-/opt/homebrew/opt/libpq/bin/pg_dump}"

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

[ -x "$PG_DUMP" ] || fail "pg_dump not found at $PG_DUMP (brew install libpq)"

KEY="$(security find-generic-password -s "$KEY_ITEM" -w 2>/dev/null)" \
  || fail "encryption key '$KEY_ITEM' not found in Keychain"
DB_URL="$(security find-generic-password -s "$URL_ITEM" -w 2>/dev/null)" \
  || fail "connection URL '$URL_ITEM' not found in Keychain"

log "dump started"

# Public schema: DDL + data, portable into a fresh project.
"$PG_DUMP" "$DB_URL" --schema public --no-owner --no-privileges \
  --quote-all-identifiers -f "$WORK/public.sql" 2>> "$LOG" \
  || fail "public schema dump failed"
[ -s "$WORK/public.sql" ] || fail "public.sql is empty"

# Auth schema data (user accounts). Best-effort: schema layout is managed
# by the platform, so only rows are captured; a permission change on the
# managed schema must not kill the whole backup.
if ! "$PG_DUMP" "$DB_URL" --schema auth --data-only --quote-all-identifiers \
  -f "$WORK/auth_data.sql" 2>> "$LOG"; then
  log "WARN: auth schema dump failed, archive has public schema only"
  : > "$WORK/auth_data.sql"
fi

ARCHIVE="$BACKUP_DIR/tonus-$STAMP.tar.gz.enc"
tar -czf - -C "$WORK" public.sql auth_data.sql \
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
