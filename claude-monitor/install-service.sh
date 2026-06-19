#!/bin/bash
# Устанавливает монитор лимитов Claude как фоновый сервис macOS (launchd).
# После установки он автозапускается при логине, перезапускается при падении
# и через caffeinate держит Mac бодрым на зарядке даже с закрытой крышкой.
set -e

PLIST="com.tonus.claude-monitor.plist"
DST="$HOME/Library/LaunchAgents/$PLIST"
SRC="$(cd "$(dirname "$0")" && pwd)/$PLIST"

echo "→ Копирую $PLIST в LaunchAgents…"
mkdir -p "$HOME/Library/LaunchAgents"
cp "$SRC" "$DST"

echo "→ Перезагружаю сервис…"
launchctl unload "$DST" 2>/dev/null || true
launchctl load "$DST"

echo "✓ Готово. Монитор запущен в фоне."
echo
echo "Полезное:"
echo "  Логи:        tail -f data/monitor.log"
echo "  Статус:      launchctl list | grep claude-monitor"
echo "  Остановить:  launchctl unload $DST"
echo "  Запустить:   launchctl load $DST"
