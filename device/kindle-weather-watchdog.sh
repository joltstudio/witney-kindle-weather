#!/bin/sh
# Started by root cron once per minute; recovers the display daemon after a crash.
ROOT=/mnt/us/kindle-weather
PIDFILE=/tmp/kindle-weather.pid
RESTART_MARKER="$ROOT/restart-daemon-once"

# A one-shot marker lets an update replace the daemon without rebooting the
# Kindle. Only stop the recorded PID if its command line is this daemon.
if [ -f "$RESTART_MARKER" ]; then
  pid=$(cat "$PIDFILE" 2>/dev/null)
  case "$pid" in
    ''|*[!0-9]*) ;;
    *)
      if kill -0 "$pid" 2>/dev/null; then
        command_line=$(tr '\000' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)
        case "$command_line" in
          *kindle-weather-daemon.sh*)
            kill "$pid" 2>/dev/null || true
            tries=0
            while kill -0 "$pid" 2>/dev/null && [ "$tries" -lt 5 ]; do
              sleep 1
              tries=$((tries + 1))
            done
            if kill -0 "$pid" 2>/dev/null; then
              echo "$(date '+%Y-%m-%d %H:%M:%S') Watchdog could not stop daemon PID $pid; leaving it alone" >> "$ROOT/daemon.log"
              exit 1
            fi
            ;;
        esac
      fi
      ;;
  esac
  rm -f "$PIDFILE" "$RESTART_MARKER"
fi

if [ -f "$PIDFILE" ]; then
  pid=$(cat "$PIDFILE" 2>/dev/null)
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then exit 0; fi
fi
/bin/sh "$ROOT/kindle-weather-daemon.sh" >> "$ROOT/daemon.log" 2>&1 &
