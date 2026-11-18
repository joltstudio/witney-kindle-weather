#!/bin/sh
trap '' HUP

ROOT=/mnt/us/kindle-weather
CONFIG="$ROOT/config"
LOG="$ROOT/app.log"
PIDFILE=/tmp/witney-weather.pid
FETCHPIDFILE=/tmp/witney-weather-fetch.pid
LIPC=/usr/bin/lipc-set-prop
XH="$ROOT/xh"
CA_BUNDLE="$ROOT/cacert.pem"
EIPS=/usr/sbin/eips
INTERVAL=1800
DOWNLOAD_TIMEOUT=25
REFRESH_NOW=0
PILLOW_HIDDEN=0

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $1" >> "$LOG"; }
cleanup() {
  if [ -r "$FETCHPIDFILE" ]; then
    fetch_pid=$(cat "$FETCHPIDFILE" 2>/dev/null)
    case "$fetch_pid" in
      ''|*[!0-9]*) ;;
      *)
        if kill -0 "$fetch_pid" 2>/dev/null; then
          fetch_cmd=$(tr '\000' ' ' < "/proc/$fetch_pid/cmdline" 2>/dev/null)
          case "$fetch_cmd" in *xh*) kill "$fetch_pid" 2>/dev/null || true ;; esac
        fi
        ;;
    esac
  fi
  rm -f "$FETCHPIDFILE"
  rm -f "$PIDFILE"
  if [ "$PILLOW_HIDDEN" -eq 1 ]; then
    "$LIPC" com.lab126.pillow interrogatePillow '{"pillowId": "default_status_bar", "function": "nativeBridge.showMe();"}' 2>/dev/null || true
    log 'Kindle status bar restored'
    PILLOW_HIDDEN=0
  fi
  "$LIPC" com.lab126.powerd preventScreenSaver 0 2>/dev/null || true
}
trap 'exit 0' TERM INT

if [ ! -r "$CONFIG" ] || [ ! -x "$XH" ] || [ ! -r "$CA_BUNDLE" ] || [ ! -x "$EIPS" ] || [ ! -x "$LIPC" ]; then
  log 'Missing config or required Kindle weather component'
  exit 1
fi
. "$CONFIG"
if [ -z "${IMAGE_URL:-}" ] || [ "${IMAGE_URL#https://}" = "$IMAGE_URL" ]; then
  log 'IMAGE_URL must be an HTTPS URL'
  exit 1
fi

if [ -r "$PIDFILE" ]; then
  old_pid=$(cat "$PIDFILE" 2>/dev/null)
  case "$old_pid" in
    ''|*[!0-9]*) ;;
    *)
      if kill -0 "$old_pid" 2>/dev/null; then
        old_cmd=$(tr '\000' ' ' < "/proc/$old_pid/cmdline" 2>/dev/null)
        case "$old_cmd" in *weather-loop.sh*) exit 0 ;; esac
      fi
      ;;
  esac
fi
echo $$ > "$PIDFILE"
trap cleanup EXIT
trap 'REFRESH_NOW=1' USR1
"$LIPC" com.lab126.powerd preventScreenSaver 1 2>/dev/null || true
"$LIPC" com.lab126.wifid enable 1 2>/dev/null || true
log 'Weather display opened'

# K4 firmware uses Pillow's soft hide API. Allow the delayed KUAL/window-manager
# redraw to finish before the first framebuffer image is painted.
if "$LIPC" com.lab126.pillow interrogatePillow '{"pillowId": "default_status_bar", "function": "nativeBridge.hideMe();"}' 2>/dev/null; then
  PILLOW_HIDDEN=1
  log 'Kindle status bar hidden'
  sleep 3
else
  log 'Could not hide Kindle status bar; displaying forecast anyway'
fi

fetch_and_display() {
  temp="$ROOT/weather.app-new.png"
  rm -f "$temp"
  separator='?'
  case "$IMAGE_URL" in *\?*) separator='&' ;; esac
  url="${IMAGE_URL}${separator}ts=$(date +%s)"
  "$XH" --verify "$CA_BUNDLE" -d -q -o "$temp" get "$url" &
  fetch_pid=$!
  echo "$fetch_pid" > "$FETCHPIDFILE"
  seconds=0
  while [ "$seconds" -lt "$DOWNLOAD_TIMEOUT" ]; do
    kill -0 "$fetch_pid" 2>/dev/null || break
    sleep 1
    seconds=$((seconds + 1))
  done
  if kill -0 "$fetch_pid" 2>/dev/null; then
    kill "$fetch_pid" 2>/dev/null || true
    wait "$fetch_pid" 2>/dev/null || true
    rm -f "$FETCHPIDFILE"
    rm -f "$temp"
    log 'Weather fetch timed out; last good screen retained'
    return 1
  fi
  rm -f "$FETCHPIDFILE"
  if ! wait "$fetch_pid" || [ ! -s "$temp" ] || [ "$(wc -c < "$temp" | tr -d ' ')" -lt 1000 ]; then
    rm -f "$temp"
    log 'Weather fetch failed; last good screen retained'
    return 1
  fi
  # Reassert the K4 Pillow soft-hide before each framebuffer refresh.
  if "$LIPC" com.lab126.pillow interrogatePillow '{"pillowId": "default_status_bar", "function": "nativeBridge.hideMe();"}' 2>/dev/null; then
    PILLOW_HIDDEN=1
  else
    log 'Could not hide Kindle status bar; displaying forecast anyway'
  fi
  if "$EIPS" -f -g "$temp"; then
    mv "$temp" "$ROOT/weather.png"
    log 'Weather image fetched and displayed'
    return 0
  fi
  rm -f "$temp"
  log 'Kindle rejected weather image; last good screen retained'
  return 1
}

fetch_and_display
elapsed=0
while :; do
  sleep 10
  elapsed=$((elapsed + 10))
  if [ "$REFRESH_NOW" -eq 1 ] || [ "$elapsed" -ge "$INTERVAL" ]; then
    REFRESH_NOW=0
    elapsed=0
    fetch_and_display
  fi
done
