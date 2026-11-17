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
trap 'status=$?; if [ "$status" -ne 0 ]; then /usr/bin/lipc-set-prop com.lab126.wifid enable 0 2>/dev/null; fi; echo "Installer exited with status $status at $(date)"' EXIT

test -s "$ROOT/config"
test -s "$ROOT/kindle-weather-daemon.sh"
test -s "$ROOT/kindle-weather-watchdog.sh"
test -s "$XH"
chmod 755 "$XH"
test -x "$XH"
. "$ROOT/config"
case "${IMAGE_URL:-}" in https://*) ;; *) exit 2 ;; esac

# Probe the GitHub Pages image before making the periodic job persistent.
# Any failure leaves the Kindle's current boot setup unchanged.
/usr/bin/lipc-set-prop com.lab126.wifid enable 1
sleep 8
probe="$ROOT/first-image.png"
separator='?'
case "$IMAGE_URL" in *\?*) separator='&' ;; esac
"$XH" -d -q -o "$probe" get "${IMAGE_URL}${separator}probe=$(date +%s)"
test -s "$probe"
test "$(wc -c < "$probe" | tr -d ' ')" -gt 1000
/usr/bin/lipc-set-prop com.lab126.wifid enable 0

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
/bin/sh "$ROOT/kindle-weather-watchdog.sh" >> "$ROOT/daemon.log" 2>&1 &
echo 'Witney weather daemon installed' >> "$ROOT/install.log"
