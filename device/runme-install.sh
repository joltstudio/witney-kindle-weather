#!/bin/sh
# Place this file at /mnt/us/runme.sh alongside the weather files.
# The K4 jailbreak runs it once as root during its Diagnostics workflow.
set -eu

ROOT=/mnt/us/kindle-weather
CRONTAB_ROOT=/etc/crontab/root
MARKER='kindle-weather-watchdog.sh'
XH="$ROOT/xh"

mkdir -p "$ROOT"
exec >> "$ROOT/install.log" 2>&1
echo "$(date '+%Y-%m-%d %H:%M:%S') Installer started"
trap 'status=$?; echo "Installer exited with status $status at $(date)"' EXIT

test -s "$ROOT/config"
test -s "$ROOT/kindle-weather-daemon.sh"
test -s "$ROOT/kindle-weather-watchdog.sh"
test -s "$XH"
chmod 755 "$XH"
test -x "$XH"
. "$ROOT/config"
case "${IMAGE_URL:-}" in https://*) ;; *) exit 2 ;; esac

# The jailbreak invokes this hook during Diagnostics, where normal Kindle
# services (including lipc-set-prop) are not available. Schedule the daemon
# for normal-system cron; it performs the bounded HTTPS check at runtime.
echo 'Scheduling weather daemon for normal-system cron; HTTPS check is deferred until normal boot'
chmod 755 "$ROOT/kindle-weather-daemon.sh" "$ROOT/kindle-weather-watchdog.sh"
mntroot rw
if [ ! -f "$ROOT/root-crontab.original" ]; then
  cp "$CRONTAB_ROOT" "$ROOT/root-crontab.original"
fi
if ! grep -F "$MARKER" "$CRONTAB_ROOT" >/dev/null 2>&1; then
  printf '%s\n' '* * * * * /bin/sh /mnt/us/kindle-weather/kindle-weather-watchdog.sh' >> "$CRONTAB_ROOT"
fi
sync
mntroot ro
echo 'Witney weather daemon scheduled; cron will start it after normal boot' >> "$ROOT/install.log"
