#!/bin/sh
# KUAL bootstrap updater. The manifest is served over verified HTTPS and
# contains SHA-256 digests for a fixed allowlist of weather app files.
set -u

ROOT=${WEATHER_UPDATE_ROOT:-/mnt/us/kindle-weather}
APP=${WEATHER_UPDATE_APP:-/mnt/us/extensions/WitneyWeather}
LAUNCHER=${WEATHER_UPDATE_LAUNCHER:-$APP/bin/weather.sh}
XH=${WEATHER_UPDATE_XH:-$ROOT/xh}
CA_BUNDLE=${WEATHER_UPDATE_CA_BUNDLE:-$ROOT/cacert.pem}
LIPC=${WEATHER_UPDATE_LIPC:-/usr/bin/lipc-set-prop}
BASE_URL=${WEATHER_UPDATE_BASE_URL:-https://joltstudio.github.io/witney-kindle-weather/device-update}
LOG=${WEATHER_UPDATE_LOG:-$ROOT/app.log}
WIFI_SETTLE_SECONDS=${WEATHER_UPDATE_WIFI_SETTLE_SECONDS:-60}
DOWNLOAD_TIMEOUT_SECONDS=${WEATHER_UPDATE_TIMEOUT_SECONDS:-60}
WORK="$ROOT/.weather-update-work.$$"
BACKUP="$ROOT/weather-update-backup"
JOURNAL="$ROOT/weather-update-in-progress"
VERSION_FILE="$ROOT/weather-update-version"
FETCH_PID=
APP_STOPPED=0
WIFI_REQUESTED=0

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $1" >> "$LOG"; }
fail() { log "Wi-Fi app update failed: $1"; return 1; }

target_path() {
  case "$1" in
    menu.json) echo "$APP/menu.json" ;;
    weather.sh) echo "$APP/bin/weather.sh" ;;
    weather-loop.sh) echo "$APP/bin/weather-loop.sh" ;;
    wifi-diagnostic.sh) echo "$APP/bin/wifi-diagnostic.sh" ;;
    watchdog.sh) echo "$ROOT/kindle-weather-watchdog.sh" ;;
    *) return 1 ;;
  esac
}

file_sha256() {
  file=$1
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file" | awk '{print $1}'
  elif [ -x /usr/bin/openssl ]; then
    /usr/bin/openssl dgst -sha256 "$file" | awk '{print $NF}'
  else
    return 1
  fi
}

fetch_file() {
  url=$1
  output=$2
  "$XH" --verify "$CA_BUNDLE" -d -q -o "$output" get "$url" &
  FETCH_PID=$!
  seconds=0
  while kill -0 "$FETCH_PID" 2>/dev/null; do
    if [ "$seconds" -ge "$DOWNLOAD_TIMEOUT_SECONDS" ]; then
      kill "$FETCH_PID" 2>/dev/null || true
      wait "$FETCH_PID" 2>/dev/null || true
      FETCH_PID=
      rm -f "$output"
      return 1
    fi
    sleep 1
    seconds=$((seconds + 1))
  done
  if wait "$FETCH_PID" && [ -s "$output" ]; then
    FETCH_PID=
    return 0
  fi
  FETCH_PID=
  rm -f "$output"
  return 1
}

restore_backup() {
  [ -f "$JOURNAL" ] || return 0
  log 'Incomplete update found; restoring the previous app files'
  for name in menu.json weather.sh weather-loop.sh wifi-diagnostic.sh watchdog.sh; do
    saved="$BACKUP/$name"
    destination=$(target_path "$name") || return 1
    if [ -f "$saved" ]; then
      restore="$destination.weather-restore"
      cp "$saved" "$restore" && mv "$restore" "$destination" || return 1
    fi
  done
  if [ -f "$BACKUP/version" ]; then
    cp "$BACKUP/version" "$VERSION_FILE.restore" && mv "$VERSION_FILE.restore" "$VERSION_FILE" || return 1
  else
    rm -f "$VERSION_FILE"
  fi
  rm -f "$JOURNAL"
  log 'Previous app files restored'
}

cleanup() {
  result=$?
  trap - EXIT HUP INT TERM
  if [ -n "$FETCH_PID" ]; then
    kill "$FETCH_PID" 2>/dev/null || true
  fi
  rm -rf "$WORK"
  if [ "$WIFI_REQUESTED" -eq 1 ]; then
    "$LIPC" com.lab126.wifid enable 0 2>/dev/null || true
  fi
  if [ "$APP_STOPPED" -eq 1 ]; then
    /bin/sh "$LAUNCHER" start >> "$LOG" 2>&1 || log 'Weather app did not restart after update attempt'
  fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

if [ "${1:-}" != update ]; then
  log 'Wi-Fi app updater called with an unsupported action'
  exit 2
fi
if [ ! -x "$XH" ] || [ ! -r "$CA_BUNDLE" ] || [ ! -x "$LIPC" ]; then
  fail 'HTTPS client, CA bundle or Kindle Wi-Fi control is missing'
  exit 1
fi
for timeout_value in "$WIFI_SETTLE_SECONDS" "$DOWNLOAD_TIMEOUT_SECONDS"; do
  case "$timeout_value" in ''|*[!0-9]*) fail 'invalid timeout configuration'; exit 1 ;; esac
