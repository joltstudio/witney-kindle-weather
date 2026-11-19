#!/bin/sh
trap '' HUP

ROOT=/mnt/us/kindle-weather
CONFIG="$ROOT/config"
LOG="$ROOT/app.log"
PIDFILE=/tmp/witney-weather.pid
FETCHPIDFILE=/tmp/witney-weather-fetch.pid
KEYWATCHPIDFILE=/tmp/witney-weather-home-key.pid
LIPC=/usr/bin/lipc-set-prop
XH="$ROOT/xh"
CA_BUNDLE="$ROOT/cacert.pem"
EIPS=/usr/sbin/eips
INTERVAL=300
DOWNLOAD_TIMEOUT=25
WIFI_SETTLE_SECONDS=8
REFRESH_NOW=0
CVM_STOPPED=0
HOME_EXIT=0
INTENTIONAL_EXIT=0
EXIT_MARKER=/tmp/witney-weather-user-exit

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $1" >> "$LOG"; }
cleanup() {
  if [ -r "$KEYWATCHPIDFILE" ]; then
    key_pid=$(cat "$KEYWATCHPIDFILE" 2>/dev/null)
    case "$key_pid" in ''|*[!0-9]*) ;; *) kill "$key_pid" 2>/dev/null || true ;; esac
  fi
  rm -f "$KEYWATCHPIDFILE"
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
  if [ "$INTENTIONAL_EXIT" -eq 1 ]; then
    : > "$EXIT_MARKER"
  fi
  if [ "$CVM_STOPPED" -eq 1 ]; then
    killall -CONT cvm 2>/dev/null || true
    log 'Kindle framework resumed'
    # The Home key wakes the stock library after CVM has been resumed.
    if [ "$HOME_EXIT" -eq 1 ] && [ -w /proc/keypad ]; then
      echo 'send 102' > /proc/keypad 2>/dev/null || true
    fi
    CVM_STOPPED=0
  fi
  # Return wireless to the Kindle's normal state after the display exits.
  "$LIPC" com.lab126.wifid enable 1 2>/dev/null || true
  "$LIPC" com.lab126.powerd preventScreenSaver 0 2>/dev/null || true
}
trap 'INTENTIONAL_EXIT=1; exit 0' TERM INT

if [ ! -r "$CONFIG" ] || [ ! -x "$XH" ] || [ ! -r "$CA_BUNDLE" ] || [ ! -x "$EIPS" ] || [ ! -x "$LIPC" ]; then
  log 'Missing config or required Kindle weather component'
  exit 1
fi
if [ ! -x /usr/bin/waitforkey ]; then
  log 'Missing /usr/bin/waitforkey; refusing to pause Kindle framework'
  exit 1
fi
. "$CONFIG"
INTERVAL=${WEATHER_REFRESH_SECONDS:-$INTERVAL}
WIFI_SETTLE_SECONDS=${WEATHER_WIFI_SETTLE_SECONDS:-$WIFI_SETTLE_SECONDS}
case "$INTERVAL" in ''|*[!0-9]*|0) log 'WEATHER_REFRESH_SECONDS must be a positive integer'; exit 1 ;; esac
case "$WIFI_SETTLE_SECONDS" in ''|*[!0-9]*) log 'WEATHER_WIFI_SETTLE_SECONDS must be a nonnegative integer'; exit 1 ;; esac
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
trap 'HOME_EXIT=1; INTENTIONAL_EXIT=1; exit 0' USR2
"$LIPC" com.lab126.powerd preventScreenSaver 1 2>/dev/null || true
log 'Weather display opened'

# K4 (SysV) has no Pillow LIPC service. Pause CVM to prevent its native
# status strip from repainting over the framebuffer. The Home-key watcher
# gives the user a direct, hardware-only way to exit this full-screen view.
if killall -STOP cvm >> "$LOG" 2>&1; then
  CVM_STOPPED=1
  log 'Kindle framework paused for full-screen display'
  (
    /usr/bin/waitforkey 102 >/dev/null 2>&1
    kill -USR2 "$$" 2>/dev/null || true
  ) &
  echo "$!" > "$KEYWATCHPIDFILE"
  log 'Press Home to exit the weather display'
else
  log 'Could not pause Kindle framework; continuing with status strip visible'
fi
sleep 3

display_cached_image() {
  if [ -s "$ROOT/weather.png" ]; then
    if "$EIPS" -f -g "$ROOT/weather.png"; then
      log 'Cached weather image displayed'
    else
      log 'Cached weather image could not be displayed'
    fi
  else
    log 'No cached weather image available'
  fi
}

display_cached_image

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
  if "$EIPS" -f -g "$temp"; then
    mv "$temp" "$ROOT/weather.png"
    log 'Weather image fetched and displayed'
    # K4 can otherwise suspend before the e-ink waveform has finished.
    sleep 5
    return 0
  fi
  rm -f "$temp"
  log 'Kindle rejected weather image; last good screen retained'
  return 1
}

sleep_until_refresh() {
  rtc=/sys/class/rtc/rtc1/wakealarm
  epoch=/sys/class/rtc/rtc1/since_epoch
  power_state=/sys/power/state

  if [ -w "$rtc" ] && [ -r "$epoch" ] && [ -w "$power_state" ]; then
    echo 0 > "$rtc" 2>/dev/null || true
    now=$(cat "$epoch" 2>/dev/null)
    case "$now" in
      ''|*[!0-9]*) log 'RTC clock unavailable; using low-CPU timer sleep'; sleep "$INTERVAL"; return ;;
    esac
    wake_at=$((now + INTERVAL))
    if ! echo "$wake_at" > "$rtc" 2>/dev/null; then
      log 'RTC alarm could not be set; using low-CPU timer sleep'
      sleep "$INTERVAL"
      return
    fi
    sync
    log "Wi-Fi off; suspending until RTC wake at $wake_at"
    while [ "$REFRESH_NOW" -eq 0 ]; do
      if ! echo mem > "$power_state" 2>> "$LOG"; then
        log 'Suspend failed; falling back to low-CPU timer sleep'
        sleep "$INTERVAL"
        return
      fi
      # A key can wake the Kindle early. Keep the image up, but do not spend
      # battery on Wi-Fi or another full redraw until the scheduled time.
      now=$(cat "$epoch" 2>/dev/null)
      case "$now" in ''|*[!0-9]*) return ;; esac
      [ "$now" -ge "$wake_at" ] && return
      log 'Kindle woke early; returning to suspend'
    done
    return
  fi

  log 'RTC wake unavailable; using low-CPU timer sleep'
  sleep "$INTERVAL"
}

refresh_weather() {
  "$LIPC" com.lab126.wifid enable 1 2>/dev/null || true
  sleep "$WIFI_SETTLE_SECONDS"
  fetch_and_display
  "$LIPC" com.lab126.wifid enable 0 2>/dev/null || true
}

refresh_weather
while :; do
  sleep_until_refresh
  REFRESH_NOW=0
  refresh_weather
done
