# Witney weather display

A fixed 600×800, monochrome weather display for the Kindle 4 non-touch layout. The local page defaults to a live Open-Meteo forecast; `?mode=fixture` shows a fixed demonstration forecast for visual checks and the reproducible PNG.

## Run it locally

From this directory, start the static server:

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Open `http://127.0.0.1:4173/?mode=live` for live data or `http://127.0.0.1:4173/?mode=fixture` for the deterministic fixture. Stop the server with Ctrl+C.

Run the logic tests:

```sh
node --test tests/weather.test.js
```

Render the exact 600×800 fixture PNG (with the server running and Google Chrome installed):

```sh
node scripts/render.mjs
```

The fixture render is `outputs/witney-weather-600x800.png`. For a validated live snapshot, run `node scripts/fetch-weather.mjs`, then `node scripts/render.mjs --snapshot`; the PNG is `outputs/witney-weather-live-600x800.png`. `node scripts/render.mjs --live` instead lets the browser fetch Open-Meteo directly. No npm packages are required.

## Forecast and graph notes

- The forecast request selects 50 hours so the renderer can choose the next 48 full hourly points. Timestamps are Unix seconds; the page converts them using `Europe/London`, including repeated/missing DST hours. A repeated local hour gets an `a`/`b` suffix.
- The current temperature and condition are visually separate from the hourly plots. All charts share the same x positions; light grey lines mark local midnight and date labels show each day. A repeated local hour gets an `a`/`b` suffix.
- The temperature plot shows air temperature as a solid line and feels-like as a dashed line. Both series mark their high and low points without printing values at the points; both high/low summaries appear at left. Rainfall is charted in mm/h and only the maximum hourly amount is summarized. The charts have no horizontal divider rules; fine, pale vertical lines mark local midnight. Sunshine duration is reported by Open-Meteo in seconds and converted to minutes per forecast hour.
- The page refreshes every 30 minutes, stores the last valid response locally and shows `STALE DATA` if a refresh fails. With no usable cache it says data is unavailable. Open-Meteo forecast service uptime is not guaranteed.
- Footer attribution is shown on-screen. Open-Meteo's free endpoint is limited to personal, non-commercial use (up to 10,000 requests/day) and its data requires CC BY 4.0 attribution. Do not use this endpoint for commercial display.

## Hosted, chrome-free Kindle display

GitHub Actions fetches and validates Open-Meteo data, renders the exact 600×800 PNG, and updates the public GitHub Pages image every 30 minutes. The Kindle's stock browser cannot connect to that modern HTTPS site on firmware 4.1.3. The D01100 has been jailbroken successfully; its `You are Jailbroken` marker was verified.

The Kindle's bundled `wget` and `curl` are too old for modern HTTPS. This device path uses `xh`, a statically linked ARM HTTPS client bundled in the Kindle 4 Non-Touch release of [kindle-dash](https://github.com/pascalw/kindle-dash/releases/tag/v1.0.0-beta.4), whose maintainer reports K4NT testing. Firmware 4.1.3 has no CA bundle at the path `xh` expects, so the project bundles the current Mozilla CA roots from [curl's CA Extract](https://curl.se/docs/caextract.html) and passes that PEM file with `xh --verify`; TLS verification stays enabled. The CA bundle is MPL 2.0, with its license in `licenses/Mozilla-CA-MPL-2.0.txt`. A Mac-side staging script downloads the pinned `xh` release, verifies its archive and binary SHA-256 values, and copies the client, CA bundle and scripts to the Kindle USB volume. The Kindle then fetches the public PNG directly from GitHub Pages over HTTPS; no server, host, API key or paid service is needed. The scheduled Pages workflow continues to refresh the image while the Mac is off.

The daemon uses `eips` to draw the PNG directly to the screen, then sleeps and wakes on an RTC alarm every 30 minutes. The e-ink screen retains the last image without browser chrome. If the fetch fails, the previous frame stays displayed and the reason is logged in `/mnt/us/kindle-weather/daemon.log`. `runme-install.sh` validates the staged files and configures the watchdog in normal-system cron; HTTPS is attempted by the daemon on normal boot, where Kindle services are available.

The Kindle-dash release client is pinned to v1.0.0-beta.4 and verified by SHA-256 before staging. The preparation script also verifies the already downloaded K4 jailbreak archive (default path `/private/tmp/kindle-k4-jailbreak-1.8.N.zip`; override with `JAILBREAK_ARCHIVE=/path/to/archive`). With the Kindle mounted as `/Volumes/Kindle`, prepare the USB files by running:

```sh
sh device/prepare-kindle-usb.sh
```

This copies the HTTPS client, CA bundle, config and scripts, plus the K4 jailbreak's Diagnostics trigger files and one-shot `runme.sh` installer. It does not execute the installer or alter Kindle system files. On an already jailbroken device, the trigger files are not needed for routine updates; stage the updated daemon and CA bundle through USB storage, safely eject, then let normal-system cron retry the image fetch. Do not repeat the Diagnostics flow to update weather files. The Kindle-specific TLS fetch and display must be verified from `daemon.log` and the on-screen result before considering installation complete.

The GitHub Pages preview is [https://joltstudio.github.io/witney-kindle-weather/kindle.html](https://joltstudio.github.io/witney-kindle-weather/kindle.html). It remains useful on modern browsers; it is not the device renderer.

## Kindle compatibility status

The user reports a D01100 Kindle 4 Non-Touch on firmware **4.1.3**. MobileRead's K4NT page lists 4.0.0–4.1.4, and the matching K4 package was used. Jailbreak completion was verified. The weather watchdog and daemon files are on the Kindle; observed logs show cron starts the daemon, but initial HTTPS attempts failed because the system CA bundle was absent. A custom Mozilla CA bundle and explicit `xh --verify` path are now added to the project; live fetch and screen rendering still need verification.

## Reference pages

- Open-Meteo API fields and timestamp behaviour: https://open-meteo.com/en/docs
- Open-Meteo free-use terms: https://open-meteo.com/en/terms
- Amazon previous Kindle software updates: https://digprjsurvey.amazon.com/csad/help/node/GX3VVAQS4DYDE5KE?theme=light
- MobileRead Kindle 4 Non-Touch compatibility page: https://wiki.mobileread.com/wiki/Kindle4NTHacking
- MobileRead K4 jailbreak package thread: https://www.mobileread.com/forums/showthread.php?t=191158
- MobileRead USBNetwork package thread: https://www.mobileread.com/forums/showthread.php?t=88004
- K4NT weather-daemon reference: https://github.com/melihkarakelle/kindle4-weather-display
- Kindle 4 HTTPS image-fetcher reference and release: https://github.com/pascalw/kindle-dash
- xh CLI custom CA bundle option: https://github.com/ducaale/xh/blob/master/doc/xh.1.md
- Mozilla CA bundle source (MPL 2.0): https://curl.se/docs/caextract.html
- Mozilla Public License 2.0: https://www.mozilla.org/en-US/MPL/2.0/
- MobileRead K4NT-specific Picture Viewer steps: https://www.mobileread.com/forums/showthread.php?nojs=1&t=152104
- Kindle 4 User Guide (USB transfer): https://kindle.s3.amazonaws.com/Kindle_User%27s_Guide_4th_Edition.pdf
- Inter font and SIL OFL licence: https://github.com/rsms/inter/blob/master/LICENSE.txt
- GitHub Pages custom workflows: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- GitHub Actions billing: https://docs.github.com/en/billing/concepts/product-billing/github-actions
