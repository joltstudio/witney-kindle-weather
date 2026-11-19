# Witney Kindle Weather — project log

## Goal and decisions

- Kindle 4 Non-Touch D01100, portrait 600×800, firmware 4.1.4. Monochrome display; preserve the current Swiss-inspired layout, current conditions, and rolling 48-hour forecast.
- Location 51.783, -1.486; `Europe/London`. Open-Meteo Forecast API uses its automatic Best Match model selection, which includes UKV when available and global fallback. Forecast fields: temperature, apparent temperature, precipitation, humidity, wind and sunshine duration. Sunshine is a derived minutes/hour value; never substitute cloud cover.
- Latest Brize Norton EGVN METAR is optional current observation, shown separately with timestamp. NOAA is free and machine-readable. The display does not plot historical observations; request only a two-hour station window and reject stale/implausible reports.
- GitHub Pages serves a rendered 600×800 grayscale PNG. Kindle KUAL app polls that image, displays cached image on failure, suspends between refreshes, and launches at boot. Temporary refresh interval is five minutes for both publisher and Kindle; restore 30 minutes after automatic updating is verified.
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

## Current GitHub diagnosis — 2026-11-19

- Repository: [joltstudio/witney-kindle-weather](https://github.com/joltstudio/witney-kindle-weather), public. Pages: [kindle.html](https://joltstudio.github.io/witney-kindle-weather/kindle.html).
- GitHub Actions run #38 (push) succeeded at 13:41 UTC; #37 (push) at 13:36; #36 (manual) successfully fetched live data and deployed at 13:30. Last scheduled run visible is #33 at 09:30. Thus the renderer and deploy path work when invoked; the stale hosted image is because no scheduled run created a newer PNG. The page cache-busts the PNG on reload, so browser refresh cannot generate fresh weather itself.
- Workflow is on `main`, the five-minute cron syntax is valid, and push/manual events work. The Actions history still shows no scheduled run after 09:30 even though later push/manual builds deployed successfully. GitHub Status showed Actions operational at 14:27 UTC; that does not rule out individual dropped schedule events. The direct cause is a missed/delayed GitHub `schedule` delivery, not renderer/API failure. GitHub explicitly says scheduled jobs can be delayed or dropped during load; its scheduler is not a delivery guarantee.
- Current published image last showed `Updated 19 Nov, 13:41`; schedule changed to an explicit minute list `2,7,12,17,22,27,32,37,42,47,52,57` to make the test cadence unambiguous. This change still needs a successful scheduled run to verify; GitHub's cron is best-effort, not a guarantee.
- Official references: GitHub trigger guidance https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule ; workflow troubleshooting https://docs.github.com/en/actions/how-tos/troubleshoot-workflows . Open-Meteo https://open-meteo.com/en/docs ; NOAA https://aviationweather.gov/data/api/ .

## Work in progress and next action

- Refactor was committed and pushed to `main` as `22d8f8d` (`Refactor weather app and refresh workflow`). GitHub Actions run #39 completed successfully in 37 seconds and deployed the build. The public `kindle.html` image was visually verified as `Updated 19 Nov, 14:10`; its cache-busting URL works. Unrelated local edit `outputs/disable-kindle-weather-watchdog.sh` predates this work; it remains uncommitted and excluded.
- Refactor complete locally: source, Node scripts, HTML/CSS, workflow YAML and tests are formatted; the browser refresh loop no longer overlaps and published snapshot reads are time-bounded. The optional NOAA request and snapshot now retain only the latest observation, not a 24-hour series. Five-minute UTC schedule uses an explicit off-hour minute list. Visual layout and Kindle shell code are unchanged.
- Verification: `npm test` passes 21/21. `node --check` passes for browser, weather, observations, config, scripts and tests; `sh -n` passes for all active device scripts; `git diff --check` passes. The local exact-size render could not run because the installed Chrome aborts with `SIGABRT`; this was improved to report the actual signal instead of a null exit code. The push-triggered Pages run will verify rendering on the GitHub runner.
- At 14:27 UTC, Actions history still had no scheduled run after 09:30; most recent was the successful push at 14:09. The current five-minute cron (minutes 2,7,...,57) is valid and avoids the hour boundary, but there is no remaining YAML defect to correct. Repeatedly changing cron syntax cannot make GitHub guarantee delivery.
- Prepared an independent Cloudflare Cron Trigger fallback in `ops/cloudflare-weather-trigger.js`, with setup instructions in `ops/README.md`. It dispatches the existing `workflow_dispatch` workflow every five minutes using a narrowly scoped GitHub token stored only as a Cloudflare secret. It has not been deployed or activated. After at least two successful dispatch runs, remove the native `schedule:` block to avoid duplicate builds. No secrets are present in the repo.
- The local fixture renderer could not be inspected because this Mac's Chrome aborts with `SIGABRT`; GitHub Actions successfully ran the renderer and published a fresh image. `PROJECT.md`, the external-trigger fallback, and the unrelated watchdog script are local edits; only relevant files should be staged if pushing. README/code/tests and the existing workflow were in commit `22d8f8d`.
- Device polling is configured at five minutes, but this turn has no mounted Kindle/logs to prove polling; previous logs showed successful image fetch at 12:31 on 19 Nov. The newly published image should be picked up at the next poll if the app is running and network is available. Do not claim a fresh device image based only on the configured interval.
