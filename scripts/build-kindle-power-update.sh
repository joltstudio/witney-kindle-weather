#!/bin/sh
set -eu

PROJECT_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
OUTPUT_DIR="$PROJECT_ROOT/outputs"
ZIP_PATH="$OUTPUT_DIR/witney-weather-low-power-update.zip"
STAGE_DIR=$(mktemp -d)
trap 'rm -rf "$STAGE_DIR"' EXIT HUP INT TERM

mkdir -p \
  "$STAGE_DIR/extensions/WitneyWeather/bin" \
  "$STAGE_DIR/kindle-weather"
cp "$PROJECT_ROOT/device/kual-extension/WitneyWeather/bin/weather.sh" \
  "$STAGE_DIR/extensions/WitneyWeather/bin/weather.sh"
cp "$PROJECT_ROOT/device/kual-extension/WitneyWeather/bin/weather-loop.sh" \
  "$STAGE_DIR/extensions/WitneyWeather/bin/weather-loop.sh"
cp "$PROJECT_ROOT/device/kindle-weather-watchdog.sh" \
  "$STAGE_DIR/kindle-weather/kindle-weather-watchdog.sh"

cat > "$STAGE_DIR/README-UPDATE.txt" <<'EOF'
Witney Weather — low-power and boot-launch update
=================================================

This update contains only the two KUAL app scripts and the existing cron
watchdog target. It does not include firmware, jailbreak, MKK or keystore
installers, and does not alter the root filesystem or crontab.

Before copying, confirm the once-per-minute root cron line already installed
for /mnt/us/kindle-weather/kindle-weather-watchdog.sh is still present. Back
up that watchdog and the two extension scripts from the Kindle user volume.
Copy the files in this archive to the matching paths on the Kindle volume,
preserving the existing /mnt/us/kindle-weather/config, xh, CA bundle, cached
weather image and KUAL menu.

After safely ejecting and unplugging, the watchdog should start Witney Weather
within one cron minute after boot. The display fetches, draws, turns Wi-Fi off,
and uses the K4 RTC alarm and suspend-to-RAM for the 30-minute idle interval.
If RTC suspend is unavailable, it falls back to a sleeping timer. Press Home to
return to the library; that suppresses relaunch until the next reboot. Open or
refresh from KUAL clears the opt-out marker.

Verify on device before relying on it: the app log should show Wi-Fi off and
RTC suspend, the image should remain visible during suspend, a scheduled wake
should fetch and redraw, Home should exit, and reboot should launch it again.
If the device does not resume at the interval, hold Power to wake it and restore
the backed-up scripts over USB. The e-ink image does not need a screen saver;
periodic full refreshes are normal and clear temporary ghosting.
EOF

mkdir -p "$OUTPUT_DIR"
rm -f "$ZIP_PATH"
(
  cd "$STAGE_DIR"
  zip -r -X "$ZIP_PATH" \
    README-UPDATE.txt \
    extensions/WitneyWeather/bin/weather.sh \
    extensions/WitneyWeather/bin/weather-loop.sh \
    kindle-weather/kindle-weather-watchdog.sh
)
unzip -t "$ZIP_PATH"
echo "Built $ZIP_PATH"
