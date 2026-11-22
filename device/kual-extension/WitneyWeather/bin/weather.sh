#!/bin/sh
ROOT=/mnt/us/kindle-weather
APP=/mnt/us/extensions/WitneyWeather
PIDFILE=/tmp/witney-weather.pid
FETCHPIDFILE=/tmp/witney-weather-fetch.pid
SLEEPPIDFILE=/tmp/witney-weather-wait.pid
LOG="$ROOT/app.log"
LIPC=/usr/bin/lipc-set-prop
EXIT_MARKER=/tmp/witney-weather-user-exit

echo "$(date '+%Y-%m-%d %H:%M:%S') KUAL weather action invoked: ${1:-none}" >> "$LOG"

daemon_is_running() {
  [ -r "$PIDFILE" ] || return 1
  pid=$(cat "$PIDFILE" 2>/dev/null)
  case "$pid" in ''|*[!0-9]*) return 1 ;; esac
  kill -0 "$pid" 2>/dev/null || return 1
  cmdline=$(tr '\000' ' ' < "/proc/$pid/cmdline" 2>/dev/null) || return 1
  case "$cmdline" in *weather-loop.sh*) return 0 ;; esac
  return 1
}

start_loop() {
  launch_mode=${1:-manual}
  if [ "$launch_mode" != autostart ]; then
    rm -f "$EXIT_MARKER"
  fi
  trap '' HUP
  /bin/sh "$APP/bin/weather-loop.sh" >> "$LOG" 2>&1 </dev/null &
  sleep 1
  if daemon_is_running; then return 0; fi
  echo "$(date '+%Y-%m-%d %H:%M:%S') Weather display did not start" >> "$LOG"
  return 1
}

case "${1:-}" in
  start)
    if daemon_is_running; then
      rm -f "$EXIT_MARKER"
      kill -USR1 "$pid" 2>/dev/null || true
      exit 0
    fi
    start_loop manual
    exit $?
    ;;
  refresh)
    if daemon_is_running; then
      rm -f "$EXIT_MARKER"
      kill -USR1 "$pid" 2>/dev/null || true
      exit 0
    fi
    start_loop manual
    exit $?
    ;;
  autostart)
    [ -e "$EXIT_MARKER" ] && exit 0
    if daemon_is_running; then exit 0; fi
    start_loop autostart
    exit $?
    ;;
  stop)
    : > "$EXIT_MARKER"
    if daemon_is_running; then
      # BusyBox ash may defer its TERM trap while it waits for a foreground
      # sleep child. Stop the tracked wait first so the app can shut down now.
      if [ -r "$SLEEPPIDFILE" ]; then
        sleep_pid=$(cat "$SLEEPPIDFILE" 2>/dev/null)
        case "$sleep_pid" in
          ''|*[!0-9]*) ;;
          *)
            sleep_cmd=$(tr '\000' ' ' < "/proc/$sleep_pid/cmdline" 2>/dev/null)
            case "$sleep_cmd" in *sleep*) kill "$sleep_pid" 2>/dev/null || true ;; esac
            ;;
        esac
      fi
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
      kill "$pid" 2>/dev/null || true
      tries=0
      while kill -0 "$pid" 2>/dev/null && [ "$tries" -lt 30 ]; do
        sleep 1
        tries=$((tries + 1))
      done
      if kill -0 "$pid" 2>/dev/null; then
        echo "$(date '+%Y-%m-%d %H:%M:%S') Weather display did not stop; PID $pid remains" >> "$LOG"
        exit 1
      fi
    else
      rm -f "$PIDFILE"
    fi
    ;;
  *)
    exit 2
    ;;
esac
