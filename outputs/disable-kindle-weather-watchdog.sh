#!/bin/sh
# Emergency reversible stop: called by the existing root cron each minute.
# Kill only our old weather daemon, and resume CVM if the KUAL display loop
# exited or crashed after pausing the native Kindle framework.
DAEMON_PIDFILE=/tmp/kindle-weather.pid
APP_PIDFILE=/tmp/witney-weather.pid

pid=$(cat "$DAEMON_PIDFILE" 2>/dev/null)
case "$pid" in
  ''|*[!0-9]*) ;;
  *)
    if kill -0 "$pid" 2>/dev/null; then
      cmdline=$(tr '\000' ' ' < "/proc/$pid/cmdline" 2>/dev/null) || cmdline=
      case "$cmdline" in
        *kindle-weather-daemon.sh*)
          kill "$pid" 2>/dev/null || true
          LIPC=/usr/bin/lipc-set-prop
          if [ -x "$LIPC" ]; then
            "$LIPC" com.lab126.wifid enable 1 2>/dev/null || true
            "$LIPC" com.lab126.powerd preventScreenSaver 0 2>/dev/null || true
          fi
          ;;
      esac
    fi
    ;;
esac

app_pid=$(cat "$APP_PIDFILE" 2>/dev/null)
case "$app_pid" in
  ''|*[!0-9]*) app_cmdline= ;;
  *)
    if kill -0 "$app_pid" 2>/dev/null; then
      app_cmdline=$(tr '\000' ' ' < "/proc/$app_pid/cmdline" 2>/dev/null) || app_cmdline=
    else
      app_cmdline=
    fi
    ;;
esac
case "$app_cmdline" in
  *weather-loop.sh*) exit 0 ;;
esac

# Safe and idempotent if CVM is already running. This recovers the normal
# Kindle interface within one cron minute if the KUAL loop is force-killed.
killall -CONT cvm 2>/dev/null || true
exit 0
