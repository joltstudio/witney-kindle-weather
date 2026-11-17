#!/bin/sh
# Started by root cron once per minute; recovers the display daemon after a crash.
ROOT=/mnt/us/kindle-weather
PIDFILE=/tmp/kindle-weather.pid
if [ -f "$PIDFILE" ]; then
  pid=$(cat "$PIDFILE" 2>/dev/null)
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then exit 0; fi
fi
/bin/sh "$ROOT/kindle-weather-daemon.sh" >> "$ROOT/daemon.log" 2>&1 &
