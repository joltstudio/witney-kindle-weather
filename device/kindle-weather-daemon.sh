#!/bin/sh
# D01100 full-screen image refresh loop. Requires the matching K4 jailbreak.
# The E-Ink panel retains the last frame while the Kindle sleeps.
trap '' HUP

ROOT=/mnt/us/kindle-weather
CONFIG="$ROOT/config"
LOG="$ROOT/daemon.log"
PIDFILE=/tmp/kindle-weather.pid
EIPS=/usr/sbin/eips
LIPC=lipc-set-prop
XH="$ROOT/xh"
INTERVAL=1800
WIFI_WAIT=8
DOWNLOAD_TIMEOUT=25

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $1" >> "$LOG"; }

if [ -f "$PIDFILE" ]; then
  old_pid=$(cat "$PIDFILE" 2>/dev/null)
  if [ -n "$old_pid" ] && kill -0 "$old_pid" 2>/dev/null; then exit 0; fi
fi
echo $$ > "$PIDFILE"
trap 'rm -f "$PIDFILE"' EXIT

if [ ! -f "$CONFIG" ]; then log 'Missing config; exiting'; exit 1; fi
. "$CONFIG"
if [ -z "${IMAGE_URL:-}" ] || [ "${IMAGE_URL#https://}" = "$IMAGE_URL" ]; then
  log 'IMAGE_URL must be an HTTPS URL; exiting'
  exit 1
fi
if [ ! -x "$XH" ]; then
  log 'Missing HTTPS client xh; exiting'
  exit 1
fi

timed_xh() {
  output=$1
  url=$2
  "$XH" -d -q -o "$output" get "$url" &
  xh_pid=$!
  seconds=0
  while [ "$seconds" -lt "$DOWNLOAD_TIMEOUT" ]; do
    kill -0 "$xh_pid" 2>/dev/null || break
    sleep 1
    seconds=$((seconds + 1))
  done
  if kill -0 "$xh_pid" 2>/dev/null; then
    kill "$xh_pid" 2>/dev/null
    wait "$xh_pid" 2>/dev/null
    return 1
  fi
  wait "$xh_pid"
}

sleep_until_refresh() {
  rtc=/sys/class/rtc/rtc1/wakealarm
  epoch=/sys/class/rtc/rtc1/since_epoch
  if [ -w "$rtc" ] && [ -r "$epoch" ]; then
    echo 0 > "$rtc" 2>/dev/null
    now=$(cat "$epoch" 2>/dev/null)
    case "$now" in ''|*[!0-9]*) sleep "$INTERVAL"; return ;; esac
    echo $((now + INTERVAL)) > "$rtc" 2>/dev/null
    sync
    echo mem > /sys/power/state 2>/dev/null
    sleep 3
  else
    # Fallback keeps the current image visible but uses more battery.
    sleep "$INTERVAL"
  fi
}

log 'Daemon started'
"$LIPC" com.lab126.powerd preventScreenSaver 1 2>/dev/null
while true; do
  "$LIPC" com.lab126.wifid enable 1 2>/dev/null
  sleep "$WIFI_WAIT"
  temp="$ROOT/weather.new.png"
  rm -f "$temp"
  separator='?'
  case "$IMAGE_URL" in *\?*) separator='&' ;; esac
  fetch_url="${IMAGE_URL}${separator}ts=$(date +%s)"
  if timed_xh "$temp" "$fetch_url" && [ -s "$temp" ] && [ "$(wc -c < "$temp" | tr -d ' ')" -gt 1000 ]; then
    if "$EIPS" -f -g "$temp"; then
      sleep 5
      mv "$temp" "$ROOT/weather.png"
      log 'Image downloaded and displayed'
    else
      log 'eips rejected downloaded image; previous screen retained'
      rm -f "$temp"
    fi
  else
    log 'Image fetch failed; previous screen retained'
    rm -f "$temp"
  fi
  "$LIPC" com.lab126.wifid enable 0 2>/dev/null
  sleep_until_refresh
done
