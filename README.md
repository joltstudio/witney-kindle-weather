# Witney weather display

A fixed 600×800, monochrome weather display for the Kindle 4 non-touch layout. The local page defaults to a live Open-Meteo forecast; `?mode=fixture` shows a fixed demonstration forecast for visual checks and the reproducible PNG. PNG files are encoded as 8-bit grayscale because the K4 `eips` image viewer distorts RGB PNGs.

## Run it locally

From this directory, start the static server:

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Open `http://127.0.0.1:4173/?mode=live` for live data or `http://127.0.0.1:4173/?mode=fixture` for the deterministic fixture. Stop the server with Ctrl+C.

Run the logic and PNG-format tests:

```sh
npm test
```

Render the exact 600×800 fixture PNG (with the server running and Google Chrome installed):

```sh
node scripts/render.mjs
```

The fixture render is `outputs/witney-weather-600x800.png`. For a validated live snapshot, run `node scripts/fetch-weather.mjs`, then `node scripts/render.mjs --snapshot`; the PNG is `outputs/witney-weather-live-600x800.png`. `node scripts/render.mjs --live` instead lets the browser fetch Open-Meteo directly. No npm packages are required.

## Forecast and graph notes

- The forecast request selects 50 hours so the renderer can choose the next 48 full hourly points. Timestamps are Unix seconds; the page converts them using `Europe/London`, including repeated/missing DST hours. A repeated local hour gets an `a`/`b` suffix.
- The current temperature and condition are visually separate from the hourly plots. The one-line detail row shows feels-like, humidity and wind; humidity is shown as a current value, not an hourly graph. The four forecast graphs share the same x positions; medium-grey lines mark local midnight and date labels show each day. A repeated local hour gets an `a`/`b` suffix.
- The temperature plot shows air temperature as a solid line and feels-like as a dashed line. Both series mark their high and low points without printing values at the points; both high/low summaries appear at left. Rainfall is charted in mm/h and only the maximum hourly amount is summarized. The charts have no horizontal divider rules. Sunshine duration is reported by Open-Meteo in seconds and converted to minutes per forecast hour.
- The page refreshes every 30 minutes, stores the last valid response locally and shows `STALE DATA` if a refresh fails. With no usable cache it says data is unavailable. Open-Meteo forecast service uptime is not guaranteed.
- Footer attribution is shown on-screen. Open-Meteo's free endpoint is limited to personal, non-commercial use (up to 10,000 requests/day) and its data requires CC BY 4.0 attribution. Do not use this endpoint for commercial display.

## Hosted, chrome-free Kindle display

GitHub Actions fetches and validates Open-Meteo data, renders the exact 600×800 grayscale PNG, and updates the public GitHub Pages image every 30 minutes at :17 and :47 UTC. The Kindle's stock browser could not connect to that modern HTTPS site on firmware 4.1.3, so the D01100 uses a KUAL extension to fetch the PNG directly. The D01100 has been jailbroken successfully; its `You are Jailbroken` marker was verified.

