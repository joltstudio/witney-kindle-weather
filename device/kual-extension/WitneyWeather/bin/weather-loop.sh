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
REFRESH_TIMES=06:22,10:22,14:22,18:22,22:22
DOWNLOAD_TIMEOUT=25
WIFI_SETTLE_SECONDS=20
FETCH_ATTEMPTS=3
RETRY_DELAY_SECONDS=10
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
    CVM_STOPPED=0
  fi
  # waitforkey consumes Home, so replay it after the framework resumes. The
  # brief pause avoids racing the framework's resume when exiting full-screen.
  if [ "$HOME_EXIT" -eq 1 ]; then
    sleep 1
    if [ -w /proc/keypad ]; then
      echo 'send 102' > /proc/keypad 2>/dev/null || true
      log 'Home key forwarded to Kindle framework'
    else
      log 'Could not forward Home key to Kindle framework'
    fi
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
REFRESH_TIMES=${WEATHER_REFRESH_TIMES:-$REFRESH_TIMES}
WIFI_SETTLE_SECONDS=${WEATHER_WIFI_SETTLE_SECONDS:-$WIFI_SETTLE_SECONDS}
FETCH_ATTEMPTS=${WEATHER_FETCH_ATTEMPTS:-$FETCH_ATTEMPTS}
RETRY_DELAY_SECONDS=${WEATHER_RETRY_DELAY_SECONDS:-$RETRY_DELAY_SECONDS}
case "$REFRESH_TIMES" in ''|*[!0-9:,]*) log 'WEATHER_REFRESH_TIMES must be a comma-separated list of HH:MM times'; exit 1 ;; esac
case "$WIFI_SETTLE_SECONDS" in ''|*[!0-9]*) log 'WEATHER_WIFI_SETTLE_SECONDS must be a nonnegative integer'; exit 1 ;; esac
case "$FETCH_ATTEMPTS" in ''|*[!0-9]*|0) log 'WEATHER_FETCH_ATTEMPTS must be a positive integer'; exit 1 ;; esac
case "$RETRY_DELAY_SECONDS" in ''|*[!0-9]*) log 'WEATHER_RETRY_DELAY_SECONDS must be a nonnegative integer'; exit 1 ;; esac
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
trap 'HOME_EXIT=1; INTENTIONAL_EXIT=1; log "Home key received; exiting weather display"; exit 0' USR2
"$LIPC" com.lab126.powerd preventScreenSaver 1 2>/dev/null || true
log 'Weather display opened'

start_home_key_watcher() {
  (
    /usr/bin/waitforkey 102 >/dev/null 2>&1
    kill -USR2 "$$" 2>/dev/null || true
  ) &
  echo "$!" > "$KEYWATCHPIDFILE"
  log 'Home exit is ready'
}

# K4 (SysV) has no Pillow LIPC service. Pause CVM to prevent its native
# status strip from repainting over the framebuffer. The Home-key watcher
# gives the user a direct, hardware-only way to exit this full-screen view.
if killall -STOP cvm >> "$LOG" 2>&1; then
  CVM_STOPPED=1
  log 'Kindle framework paused for full-screen display'
else
  log 'Could not pause Kindle framework; continuing with status strip visible'
fi
start_home_key_watcher
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
  attempt=1
  while [ "$attempt" -le "$FETCH_ATTEMPTS" ]; do
    rm -f "$temp"
    separator='?'
    case "$IMAGE_URL" in *\?*) separator='&' ;; esac
    url="${IMAGE_URL}${separator}ts=$(date +%s)-${attempt}"
    log "Weather download attempt $attempt/$FETCH_ATTEMPTS"
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
      rm -f "$FETCHPIDFILE" "$temp"
      log "Weather download attempt $attempt timed out"
    else
      rm -f "$FETCHPIDFILE"
      if wait "$fetch_pid" && [ -s "$temp" ] && [ "$(wc -c < "$temp" | tr -d ' ')" -ge 1000 ]; then
        if "$EIPS" -f -g "$temp"; then
          mv "$temp" "$ROOT/weather.png"
          log "Weather image fetched and displayed on attempt $attempt"
          # K4 can otherwise suspend before the e-ink waveform has finished.
          sleep 5
          return 0
        fi
        rm -f "$temp"
        log 'Kindle rejected weather image; last good screen retained'
        return 1
      fi
      rm -f "$temp"
      log "Weather download attempt $attempt failed; keeping last good image"
    fi

    if [ "$attempt" -lt "$FETCH_ATTEMPTS" ]; then
      delay=$((RETRY_DELAY_SECONDS * attempt))
      log "Reconnecting Wi-Fi before retry $((attempt + 1))/$FETCH_ATTEMPTS"
      "$LIPC" com.lab126.wifid enable 0 2>/dev/null || true
      sleep 3
      if ! "$LIPC" com.lab126.wifid enable 1 2>/dev/null; then
        log 'Wi-Fi reconnect request failed; continuing bounded retries'
      fi
      log "Waiting $WIFI_SETTLE_SECONDS seconds after Wi-Fi reconnect"
      sleep "$WIFI_SETTLE_SECONDS"
      log "Retrying weather download in $delay seconds"
      sleep "$delay"
    fi
    attempt=$((attempt + 1))
  done

  log "All $FETCH_ATTEMPTS weather download attempts failed; last good screen retained"
  return 1
}

