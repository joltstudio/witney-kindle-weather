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

Build the user-volume-only low-power Kindle update bundle:

```sh
sh scripts/build-kindle-power-update.sh
```

It writes `outputs/witney-weather-low-power-update.zip`. The bundle contains the KUAL menu, Wi-Fi updater, Wi-Fi diagnostic, weather scripts, and existing root-cron watchdog. Install it once over USB; after that, KUAL's `Update Weather App over Wi-Fi` action downloads and verifies future app files from GitHub Pages, keeps a rollback copy, and restarts the display. The updater preserves your local config. This changes user-volume files only; it does not install firmware or alter the root filesystem.

## Updating the Kindle app over Wi-Fi

The weather image already updates over Wi-Fi. Device code does not. The low-power update bundle now includes a KUAL updater bootstrap. Install the bundle once over USB, then select **Update Weather App over Wi-Fi** in KUAL for later app updates. The updater uses the existing HTTPS client and CA bundle, checks the downloaded files against a SHA-256 manifest, stages them before replacing the installed files, keeps a rollback copy, logs the outcome to `app.log`, preserves the device's local config, and restarts the display. It is manual; it does not silently install code in the background. KUAL also includes **Test Wi-Fi Connection**, which waits up to 120 seconds for the Kindle's `cmState` to become `CONNECTED`, measures connection time, records IP/DNS details, tests HTTPS to the GitHub Pages update host, and shows a summary on screen.

The bootstrap itself and recovery still require USB. The Wi-Fi update route has not yet been verified on the physical Kindle; first-run verification must confirm the device has a SHA-256 utility and that a successful update appears in its log.

## Forecast and graph notes

- The forecast request selects 121 hourly values so the renderer can choose the next 120 full hourly points after the current partial hour. Timestamps are Unix seconds; the page converts them using `Europe/London`, including repeated/missing DST hours.
- Current temperature, humidity and wind use fresh Brize Norton METAR readings when available; feels-like remains Open-Meteo because METAR does not report it. The source and observation time appear in the footer. The charts show only the next 120 hours of forecast data; no observed or historical trace appears in them. Medium-grey vertical lines mark local midnight and weekday labels are uppercase. Unnumbered ticks mark six-hour intervals.
- The temperature plot shows forecast air temperature as a solid line and feels-like as a dashed line; high/low points appear without values at the points, and summaries appear at left. Rainfall is charted in mm/h and only the maximum forecast hourly amount is summarized. The charts have no horizontal divider rules. Sunshine duration is reported by Open-Meteo in seconds and converted to minutes per forecast hour.
- The browser preview refreshes every 30 minutes, stores the last valid response locally, and uses the latest published forecast snapshot if the browser's direct Open-Meteo request fails. It labels a snapshot older than an hour `STALE DATA`; without a usable cache it says data is unavailable. Open-Meteo forecast service uptime is not guaranteed.
- Open-Meteo's default Best Match model selection is intentional. Its UK blend includes Met Office UKV 2 km when available, with global-model fallback. Pinning UKV would reduce fallback options; Best Match covers the 120-hour display window. The requested hourly temperature, apparent temperature, precipitation, humidity, wind and sunshine-duration fields are supported. Sunshine duration is a derived model field, not cloud cover.
- The scheduled build fetches Brize Norton METARs from NOAA's free machine-readable Aviation Weather API. EGVN is about 7 km from Witney and represents airport conditions. A fresh report supplies current temperature, humidity and wind in the existing current-conditions row; feels-like remains the Open-Meteo apparent temperature because METAR has no feels-like field. The footer identifies NOAA EGVN and the observation time. METAR supplies no dependable hourly rainfall amount or sunshine duration, so those remain forecast-only. Relative humidity is calculated from rounded METAR temperature/dew point. Reports older than 90 minutes or outside plausible ranges are rejected; network/API failure leaves the forecast working without observations. The action makes one limited-scope observation request per scheduled update. NOAA API guidance: https://aviationweather.gov/data/api/ .
- Weather Underground IWITNE24 was not integrated: its official PWS API requires an account/API key and current terms restrict reuse/derivative use. No scraping or paid source is used. Sources: https://www.wunderground.com/pws-api and https://wx-next-privacy.vercel.weather.com/privacy/terms-of-use .
- Footer attribution is shown on-screen. Open-Meteo's free endpoint is limited to personal, non-commercial use (up to 10,000 requests/day) and requires CC BY 4.0 attribution. Open-Meteo states UK Met Office data is CC BY-SA 4.0 and derived products must use the same or a compatible licence. The display credits Open-Meteo, UK Met Office and NOAA; review the data licences before redistributing the rendered forecast or using the endpoint commercially. Sources: https://open-meteo.com/en/docs and https://open-meteo.com/en/docs/ukmo-api .

## Hosted, chrome-free Kindle display

GitHub Actions is scheduled hourly at :57 UTC, ahead of the Kindle's :05 check. A scheduled event publishes when the prior snapshot is at least 55 minutes old; runner start time does not need to land in the :57 minute. The age guard prevents duplicate forecast API requests if GitHub and the optional Cloudflare timer overlap. Pushes and manual runs publish immediately. GitHub may delay or drop scheduled runs, so the timer is best-effort. Forecast fetching retries transient failures five times and logs a warning when it must render cached data. If the API and cache are unavailable, the workflow keeps the previously published PNG rather than showing a blank image. The Kindle's stock browser could not connect to that modern HTTPS site on firmware 4.1.3, so the D01100 uses a KUAL extension to fetch the PNG directly. The D01100 has been jailbroken successfully; its `You are Jailbroken` marker was verified.

