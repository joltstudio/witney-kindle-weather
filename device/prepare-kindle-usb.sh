#!/bin/sh
# Download the Kindle 4 HTTPS client and stage the weather files on USB.
# This only copies files; it does not run the installer or modify Kindle root.
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
KINDLE_VOLUME=${KINDLE_VOLUME:-/Volumes/Kindle}
KINDLE_DASH_ARCHIVE=${KINDLE_DASH_ARCHIVE:-}
RELEASE_URL='https://github.com/pascalw/kindle-dash/releases/download/v1.0.0-beta.4/kindle-dash-v1.0.0-beta.4.tgz'
RELEASE_SHA256='3bdf2626dd94bc9636e54ae159f193379aea257a4c39f4b3a91d5f395fa76889'
XH_SHA256='d77c9b66a5bcd2ef0375d922b7f709f8ce4697a9d57c4b2452d6cb7ce6eaef70'
JAILBREAK_ARCHIVE=${JAILBREAK_ARCHIVE:-/private/tmp/kindle-k4-jailbreak-1.8.N.zip}
JAILBREAK_SHA256='e83da520a25b0186433f50d93e80af7245fbdf2bc2fb3593e25c2c01ddec9c52'

if [ ! -d "$KINDLE_VOLUME/documents" ]; then
  echo "Kindle USB volume not found at $KINDLE_VOLUME" >&2
  exit 1
fi

WORK=$(mktemp -d "${TMPDIR:-/tmp}/kindle-weather.XXXXXX")
trap 'rm -rf "$WORK"' EXIT HUP INT TERM
if [ -n "$KINDLE_DASH_ARCHIVE" ]; then
  cp "$KINDLE_DASH_ARCHIVE" "$WORK/kindle-dash.tgz"
else
  curl -fL --retry 2 --max-time 120 "$RELEASE_URL" -o "$WORK/kindle-dash.tgz"
fi
printf '%s  %s\n' "$RELEASE_SHA256" "$WORK/kindle-dash.tgz" | shasum -a 256 -c -
tar -xzf "$WORK/kindle-dash.tgz" -C "$WORK"
printf '%s  %s\n' "$XH_SHA256" "$WORK/xh" | shasum -a 256 -c -
file "$WORK/xh" | grep -q 'ARM, EABI5.*statically linked'

if [ ! -f "$JAILBREAK_ARCHIVE" ]; then
  echo "Matching K4 jailbreak archive not found at $JAILBREAK_ARCHIVE" >&2
  echo 'Set JAILBREAK_ARCHIVE to the verified kindle-k4-jailbreak-1.8.N.zip path.' >&2
  exit 1
fi
printf '%s  %s\n' "$JAILBREAK_SHA256" "$JAILBREAK_ARCHIVE" | shasum -a 256 -c -
mkdir -p "$WORK/jailbreak"
unzip -q "$JAILBREAK_ARCHIVE" 'data.tar.gz' 'ENABLE_DIAGS' 'diagnostic_logs/*' -d "$WORK/jailbreak"
test -s "$WORK/jailbreak/data.tar.gz"
test -f "$WORK/jailbreak/ENABLE_DIAGS"
test -f "$WORK/jailbreak/diagnostic_logs/device_info.xml"

DEST="$KINDLE_VOLUME/kindle-weather"
mkdir -p "$DEST"
cp "$WORK/xh" "$DEST/xh"
cp "$SCRIPT_DIR/kindle-weather-daemon.sh" "$DEST/"
cp "$SCRIPT_DIR/kindle-weather-watchdog.sh" "$DEST/"
cp "$SCRIPT_DIR/kindle-weather-config.example" "$DEST/config.example"
if [ ! -f "$DEST/config" ]; then cp "$SCRIPT_DIR/kindle-weather-config.example" "$DEST/config"; fi
cp "$SCRIPT_DIR/runme-install.sh" "$KINDLE_VOLUME/runme.sh"
cp "$WORK/jailbreak/data.tar.gz" "$KINDLE_VOLUME/data.tar.gz"
cp "$WORK/jailbreak/ENABLE_DIAGS" "$KINDLE_VOLUME/ENABLE_DIAGS"
mkdir -p "$KINDLE_VOLUME/diagnostic_logs"
cp "$WORK/jailbreak/diagnostic_logs/device_info.xml" "$KINDLE_VOLUME/diagnostic_logs/device_info.xml"

echo "Staged the verified static ARM xh client, weather scripts, and matching K4 jailbreak trigger files on $KINDLE_VOLUME."
echo "No installer has run. Review $DEST/config, then safely eject the Kindle."