The Kindle's bundled `wget` and `curl` are too old for modern HTTPS. This device path uses `xh`, a statically linked ARM HTTPS client bundled in the Kindle 4 Non-Touch release of [kindle-dash](https://github.com/pascalw/kindle-dash/releases/tag/v1.0.0-beta.4), whose maintainer reports K4NT testing. The project bundles Mozilla CA roots from [curl's CA Extract](https://curl.se/docs/caextract.html) and passes that PEM file with `xh --verify`; TLS verification stays enabled. The CA bundle is MPL 2.0, with its license in `licenses/Mozilla-CA-MPL-2.0.txt`. A Mac-side staging script downloads the pinned `xh` release, verifies its archive and binary SHA-256 values, and copies the client, CA bundle and scripts to the Kindle USB volume. The Kindle then fetches the public PNG directly from GitHub Pages over HTTPS; no server, host, API key or paid service is needed. The scheduled Pages workflow continues to refresh the image while the Mac is off.

The first device version used a system-cron watchdog and a background daemon that toggled Wi-Fi and suspended the Kindle. The user reported UI freezes, stale images and USB drops. Captured logs confirmed intermittent image fetch/display and DNS failures. A stop-only replacement was staged on the Kindle; the last available log predates confirmation that it ran. The replacement app is a KUAL extension: it starts only when opened, refreshes every 30 minutes while open, keeps Wi-Fi enabled, and restores the normal screen-saver setting when stopped. It still draws the grayscale PNG with `eips`, but avoids an automatic boot daemon and kernel suspend.

## App-like Kindle launcher

The Kindle 4 uses the legacy KUAL-KDK Kindlet, with MKK installed separately from the jailbreak. This D01100 is now on firmware 4.1.4. Its owner ran the maintainer's 2025 keystore update and reports that KUAL now launches. The weather extension has opened and fetched a PNG on-device. These reports confirm the path works at least once; repeated-refresh reliability is still being checked.

The local installer bundle is retained for recovery only; do not rerun its firmware, MKK, or keystore update files. The extension exposes Open, Refresh and Exit actions from KUAL. Its Open/Refresh menu entries do not request a delayed KUAL redraw, which previously put KUAL text over the forecast. A KUAL menu-overlay fix was copied to the device and the user reports the display now looks better. The Kindle's own top status bar is separate: K4 community reports document that the system can redraw it over a full-screen `eips` image when battery or Wi-Fi state changes. This remains a device-level limitation; the weather PNG cannot hide it.

The Kindle-dash release client is pinned to v1.0.0-beta.4 and verified by SHA-256 before staging. The preparation script also verifies the already downloaded K4 jailbreak archive (default path `/private/tmp/kindle-k4-jailbreak-1.8.N.zip`; override with `JAILBREAK_ARCHIVE=/path/to/archive`). That script is for the initial jailbreak setup only; do not run it again on this already-jailbroken device. With the Kindle mounted as `/Volumes/Kindle`, it can be run by:

```sh
sh device/prepare-kindle-usb.sh
```

This copies the HTTPS client, CA bundle, config and scripts, plus the K4 jailbreak's Diagnostics trigger files and one-shot `runme.sh` installer. It does not execute the installer or alter Kindle system files. Do not use this initial-setup script to install the KUAL app. The KUAL package is built separately with `sh scripts/build-kual-install.sh`; follow its included README only after the current stop-only watchdog state has been checked. The Kindle-specific fetch and display must be verified on the device before considering installation complete.

The GitHub Pages preview is [https://joltstudio.github.io/witney-kindle-weather/kindle.html](https://joltstudio.github.io/witney-kindle-weather/kindle.html). It remains useful on modern browsers; it is not the device renderer.

## Kindle compatibility status

The target is a jailbroken D01100 Kindle 4 Non-Touch, firmware **4.1.4**. Jailbreak, KUAL launch, and one open/fetch of the weather image are confirmed by user report and app logs. GitHub Pages is public and refreshes the image every 30 minutes. A read-only backup of the user partition was made; the earlier weather daemon's stop state remains unconfirmed. The legacy KUAL menu overlay was addressed; the Kindle status bar may still redraw over the image. No firmware, jailbreak, MKK, or keystore package should be run again.

## Reference pages

- Open-Meteo API fields and timestamp behaviour: https://open-meteo.com/en/docs
- Open-Meteo free-use terms: https://open-meteo.com/en/terms
- Amazon previous Kindle software updates: https://digprjsurvey.amazon.com/csad/help/node/GX3VVAQS4DYDE5KE?theme=light
- MobileRead Kindle 4 Non-Touch compatibility page: https://wiki.mobileread.com/wiki/Kindle4NTHacking
- MobileRead K4 jailbreak package thread: https://www.mobileread.com/forums/showthread.php?t=191158
- MobileRead USBNetwork package thread: https://www.mobileread.com/forums/showthread.php?t=88004
- K4NT weather-daemon reference: https://github.com/melihkarakelle/kindle4-weather-display
- Kindle 4 HTTPS image-fetcher reference and release: https://github.com/pascalw/kindle-dash
- Kindle 4 `eips` RGB-PNG stretch issue and grayscale requirement: https://mpetroff.net/2012/09/kindle-weather-display/
- `eips` image format/options reference: https://wiki.mobileread.com/wiki/Eips
- xh CLI custom CA bundle option: https://github.com/ducaale/xh/blob/master/doc/xh.1.md
- Mozilla CA bundle source (MPL 2.0): https://curl.se/docs/caextract.html
- Mozilla Public License 2.0: https://www.mozilla.org/en-US/MPL/2.0/
- MobileRead K4NT-specific Picture Viewer steps: https://www.mobileread.com/forums/showthread.php?nojs=1&t=152104
- Kindle 4 User Guide (USB transfer): https://kindle.s3.amazonaws.com/Kindle_User%27s_Guide_4th_Edition.pdf
- MobileRead Kindlet Kit (MKK): https://www.mobileread.com/forums/showthread.php?t=233932
- KUAL launcher and legacy Kindlet instructions: https://www.mobileread.com/forums/showthread.php?t=203326
- KUAL K4/MRPI guide: https://github.com/KindleModding/kindlemodding.github.io/blob/main/content/jailbreaking/Legacy/post-jailbreak/installing-kual-mrpi/__index.md
- KUAL maintainer's 2025 updated developer keystore post: https://www.mobileread.com/forums/showpost.php?p=4506164&postcount=1295
- Kindle 4 KUAL certificate/firmware troubleshooting: https://www.mobileread.com/forums/showthread.php?p=4517996
- Inter font and SIL OFL licence: https://github.com/rsms/inter/blob/master/LICENSE.txt
- GitHub Pages custom workflows: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- GitHub Actions billing: https://docs.github.com/en/billing/concepts/product-billing/github-actions