done
mkdir -p "$ROOT" "$APP/bin" || { fail 'cannot prepare Kindle storage'; exit 1; }
restore_backup || { fail 'could not recover an interrupted update'; exit 1; }
rm -rf "$WORK"
mkdir -p "$WORK/files" "$WORK/backup-next" || { fail 'cannot create staging area'; exit 1; }

log 'Wi-Fi app update started'
if ! "$LIPC" com.lab126.wifid enable 1 2>/dev/null; then
  fail 'could not enable Wi-Fi'
  exit 1
fi
WIFI_REQUESTED=1
log "Waiting $WIFI_SETTLE_SECONDS seconds for Wi-Fi"
sleep "$WIFI_SETTLE_SECONDS"

manifest="$WORK/manifest.txt"
if ! fetch_file "$BASE_URL/manifest.txt?ts=$(date +%s)" "$manifest"; then
  fail 'could not download the update manifest'
  exit 1
fi

version=
seen='|'
file_count=0
while IFS=' ' read -r field value extra || [ -n "${field:-}${value:-}${extra:-}" ]; do
  [ -n "${field:-}" ] || { fail 'blank manifest row'; exit 1; }
  [ -z "${extra:-}" ] || { fail 'manifest row has extra fields'; exit 1; }
  if [ "$field" = version ]; then
    [ -z "$version" ] || { fail 'duplicate version row'; exit 1; }
    case "$value" in ''|*[!A-Za-z0-9._-]*) fail 'invalid manifest version'; exit 1 ;; esac
    version=$value
    continue
  fi
  name=$value
  case "$name" in
    menu.json|weather.sh|weather-loop.sh|wifi-diagnostic.sh|watchdog.sh) ;;
    *) fail 'manifest includes an unapproved file'; exit 1 ;;
  esac
  case "$seen" in *"|$name|"*) fail 'duplicate manifest file'; exit 1 ;; esac
  [ "${#field}" -eq 64 ] || { fail 'invalid SHA-256 digest length'; exit 1; }
  case "$field" in *[!0-9a-f]*) fail 'invalid SHA-256 digest'; exit 1 ;; esac
  seen="$seen$name|"
  file_count=$((file_count + 1))
  destination="$WORK/files/$name"
  if ! fetch_file "$BASE_URL/files/$name?v=$version" "$destination"; then
    fail "could not download $name"
    exit 1
  fi
  actual=$(file_sha256 "$destination") || { fail 'no SHA-256 utility is available'; exit 1; }
  [ "$actual" = "$field" ] || { fail "SHA-256 mismatch for $name"; exit 1; }
done < "$manifest"

[ -n "$version" ] || { fail 'manifest version is missing'; exit 1; }
[ "$file_count" -eq 5 ] || { fail 'manifest does not contain the complete app file set'; exit 1; }
for name in weather.sh weather-loop.sh wifi-diagnostic.sh watchdog.sh; do
  sh -n "$WORK/files/$name" || { fail "$name has invalid shell syntax"; exit 1; }
done
grep -q '"items"' "$WORK/files/menu.json" || { fail 'menu.json is malformed'; exit 1; }
grep -q 'Update Weather App over Wi-Fi' "$WORK/files/menu.json" || { fail 'menu has no Wi-Fi updater action'; exit 1; }

current=
[ -r "$VERSION_FILE" ] && current=$(cat "$VERSION_FILE")
if [ "$current" = "$version" ]; then
  log "Weather app is already at version $version"
  exit 0
fi

for name in menu.json weather.sh weather-loop.sh wifi-diagnostic.sh watchdog.sh; do
  destination=$(target_path "$name") || { fail 'internal file mapping error'; exit 1; }
  [ -f "$destination" ] || { fail "required installed file is missing: $name"; exit 1; }
  cp "$destination" "$WORK/backup-next/$name" || { fail "cannot back up $name"; exit 1; }
done
[ -r "$VERSION_FILE" ] && cp "$VERSION_FILE" "$WORK/backup-next/version"

# Do not replace running shell files. The current KUAL action is entered after
# leaving the display; stop also blocks the boot watchdog until restart.
APP_STOPPED=1
/bin/sh "$LAUNCHER" stop >> "$LOG" 2>&1 || { fail 'could not stop the weather app'; exit 1; }
rm -rf "$BACKUP"
mv "$WORK/backup-next" "$BACKUP" || { fail 'could not save rollback files'; exit 1; }
: > "$JOURNAL" || { fail 'could not create the recovery marker'; exit 1; }

for name in menu.json weather.sh weather-loop.sh wifi-diagnostic.sh watchdog.sh; do
  destination=$(target_path "$name") || { restore_backup; fail 'internal file mapping error'; exit 1; }
  staged="$destination.weather-new"
  if ! cp "$WORK/files/$name" "$staged" || ! mv "$staged" "$destination"; then
    rm -f "$staged"
    restore_backup || log 'Rollback failed; previous copies remain in weather-update-backup'
    fail "could not install $name"
    exit 1
  fi
  case "$name" in menu.json) ;; *) chmod 755 "$destination" || { restore_backup; fail "could not set permissions on $name"; exit 1; } ;; esac
done

printf '%s\n' "$version" > "$VERSION_FILE.new" || { restore_backup; fail 'could not save version'; exit 1; }
mv "$VERSION_FILE.new" "$VERSION_FILE" || { restore_backup; fail 'could not activate version'; exit 1; }
rm -f "$JOURNAL"
APP_STOPPED=1
log "Weather app update $version installed; restarting display"
exit 0
