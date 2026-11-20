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

## Verified refresh diagnosis — 2026-11-19 16:31 GMT

- Repository: [joltstudio/witney-kindle-weather](https://github.com/joltstudio/witney-kindle-weather), public. Pages: [kindle.html](https://joltstudio.github.io/witney-kindle-weather/kindle.html).
- GitHub Actions latest successful publish is run #41, triggered by push at 14:44 GMT (commit `9414699`); it finished in 42 seconds. The public `outputs/weather-snapshot.json` reports `fetchedAt=2026-11-19T14:45:13.619Z`, which matches the Kindle image's visible “Updated 14:45” stamp.
- Latest scheduled run shown by the Actions history is #33 at 09:30 GMT; it predates the hourly schedule change pushed at 14:44. No scheduled run appears after that change, despite expected slots at 15:17 and 16:17 GMT. Push triggered builds work; recurring GitHub schedule delivery is the confirmed break in the current chain. The 16:17 slot could still be delayed, but the earlier 15:17 slot was already 74 minutes late at the time of this check.
- `refresh-policy.mjs` deliberately skips a scheduled forecast fetch if the last fetch is under 45 minutes old; this does not explain missing workflow runs. It would have skipped at 15:17 if that event had arrived, then fetched at 16:17. It cannot publish fresh weather without a schedule event or another trigger.
- On 2026-11-19, copied `device/kindle-weather-config.example` to `/mnt/us/kindle-weather/config` on the mounted Kindle and verified `WEATHER_REFRESH_SECONDS=1800`; copied `weather-loop.sh` and confirmed it byte-matches the workspace version with `INTERVAL=1800`. Backups are on the device at `/mnt/us/kindle-weather/backup-before-30min-20261119/`. This proves files were staged, not that the currently running process restarted or is polling: the Kindle `app.log` was not available in this diagnostic pass. The image's “Updated” time is the forecast fetch time embedded in the published PNG, not the Kindle's most recent download time, so it cannot prove whether Kindle polling succeeded.
- Diagnosis correction: prior updates called the 30-minute setting “fixed and tested.” That was too strong. Only the device files were changed and statically checked; no post-change Kindle log or newly published image was checked, and the GitHub schedule was not verified. Do not claim automatic refresh works until both a scheduled publish and the corresponding Kindle fetch are evidenced.
- References: workflow run #41 https://github.com/joltstudio/witney-kindle-weather/actions/runs/44547113937 ; last scheduled run #33 https://github.com/joltstudio/witney-kindle-weather/actions/runs/44496988275 ; public snapshot https://joltstudio.github.io/witney-kindle-weather/outputs/weather-snapshot.json ; GitHub schedule behavior https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule .

## Current status — 2026-11-20 09:30 UTC

- Site publishing remains separate and unverified: GitHub Actions run #45 was at 04:02 UTC; Cloudflare production Cron Events had no invocations. Cloudflare Worker `witney-weather-trigger` has its encrypted production `GITHUB_TOKEN`; the production trigger was removed/re-added and saved as hourly `17 * * * *`, next expected at 09:17 UTC. No production run has been confirmed. Keep GitHub's native schedule enabled until two Worker dispatches succeed.
- Kindle DNS/network remediation: logs showed lookup/network errors at 16:36, 17:06 and 17:37 on Nov 19. The KUAL app had one HTTPS attempt after an 8-second Wi-Fi wait, then slept 30 minutes. Updated `device/kual-extension/WitneyWeather/bin/weather-loop.sh` to wait 20 seconds, make up to 3 timed attempts with 10-/20-second backoff, log each attempt, and keep the last good image. Config is in `device/kindle-weather-config.example`; the generated bundle README explains the behavior.
- Installed to the mounted Kindle volume at `/Volumes/Kindle`; verified installed loop and config byte-match the workspace. Backed up originals to `/Volumes/Kindle/kindle-weather/backup-before-dns-retry-20261120/`. Device remains in USB mode; the new loop will run after safely ejecting and unplugging, and is not yet runtime-verified.
- Verification: `npm test` passes 26/26; `sh -n` passes for the updated loop and bundle builder; generated `outputs/witney-weather-low-power-update.zip` passes `unzip -t`; `git diff --check` passes. Next: safely eject/unplug Kindle, allow it to run through a refresh, then inspect new `app.log` entries for retry/success. If retries still end in DNS failure, investigate Kindle Wi-Fi association/router compatibility rather than increasing retries further. Then verify the public publisher chain separately.
- References: https://developers.cloudflare.com/workers/configuration/cron-triggers/ ; https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/ ; https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event.
