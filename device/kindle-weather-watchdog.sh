#!/bin/sh
# Existing once-per-minute root cron entry starts the KUAL app after boot and
# recovers it after crashes. Home/Exit writes a /tmp marker so cron does not
# immediately reopen the display; /tmp is cleared by the next reboot.
APP=${WEATHER_APP:-/mnt/us/extensions/WitneyWeather/bin/weather.sh}
APP_PIDFILE=${WEATHER_APP_PIDFILE:-/tmp/witney-weather.pid}
EXIT_MARKER=${WEATHER_EXIT_MARKER:-/tmp/witney-weather-user-exit}
LEGACY_PIDFILE=${WEATHER_LEGACY_PIDFILE:-/tmp/kindle-weather.pid}
LOG=${WEATHER_LOG:-/mnt/us/kindle-weather/app.log}

[ -x "$APP" ] || exit 0
[ -e "$EXIT_MARKER" ] && exit 0

# Never run the previous daemon alongside the KUAL app. The old process must
# be stopped cleanly before switching the watchdog to this launcher.
legacy_pid=$(cat "$LEGACY_PIDFILE" 2>/dev/null)
case "$legacy_pid" in
  ''|*[!0-9]*) ;;
  *)
    if kill -0 "$legacy_pid" 2>/dev/null; then
      legacy_cmd=$(tr '\000' ' ' < "/proc/$legacy_pid/cmdline" 2>/dev/null) || legacy_cmd=
      case "$legacy_cmd" in
        *kindle-weather-daemon.sh*)
          echo "$(date '+%Y-%m-%d %H:%M:%S') Legacy weather daemon is still running; refusing a competing launch" >> "$LOG"
          exit 0
          ;;
      esac
    fi
    ;;
esac

app_pid=$(cat "$APP_PIDFILE" 2>/dev/null)
case "$app_pid" in
  ''|*[!0-9]*) ;;
  *)
    if kill -0 "$app_pid" 2>/dev/null; then
      app_cmd=$(tr '\000' ' ' < "/proc/$app_pid/cmdline" 2>/dev/null) || app_cmd=
      case "$app_cmd" in *weather-loop.sh*) exit 0 ;; esac
    fi
    ;;
esac

if [ -x /usr/bin/lipc-set-prop ]; then
  /usr/bin/lipc-set-prop com.lab126.wifid enable 1 2>/dev/null || true
  /usr/bin/lipc-set-prop com.lab126.powerd preventScreenSaver 0 2>/dev/null || true
fi
killall -CONT cvm 2>/dev/null || true
echo "$(date '+%Y-%m-%d %H:%M:%S') Boot watchdog starting Witney Weather" >> "$LOG"
/bin/sh "$APP" autostart >> "$LOG" 2>&1 </dev/null &
