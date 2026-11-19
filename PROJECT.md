# Witney Kindle Weather — project log

## Goal and decisions

- Kindle 4 Non-Touch D01100, portrait 600×800, firmware 4.1.4. Monochrome display; preserve the current Swiss-inspired layout, current conditions, and rolling 48-hour forecast.
- Location 51.783, -1.486; `Europe/London`. Open-Meteo Forecast API uses its automatic Best Match model selection, which includes UKV when available and global fallback. Forecast fields: temperature, apparent temperature, precipitation, humidity, wind and sunshine duration. Sunshine is a derived minutes/hour value; never substitute cloud cover.
- Latest Brize Norton EGVN METAR is optional current observation, shown separately with timestamp. NOAA is free and machine-readable. The display does not plot historical observations; request only a two-hour station window and reject stale/implausible reports.
- GitHub Pages serves a rendered 600×800 grayscale PNG. GitHub Actions publishes hourly at minute 17 UTC. Kindle KUAL polls the image every 30 minutes, displays its cached image on failure, suspends between refreshes, and launches at boot.
- No runtime npm dependencies. Font files are bundled Inter under SIL OFL. Do not rerun firmware, jailbreak, MKK or keystore installers.

## Architecture and commands

- Browser app: `index.html`, `app.js`, `weather.js`, `observations.js`, `config.js`, `styles.css`; deterministic `?mode=fixture`, live `?mode=live`, snapshot `?mode=snapshot`.
- Publisher: `.github/workflows/pages.yml` fetches/validates the forecast, uses last valid cache on API failure, renders grayscale PNG, then deploys GitHub Pages. `kindle.html` wraps that image for browsers.
- Kindle: `device/kual-extension/WitneyWeather/bin/` contains KUAL actions and image loop. Other `device/` scripts stage or build optional recovery/update bundles.
- Preview: `python3 -m http.server 4173 --bind 127.0.0.1`; open `http://127.0.0.1:4173/?mode=live` (fixture: `?mode=fixture`).
- Tests: `npm test`.
- Fixture PNG: `node scripts/render.mjs` (Google Chrome required; 600×800 grayscale output).
- Live PNG: `node scripts/fetch-weather.mjs`, then `node scripts/render.mjs --snapshot` (local server required).
- Kindle bundle builders: `sh scripts/build-kual-install.sh`; `sh scripts/build-kindle-power-update.sh`. Do not run installers without confirming device state.
- Validation: `npm test`; `sh -n device/kindle-weather-daemon.sh device/kindle-weather-watchdog.sh device/runme-install.sh device/prepare-kindle-usb.sh`; `git diff --check`.

## Current schedule status — 2026-11-19

- Repository: [joltstudio/witney-kindle-weather](https://github.com/joltstudio/witney-kindle-weather), public. Pages: [kindle.html](https://joltstudio.github.io/witney-kindle-weather/kindle.html).
- Repository: [joltstudio/witney-kindle-weather](https://github.com/joltstudio/witney-kindle-weather), public. Pages: [kindle.html](https://joltstudio.github.io/witney-kindle-weather/kindle.html).
- Push/manual runs #36–#39 succeeded and deployed, while the latest listed scheduled run at the time was #33 at 09:30 UTC. This isolates the observed failure to GitHub schedule delivery rather than rendering or Pages deployment. GitHub documents that scheduled events can be delayed or dropped; hourly at minute 17 reduces high-frequency load but remains best-effort.
- Current workflow schedule is `17 * * * *` (hourly at :17 UTC). Push and manual triggers remain enabled. The schedule change requires a later scheduled Actions run to verify.
- Official references: GitHub trigger guidance https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule ; workflow troubleshooting https://docs.github.com/en/actions/how-tos/troubleshoot-workflows . Open-Meteo https://open-meteo.com/en/docs ; NOAA https://aviationweather.gov/data/api/ .

## Work in progress and next action

- Previously pushed refactor `22d8f8d`; external Cloudflare timer experiment `cb7e686` has been removed because hourly GitHub publishing is preferred. No Cloudflare account, token or worker is needed.
- Kindle KUAL loop default is `INTERVAL=1800`. The low-power update bundle now includes the canonical `device/kindle-weather-config.example` as `/mnt/us/kindle-weather/config`, so it also overrides a prior five-minute device setting. Build it with `sh scripts/build-kindle-power-update.sh`; copy the included config, scripts and watchdog to matching Kindle USB paths after backing them up. Do not rerun firmware or jailbreak installers.
- Set GitHub cron to `17 * * * *` (hourly, UTC, off the hour); scheduled refresh gate is 45 minutes to allow delay while avoiding an immediate repeat after a manual/push refresh. Set KUAL loop to 1800 seconds and built `outputs/witney-weather-low-power-update.zip`, including the config file that replaces any former five-minute override.
- Verification: `npm test` passes 21/21; shell syntax and archive integrity checks pass; `git diff --check` passes. GitHub Pages push deployment and a future scheduled run are still to be verified. The device interval takes effect only after the update files/config are copied to the Kindle and the app restarts.
- Unrelated local edit `outputs/disable-kindle-weather-watchdog.sh` is preserved and must not be committed with this schedule change.
- Next: commit and push the hourly schedule / 30-minute device update in GitHub Desktop, excluding the unrelated watchdog edit. Verify push deployment, then reconnect the Kindle in USB Drive Mode and copy the included `kindle-weather/config` plus scripts to their matching volume paths. Monitor a scheduled Actions run and Kindle `app.log` before calling either interval verified.