sleep_until_refresh() {
  rtc=/sys/class/rtc/rtc1/wakealarm
  epoch=/sys/class/rtc/rtc1/since_epoch
  power_state=/sys/power/state

  calculate_refresh_delay() {
    schedule=$2
    calendar=$3
    set -- $1
    [ "$#" -eq 3 ] || return 1
    case "$1:$2:$3" in [0-2][0-9]:[0-5][0-9]:[0-5][0-9]) ;; *) return 1 ;; esac
    current_hour=$((1$1 - 100))
    current_minute=$((1$2 - 100))
    current_second=$((1$3 - 100))
    [ "$current_hour" -le 23 ] || return 1
    set -- $calendar
    [ "$#" -eq 4 ] || return 1
    case "$1:$2:$3:$4" in [0-6]:[0-3][0-9]:[0-1][0-9]:[0-9][0-9][0-9][0-9]) ;; *) return 1 ;; esac
    weekday=$1
    current_day=$((1$2 - 100))
    current_month=$((1$3 - 100))
    current_year=$4
    current_seconds=$((current_hour * 3600 + current_minute * 60 + current_second))
    best_delay=
    best_rolls_to_tomorrow=0
    for clock_time in $(echo "$schedule" | tr ',' ' '); do
      case "$clock_time" in [0-2][0-9]:[0-5][0-9]) ;; *) return 1 ;; esac
      target_hour=$((1${clock_time%:*} - 100))
      target_minute=$((1${clock_time#*:} - 100))
      [ "$target_hour" -le 23 ] || return 1
      target_seconds=$((target_hour * 3600 + target_minute * 60))
      delay=$((target_seconds - current_seconds))
      rolls_to_tomorrow=0
      if [ "$delay" -le 0 ]; then
        delay=$((delay + 86400))
        rolls_to_tomorrow=1
      fi
      if [ -z "$best_delay" ] || [ "$delay" -lt "$best_delay" ]; then
        best_delay=$delay
        best_rolls_to_tomorrow=$rolls_to_tomorrow
      fi
    done
    case "$best_delay" in ''|*[!0-9]*|0) return 1 ;; esac
    # Europe/London changes clocks at 01:00 UTC on the final Sundays in
    # March and October. Correct an overnight delay when tomorrow is that
    # Sunday so the monotonic RTC alarm lands on the configured local time.
    if [ "$best_rolls_to_tomorrow" -eq 1 ] && [ "$weekday" -eq 6 ] && [ "$current_day" -ge 24 ]; then
      case "$current_month" in
        3) [ $((current_day + 8)) -gt 31 ] && best_delay=$((best_delay - 3600)) ;;
        10) [ $((current_day + 8)) -gt 31 ] && best_delay=$((best_delay + 3600)) ;;
      esac
    fi
    echo "$best_delay"
  }

  # Kindle 4's BusyBox date cannot parse the GNU `date -d` expressions used
  # by newer hosts. Calculate the delay from the device's local clock.
  local_clock=$(date '+%H %M %S' 2>/dev/null) || local_clock=
  local_calendar=$(date '+%w %d %m %Y' 2>/dev/null) || local_calendar=
  refresh_delay=$(calculate_refresh_delay "$local_clock" "$REFRESH_TIMES" "$local_calendar") || refresh_delay=
  case "$refresh_delay" in ''|*[!0-9]*|0)
    log 'Refresh schedule or Kindle local clock was invalid; using four-hour low-CPU fallback'
    sleep 14400
    return
    ;;
  esac

  # /sys/class/rtc/rtc1/since_epoch is a monotonic counter since boot, not
  # Unix time. Convert the local-clock delay onto that same RTC time base.
  if [ -w "$rtc" ] && [ -r "$epoch" ] && [ -w "$power_state" ]; then
    echo 0 > "$rtc" 2>/dev/null || true
    now=$(cat "$epoch" 2>/dev/null)
    case "$now" in
      ''|*[!0-9]*)
        delay=$refresh_delay
        log 'RTC clock unavailable; using low-CPU timer sleep'
        sleep "$delay"
        return
        ;;
    esac
    wake_at=$((now + refresh_delay))
    if ! echo "$wake_at" > "$rtc" 2>/dev/null; then
      log 'RTC alarm could not be set; using low-CPU timer sleep'
      delay=$refresh_delay
      sleep "$delay"
      return
    fi
    sync
    log "Wi-Fi off; suspending until RTC wake at $wake_at"
    while [ "$REFRESH_NOW" -eq 0 ]; do
      if ! echo mem > "$power_state" 2>> "$LOG"; then
        delay=$refresh_delay
        log "Suspend failed; falling back to low-CPU timer sleep for $delay seconds"
        sleep "$delay"
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

  log "RTC wake unavailable; using low-CPU timer sleep for $refresh_delay seconds"
  sleep "$refresh_delay"
}

refresh_weather() {
  log 'Weather refresh started'
  if ! "$LIPC" com.lab126.wifid enable 1 2>/dev/null; then
    log 'Wi-Fi enable request failed; download retries will continue'
  fi
  log "Waiting $WIFI_SETTLE_SECONDS seconds for Wi-Fi connection"
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
