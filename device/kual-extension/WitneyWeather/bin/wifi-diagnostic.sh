#!/bin/sh
# One-shot K4 Wi-Fi diagnostic. Results go to app.log and the e-ink screen.
set -u

ROOT=${WIFI_DIAG_ROOT:-/mnt/us/kindle-weather}
LOG="$ROOT/app.log"
LIPC_SET=${WIFI_DIAG_LIPC_SET:-/usr/bin/lipc-set-prop}
LIPC_GET=${WIFI_DIAG_LIPC_GET:-/usr/bin/lipc-get-prop}
XH=${WIFI_DIAG_XH:-$ROOT/xh}
CA_BUNDLE=${WIFI_DIAG_CA_BUNDLE:-$ROOT/cacert.pem}
EIPS=${WIFI_DIAG_EIPS:-/usr/sbin/eips}
RESOLV_CONF=${WIFI_DIAG_RESOLV_CONF:-/etc/resolv.conf}
BASE_URL=${WIFI_DIAG_BASE_URL:-https://joltstudio.github.io/witney-kindle-weather/device-update}
CONNECT_TIMEOUT=${WIFI_DIAG_CONNECT_TIMEOUT:-120}
POLL_SECONDS=${WIFI_DIAG_POLL_SECONDS:-5}
WORK="$ROOT/.wifi-diagnostic.$$"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') Wi-Fi diagnostic: $1" >> "$LOG"; }

state_now() {
  "$LIPC_GET" com.lab126.wifid cmState 2>&1 | tr -d '\r\n' | sed 's/[[:space:]]*$//'
}

display_line() {
  "$EIPS" "$1" "$2" "$3" >/dev/null 2>&1 || true
}

show_summary() {
  "$EIPS" -c >/dev/null 2>&1 || true
  display_line 0 0 'WITNEY WEATHER WI-FI TEST'
  display_line 0 2 "Wi-Fi request: $request_result"
  display_line 0 3 "Connection state: $final_state"
  display_line 0 4 "Time to connect: $connect_time"
  display_line 0 6 "GitHub HTTPS: $https_result"
  display_line 0 8 "IP address: $ip_address"
  display_line 0 9 "DNS server: $dns_server"
  display_line 0 12 'Details saved in app.log'
  display_line 0 14 'Press Home to return'
}

cleanup() {
  "$LIPC_SET" com.lab126.wifid enable 0 >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

if [ ! -x "$LIPC_SET" ] || [ ! -x "$LIPC_GET" ] || [ ! -x "$XH" ] || [ ! -r "$CA_BUNDLE" ] || [ ! -x "$EIPS" ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') Wi-Fi diagnostic failed: required Kindle tool is missing" >> "$LOG"
  exit 1
fi

mkdir -p "$WORK" || exit 1
case "$CONNECT_TIMEOUT:$POLL_SECONDS" in
  *[!0-9:]*|:*|*:) log 'invalid diagnostic timeout settings'; exit 1 ;;
esac
if [ "$CONNECT_TIMEOUT" -eq 0 ] || [ "$POLL_SECONDS" -eq 0 ]; then
  log 'diagnostic timeout settings must be positive'; exit 1
fi
log 'started'
enable_output=$("$LIPC_SET" com.lab126.wifid enable 1 2>&1)
enable_rc=$?
if [ "$enable_rc" -eq 0 ]; then
  request_result=accepted
  log 'Wi-Fi enable command returned success'
else
  request_result="failed ($enable_rc)"
  [ -n "$enable_output" ] || enable_output='no error text returned'
  log "Wi-Fi enable command returned $enable_rc: $enable_output"
fi

started=$(date +%s)
final_state=unknown
last_state=
connect_time='not connected'
while :; do
  now=$(date +%s)
  elapsed=$((now - started))
  state=$(state_now)
  [ -n "$state" ] || state='unavailable'
  final_state=$state
  if [ "$state" != "$last_state" ]; then
    log "state after ${elapsed}s: $state"
    last_state=$state
  fi
  if [ "$state" = CONNECTED ]; then
    connect_time="${elapsed}s"
    log "Wi-Fi reached CONNECTED after ${elapsed}s"
    break
  fi
  if [ "$elapsed" -ge "$CONNECT_TIMEOUT" ]; then
    log "timed out after ${elapsed}s waiting for CONNECTED; final state: $state"
    break
  fi
  sleep "$POLL_SECONDS"
done

ip_address=$(ifconfig wlan0 2>/dev/null | awk '/inet addr:/ {for (i=1;i<=NF;i++) if ($i ~ /^addr:/) {sub(/^addr:/,"",$i); print $i; exit}} $1 == "inet" {print $2; exit}')
[ -n "$ip_address" ] || ip_address=none
dns_server=$(awk '/^[[:space:]]*nameserver[[:space:]]/ {print $2; exit}' "$RESOLV_CONF" 2>/dev/null)
[ -n "$dns_server" ] || dns_server=none
log "interface IPv4: $ip_address"
log "configured DNS server: $dns_server"

https_result='not tested'
if [ "$final_state" = CONNECTED ]; then
  url="$BASE_URL/manifest.txt?diagnostic=$(date +%s)"
  "$XH" --verify "$CA_BUNDLE" -d -q -o "$WORK/manifest.txt" get "$url" >"$WORK/stdout" 2>"$WORK/stderr" &
  fetch_pid=$!
  elapsed=0
  while kill -0 "$fetch_pid" 2>/dev/null && [ "$elapsed" -lt 30 ]; do
    sleep 1
    elapsed=$((elapsed + 1))
  done
  if kill -0 "$fetch_pid" 2>/dev/null; then
    kill "$fetch_pid" 2>/dev/null || true
    wait "$fetch_pid" 2>/dev/null || true
    https_result='timed out'
    log 'GitHub manifest request timed out after 30s'
  elif wait "$fetch_pid" && [ -s "$WORK/manifest.txt" ]; then
    https_result='OK'
    bytes=$(wc -c < "$WORK/manifest.txt" | tr -d ' ')
    log "GitHub manifest HTTPS succeeded in ${elapsed}s ($bytes bytes)"
  else
    https_result='failed'
    log "GitHub manifest HTTPS failed after ${elapsed}s"
    if [ -s "$WORK/stderr" ]; then
      while IFS= read -r error_line || [ -n "$error_line" ]; do
        log "HTTPS error: $error_line"
      done < "$WORK/stderr"
    fi
  fi
else
  log 'GitHub HTTPS test skipped because Wi-Fi never reached CONNECTED'
fi

"$LIPC_SET" com.lab126.wifid enable 0 >/dev/null 2>&1 || true
log "completed; request=$request_result state=$final_state connected=$connect_time https=$https_result ip=$ip_address dns=$dns_server"
show_summary
exit 0
