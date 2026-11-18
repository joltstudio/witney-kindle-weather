#!/bin/sh
set -eu

PROJECT_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
DOWNLOAD_DIR="$PROJECT_ROOT/work/kual-downloads"
STAGE_DIR="$PROJECT_ROOT/outputs/witney-weather-kual-install"
ZIP_PATH="$PROJECT_ROOT/outputs/witney-weather-kual-install.zip"
MKK_ARCHIVE="$DOWNLOAD_DIR/kindle-mkk-20141129-r18833.tar.xz"
KUAL_ARCHIVE="$DOWNLOAD_DIR/KUAL-v2.7.37-gfcb45b5-20250419.tar.xz"
MKK_URL='https://storage.gra.cloud.ovh.net/v1/AUTH_2ac4bfee353948ec8ea7fd1710574097/mr-public/Touch/kindle-mkk-20141129-r18833.tar.xz'
KUAL_URL='https://storage.gra.cloud.ovh.net/v1/AUTH_2ac4bfee353948ec8ea7fd1710574097/mr-public/KUAL/KUAL-v2.7.37-gfcb45b5-20250419.tar.xz'

mkdir -p "$DOWNLOAD_DIR"
curl -fL --retry 2 "$MKK_URL" -o "$MKK_ARCHIVE"
curl -fL --retry 2 "$KUAL_URL" -o "$KUAL_ARCHIVE"

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

rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR/documents" "$STAGE_DIR/extensions"
tar -xOf "$MKK_ARCHIVE" DevCerts/Update_mkk-20141129-k4-ALL_install.bin \
  > "$STAGE_DIR/Update_mkk-20141129-k4-ALL_install.bin"
tar -xOf "$KUAL_ARCHIVE" KUAL-KDK-1.0.azw2 \
  > "$STAGE_DIR/documents/KUAL-KDK-1.0.azw2"
cp -R "$PROJECT_ROOT/device/kual-extension/WitneyWeather" "$STAGE_DIR/extensions/"

cat > "$STAGE_DIR/README-INSTALL.txt" <<'EOF'
Witney Weather for Kindle 4 Non-Touch (D01100), firmware 4.1.3
================================================================

This bundle contains the K4-targeted MobileRead Kindlet Kit installer,
KUAL-KDK-1.0.azw2, and the Witney Weather KUAL extension.

The device must already contain /mnt/us/kindle-weather/config, xh, and cacert.pem
from the earlier weather setup. The extension fetches the configured live
600x800 grayscale PNG. It starts only when opened, keeps Wi-Fi enabled, refreshes
every 30 minutes, retains the last good image on failure, and restores the normal
screen-saver setting when stopped.

Install sequence
----------------
1. Verify the stop-only watchdog has taken effect and the Kindle is stable.
2. Copy Update_mkk-20141129-k4-ALL_install.bin to the Kindle USB root.
3. Copy documents/KUAL-KDK-1.0.azw2 to the Kindle documents folder.
4. Copy extensions/WitneyWeather to the Kindle extensions folder.
5. Eject the Kindle and disconnect USB.
6. On Kindle Home, select Menu > Settings, then Menu > Update Your Kindle.
7. Open KUAL in the library, choose Witney Weather, then Open Weather Display.
   Refresh Forecast Now and Exit Weather Display are also available in KUAL.

MKK source: https://www.mobileread.com/forums/showthread.php?t=233932
KUAL source: https://www.mobileread.com/forums/showthread.php?t=203326
The MKK archive MD5 is checked against the MobileRead snapshot listing;
KUAL archive SHA-256 is pinned in scripts/build-kual-install.sh.
EOF

(
  cd "$STAGE_DIR"
  zip -r -FS "$ZIP_PATH" Update_mkk-20141129-k4-ALL_install.bin documents/KUAL-KDK-1.0.azw2 extensions/WitneyWeather README-INSTALL.txt
)
unzip -t "$ZIP_PATH"
echo "Built $ZIP_PATH"
