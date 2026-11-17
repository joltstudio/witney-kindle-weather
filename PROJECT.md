# Witney Kindle Weather Display — restart log

## Requirements and decisions
- Non-touch Kindle D01100 target, portrait 600×800; no navigation or controls. Current conditions are separated from the rolling 48-hour hourly forecast.
- Location 51.783, -1.486; Europe/London. Open-Meteo provides all requested hourly variables. Request Unix timestamps and format with the IANA timezone so DST transitions and duplicated hours are handled correctly.
- User removed jacket and umbrella advice. The current temperature and condition lead the page; the chart below carries the 48-hour forecast, high/low air and feels-like markers, and peak hourly rainfall.
- No horizontal rules; local midnight dividers are pale 1px vertical strokes. Primary type is bundled Inter. No legend row or “Local time · 24 h” note.
- Refresh every 30 minutes; cache last valid response in localStorage. On fetch failure, keep the cache and label it stale; without cache, show unavailable status.
- Static ES module app with bundled Inter weights (SIL OFL), no runtime packages. Live mode is default; fixture mode is deterministic.
- Hosting plan: scheduled GitHub Actions snapshot + GitHub Pages. Workflow and `kindle.html` are prepared; public repository `joltstudio/witney-kindle-weather` was created, but source push and Pages activation are pending.

## Architecture
- `index.html`, `app.js`, `weather.js`, `styles.css`, `config.js`: browser page, renderer, API/validation/time logic, and configuration. `kindle.html` is a legacy-browser-compatible image page with 30-minute refresh.
- `.github/workflows/pages.yml` and `scripts/fetch-weather.mjs`: 30-minute scheduled refresh; validates live API data before rendering so a failed fetch leaves the prior published page intact.
- `tests/weather.test.js`: built-in Node tests for DST, date/hour selection, units, data validation, air/feels high-low and rain peak summaries.
- `scripts/render.mjs`: Chrome headless screenshot at configured size; verifies PNG dimensions.
- `licenses/OFL-Inter.txt`, `assets/fonts/Inter-*.otf`: bundled font and licence.
- `outputs/witney-weather-600x800.png`: deterministic fixture PNG, 600×800.
- `outputs/witney-weather-live-600x800.png`: live 600×800 snapshot.
- `outputs/witney-weather-kindle.zip`: live 600×800 JPG inside a ZIP for the K4NT Picture Viewer workflow (rendered 14:43 Europe/London, 17 Nov 2026).

## Exact commands
- Preview: `python3 -m http.server 4173 --bind 127.0.0.1`; open `http://127.0.0.1:4173/?mode=live`.
- Fixture preview: `http://127.0.0.1:4173/?mode=fixture`.
- Tests: `npm test` (or `node --test tests/weather.test.js`).
- Fixture PNG: `node scripts/render.mjs` (requires Google Chrome at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`).
- Live snapshot PNG: `node scripts/fetch-weather.mjs` then with server running `node scripts/render.mjs --snapshot`; direct browser fetch alternative `node scripts/render.mjs --live`.
- Deployment target: `https://github.com/joltstudio/witney-kindle-weather` (public, currently empty); local `main` commit `2831f0c` with remote `origin` configured. Pages must use source **GitHub Actions** after content is pushed.

## Completed and verified — 2026-11-17
- Repository was empty; no AGENTS.md instructions found.
- Official API docs confirm the requested temperature, apparent temperature, precipitation, humidity, wind and sunshine fields. Open-Meteo fixed-offset ISO timestamps ignore DST transitions; `timeformat=unixtime` plus local IANA formatting is used instead. Sunshine seconds are shown as minutes per hour. Attribution is visible; free API is non-commercial with a 10,000 calls/day limit.
- User reports Kindle 4 firmware 4.1.3. Amazon's update table says 4.1.3 → 4.1.4; MobileRead's K4 Non-Touch page lists 4.0.0–4.1.4. Treat the published range as compatible; installation is not part of this redesign.
- Earlier redesign: removed advice and headings, switched bundled font to Inter, added temperature extrema and rainfall summary.
- Current changes: removed horizontal rules and legend; pale 1px day markers; air/feels summaries use `↑high° · ↓low°`; rainfall summary is `max mm/h MAX`; dots mark both series' extrema. Added a 30-minute refresh page for the Kindle browser and scheduled GitHub Pages workflow.
- `npm test`: 5 passed, 0 failed after current redesign (DST, repeated hour, invalid response, units, air/feels high-low, peak rain).
- Live browser preview: reloaded and visually inspected at 600×800 on 2026-11-17. Confirmed no horizontal dividers, pale 1px day markers, air and feels high/low dots and summaries, rain max only, no legend/local-time note; all 5 metric rows and footer fit.
- `node scripts/fetch-weather.mjs` and `node scripts/render.mjs --snapshot`: succeeded at 14:58 Europe/London; live PNG verified exactly 600×800. Preview visually confirmed requested arrow/rain labels. K4 fallback ZIP rebuilt at 15:00.
- Earlier live-preview check at 13:19 Europe/London confirmed fresh data, 5 graph rows, 3 date labels, and no clipping; its metric summary predates the current redesign.

## Compatibility and next action
- Firmware 4.1.3 is within the published K4NT 4.0.0–4.1.4 method range. No jailbreak package or firmware change has been applied. Kindle browser page is ready at `/kindle.html` with meta refresh; actual HTTPS compatibility on device remains untested. GitHub repo created and local commit prepared; automatic review rejected pushing the source and generated snapshot to the public repository because the user had not explicitly authorized exposing that payload to that destination. Next: obtain explicit approval for public source/data publication, then push, enable Pages source **GitHub Actions**, verify deployment, and test the URL on the Kindle.

## Source URLs
- Open-Meteo docs: https://open-meteo.com/en/docs
- Open-Meteo terms: https://open-meteo.com/en/terms
- Open-Meteo licence: https://open-meteo.com/en/license
- Amazon prior software updates: https://digprjsurvey.amazon.com/csad/help/node/GX3VVAQS4DYDE5KE?theme=light
- MobileRead K4 Non-Touch compatibility page: https://wiki.mobileread.com/wiki/Kindle4NTHacking
- MobileRead K4NT-specific Picture Viewer steps: https://www.mobileread.com/forums/showthread.php?nojs=1&t=152104
- Kindle 4 User Guide (USB transfer): https://kindle.s3.amazonaws.com/Kindle_User%27s_Guide_4th_Edition.pdf
- Inter font SIL OFL licence: https://github.com/rsms/inter/blob/master/LICENSE.txt
- GitHub Pages workflows: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- GitHub Actions billing: https://docs.github.com/en/billing/concepts/product-billing/github-actions