The Kindle's bundled `wget` and `curl` are too old for modern HTTPS. This device path uses `xh`, a statically linked ARM HTTPS client bundled in the Kindle 4 Non-Touch release of [kindle-dash](https://github.com/pascalw/kindle-dash/releases/tag/v1.0.0-beta.4), whose maintainer reports K4NT testing. The project bundles Mozilla CA roots from [curl's CA Extract](https://curl.se/docs/caextract.html) and passes that PEM file with `xh --verify`; TLS verification stays enabled. The CA bundle is MPL 2.0, with its license in `licenses/Mozilla-CA-MPL-2.0.txt`. A Mac-side staging script downloads the pinned `xh` release, verifies its archive and binary SHA-256 values, and copies the client, CA bundle and scripts to the Kindle USB volume. The Kindle then fetches the public PNG directly from GitHub Pages over HTTPS; no server, host, API key or paid service is needed. GitHub Actions is intended to refresh the image while the Mac is off, but its schedule is currently unverified and has missed expected runs.

The KUAL extension fetches the PNG over HTTPS, draws it with `eips`, and leaves the previous frame visible on network failure. It turns Wi-Fi off between refreshes and checks hourly from 05:05 through 23:05 in Kindle local time; DST follows the device clock. It waits 60 seconds for Wi-Fi to connect before fetching, then turns Wi-Fi off after the request. It uses the Kindle 4 RTC alarm plus suspend-to-RAM when available, and a low-CPU shell timer otherwise. `WEATHER_REFRESH_TIMES` and `WEATHER_WIFI_SETTLE_SECONDS` in `/mnt/us/kindle-weather/config` can override these settings. The forecast remains on the e-ink panel during suspend; there is no separate screen saver. The existing once-per-minute root cron watchdog can start the app after boot and recover it after a crash. Home creates a temporary opt-out marker, so the watchdog leaves the Kindle at the library until the next reboot; manually opening or refreshing from KUAL clears that marker.

## App-like Kindle launcher

The Kindle 4 uses the legacy KUAL-KDK Kindlet, with MKK installed separately from the jailbreak. This D01100 is now on firmware 4.1.4. Its owner ran the maintainer's 2025 keystore update and reports that KUAL now launches. The weather extension has opened and fetched a PNG on-device. These reports confirm the path works at least once; repeated-refresh reliability is still being checked.

The local installer bundle is retained for recovery only; do not rerun its firmware, MKK, or keystore update files. The extension exposes Open, Refresh and Exit actions from KUAL. Its Open/Refresh menu entries do not request a delayed KUAL redraw, which previously put KUAL text over the forecast. At startup it displays the last cached image first, then fetches fresh data. On K4 firmware, the native status strip is owned by the CVM framework; the weather loop pauses CVM while the full-screen forecast is active. Press the physical Home button to exit: `/usr/bin/waitforkey` detects it, cancels the tracked sleep child, and signals the display loop. The loop resumes CVM and forwards Home to return to the library. KUAL's stop action cancels the same sleep child before signaling the loop. Long waits remain asleep between checks instead of polling each second. Wi-Fi and screen-saver state are restored asynchronously so a slow LIPC/network service cannot block the return to KUAL. The once-per-minute watchdog restarts the app after a crash, resumes CVM if needed, and starts the app after boot. Home's opt-out marker clears on reboot. The low-power RTC/suspend path and boot-launch behavior are prepared locally but not yet confirmed on the device.

The Kindle-dash release client is pinned to v1.0.0-beta.4 and verified by SHA-256 before staging. The preparation script also verifies the already downloaded K4 jailbreak archive (default path `/private/tmp/kindle-k4-jailbreak-1.8.N.zip`; override with `JAILBREAK_ARCHIVE=/path/to/archive`). That script is for the initial jailbreak setup only; do not run it again on this already-jailbroken device. With the Kindle mounted as `/Volumes/Kindle`, it can be run by:

```sh
sh device/prepare-kindle-usb.sh
```

This copies the HTTPS client, CA bundle, config and scripts, plus the K4 jailbreak's Diagnostics trigger files and one-shot `runme.sh` installer. It does not execute the installer or alter Kindle system files. Do not use this initial-setup script to install the KUAL app. The KUAL package is built separately with `sh scripts/build-kual-install.sh`; follow its included README only after the current stop-only watchdog state has been checked. The Kindle-specific fetch and display must be verified on the device before considering installation complete.

The GitHub Pages preview is [https://joltstudio.github.io/witney-kindle-weather/kindle.html](https://joltstudio.github.io/witney-kindle-weather/kindle.html). It remains useful on modern browsers; it is not the device renderer.

## Kindle compatibility status

The target is a jailbroken D01100 Kindle 4 Non-Touch, firmware **4.1.4**. Jailbreak, KUAL launch, and weather image fetch are confirmed by user report and app logs. The hosted image is published hourly. The device's hourly checks are firing, but its latest app log shows Wi-Fi enable request failures followed by DNS lookup failures; last successful device fetch was 2026-11-21 18:31. KUAL now has a diagnostic action to record connection state/time, IP/DNS and HTTPS status on-device before changing the weather loop. A read-only backup of the user partition was made; the earlier weather daemon's stop state remains unconfirmed. The legacy KUAL menu overlay was addressed; the Kindle status bar may still redraw over the image. No firmware, jailbreak, MKK, or keystore package should be run again.

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
