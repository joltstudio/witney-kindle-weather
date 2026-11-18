#!/bin/sh
set -eu

PROJECT_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
DOWNLOAD_DIR="$PROJECT_ROOT/work/kual-downloads"
STAGE_DIR="$PROJECT_ROOT/outputs/witney-weather-kual-install"
ZIP_PATH="$PROJECT_ROOT/outputs/witney-weather-kual-install.zip"
MKK_ARCHIVE="$DOWNLOAD_DIR/kindle-mkk-20141129-r18833.tar.xz"
KUAL_ARCHIVE="$DOWNLOAD_DIR/KUAL-v2.7.37-gfcb45b5-20250419.tar.xz"
DEV_CERTS_ARCHIVE="$DOWNLOAD_DIR/DevCerts-20250419-KeyStore.zip"
MKK_URL='https://storage.gra.cloud.ovh.net/v1/AUTH_2ac4bfee353948ec8ea7fd1710574097/mr-public/Touch/kindle-mkk-20141129-r18833.tar.xz'
KUAL_URL='https://storage.gra.cloud.ovh.net/v1/AUTH_2ac4bfee353948ec8ea7fd1710574097/mr-public/KUAL/KUAL-v2.7.37-gfcb45b5-20250419.tar.xz'
DEV_CERTS_URL='https://www.mobileread.com/forums/attachment.php?attachmentid=215127&d=1745098511&s=f2b9184716c1a0e186987388eb04a7ff'

mkdir -p "$DOWNLOAD_DIR"
curl -fL --retry 2 "$MKK_URL" -o "$MKK_ARCHIVE"
curl -fL --retry 2 "$KUAL_URL" -o "$KUAL_ARCHIVE"
curl -fL --retry 2 "$DEV_CERTS_URL" -o "$DEV_CERTS_ARCHIVE"

MKK_MD5=$(md5 -q "$MKK_ARCHIVE")
if [ "$MKK_MD5" != '8af8c2a4cbdf6a9f4a45a63bb4c4dd02' ]; then
  echo 'MKK archive MD5 does not match the MobileRead snapshot.' >&2
  exit 1
fi
KUAL_SHA=$(shasum -a 256 "$KUAL_ARCHIVE" | awk '{print $1}')
if [ "$KUAL_SHA" != '40c4b68712213adc7b667b9502cdd0c8099761fce1e1bf2b161b84102af54135' ]; then
  echo 'KUAL archive SHA-256 does not match the verified KUAL 2.7.37 archive.' >&2
  exit 1
fi
DEV_CERTS_SHA=$(shasum -a 256 "$DEV_CERTS_ARCHIVE" | awk '{print $1}')
if [ "$DEV_CERTS_SHA" != '48426add32e3567aeba9eebd639b7e3d9bd1d1bed2266a55bf23473e77acc863' ]; then
  echo 'DevCerts archive SHA-256 does not match the MobileRead maintainer attachment.' >&2
  exit 1
fi

rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR/documents" "$STAGE_DIR/extensions"
tar -xOf "$MKK_ARCHIVE" DevCerts/Update_mkk-20141129-k4-ALL_install.bin \
  > "$STAGE_DIR/Update_mkk-20141129-k4-ALL_install.bin"
unzip -p "$DEV_CERTS_ARCHIVE" Update_mkk-20250419-k4-ALL_keystore-install.bin \
  > "$STAGE_DIR/Update_mkk-20250419-k4-ALL_keystore-install.bin"
tar -xOf "$KUAL_ARCHIVE" KUAL-KDK-1.0.azw2 \
  > "$STAGE_DIR/documents/KUAL-KDK-1.0.azw2"
cp -R "$PROJECT_ROOT/device/kual-extension/WitneyWeather" "$STAGE_DIR/extensions/"
cp "$PROJECT_ROOT/device/kindle-weather-watchdog.sh" "$STAGE_DIR/kindle-weather-watchdog.sh"

cat > "$STAGE_DIR/README-INSTALL.txt" <<'EOF'
Witney Weather for Kindle 4 Non-Touch (D01100)
================================================================

This bundle contains the K4-targeted 2014 MKK installer, the 2025 K4
developer-keystore update, KUAL-KDK-1.0.azw2, and the Witney Weather extension.

The device must already contain /mnt/us/kindle-weather/config, xh, and cacert.pem
from the earlier weather setup. The extension fetches the configured live
600x800 grayscale PNG, retains the last good image on failure, turns Wi-Fi off
between updates, and uses the K4 RTC wake alarm plus suspend-to-RAM when available.
The default refresh interval is 30 minutes.

Install sequence
----------------
1. Verify the Kindle is stable and the stop-only weather watchdog has run.
2. Update firmware 4.1.3 to Amazon's official 4.1.4 release first. Install
   only this update file at a time; reconnect and verify the device afterward.
3. If MKK 20141129 is not already installed, stage only
   Update_mkk-20141129-k4-ALL_install.bin in the USB root and run Menu >
   Settings > Menu > Update Your Kindle. The staged MKK file's absence does
   not prove whether this step already succeeded.
4. Stage only Update_mkk-20250419-k4-ALL_keystore-install.bin in the USB root,
   eject, and run Update Your Kindle. This is the maintainer's experimental
   keystore-only package; keep Wi-Fi off during certificate setup.
5. Ensure KUAL-KDK-1.0.azw2 is in documents and WitneyWeather is in extensions.
   Restart and tap KUAL in the library.
6. In KUAL > Witney Weather, choose Open Weather Display. Use Refresh Forecast
   Now or Exit Weather Display from KUAL. The physical Home button exits to the
   library and suppresses auto-launch until the next reboot.
7. To enable boot launch, keep the existing once-per-minute root cron entry and
   replace /mnt/us/kindle-weather/kindle-weather-watchdog.sh with the matching
   kindle-weather-watchdog.sh from the project. Back up the current watchdog
   first. The watchdog starts the KUAL app after boot and after a crash, but
   respects the Home/Exit marker until reboot.

The low-power suspend and unattended boot paths must be verified on the actual
device before relying on them. If the RTC wake alarm is absent, the app falls
back to a sleeping shell timer and updates continue only while that process runs.

MKK source: https://www.mobileread.com/forums/showthread.php?t=233932
KUAL source: https://www.mobileread.com/forums/showthread.php?t=203326
IMPORTANT: Amazon lists firmware 4.1.4 as current and explicitly provides a
direct update from 4.1.3. K4 user reports say the rebuilt KUAL/certificate
setup requires 4.1.4. The maintainer describes the 2025 DevCerts attachment as
untested. Do not proceed until stability is verified; get action-time
confirmation before running any third-party update package.

Some K4 users report Wi-Fi can replace the updated developer keystore on an
unregistered device, which can prevent KUAL from launching again. This remains
an on-device risk to test before relying on the connected weather display.

MKK archive MD5, KUAL archive SHA-256 and DevCerts attachment SHA-256 are
checked by scripts/build-kual-install.sh. Firmware must be installed separately.
EOF

(
  cd "$STAGE_DIR"
  zip -r -FS "$ZIP_PATH" Update_mkk-20141129-k4-ALL_install.bin Update_mkk-20250419-k4-ALL_keystore-install.bin documents/KUAL-KDK-1.0.azw2 extensions/WitneyWeather kindle-weather-watchdog.sh README-INSTALL.txt
)
unzip -t "$ZIP_PATH"
echo "Built $ZIP_PATH"
