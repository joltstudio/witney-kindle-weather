#!/bin/sh
# Emergency reversible stop: called by the existing root cron each minute.
# Kill only the weather daemon recorded in its PID file; never restart it.
PIDFILE=/tmp/kindle-weather.pid
[ -r "$PIDFILE" ] || exit 0

pid=$(cat "$PIDFILE" 2>/dev/null)
case "$pid" in
  ''|*[!0-9]*) exit 0 ;;
esac

kill -0 "$pid" 2>/dev/null || exit 0
cmdline=$(tr '\000' ' ' < "/proc/$pid/cmdline" 2>/dev/null) || exit 0
case "$cmdline" in
  *kindle-weather-daemon.sh*)
    kill "$pid" 2>/dev/null || true
    # Undo the daemon's power settings where the normal-system LIPC utility exists.
    LIPC=/usr/bin/lipc-set-prop
    if [ -x "$LIPC" ]; then
      "$LIPC" com.lab126.wifid enable 1 2>/dev/null || true
      "$LIPC" com.lab126.powerd preventScreenSaver 0 2>/dev/null || true
    fi
    ;;
esac
exit 0
