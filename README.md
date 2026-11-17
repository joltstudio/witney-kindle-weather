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

## Hosted Kindle display

`.github/workflows/pages.yml` validates a fresh Open-Meteo response, renders the 600×800 image, and deploys the static site to GitHub Pages on pushes and every 30 minutes. The GitHub Actions runner handles updates while your Mac is off. `kindle.html` is a simple image page with a 30-minute HTML refresh for the D01100 browser; it does not need the modern JavaScript app. The Kindle must remain on Wi-Fi with this page open. The firmware guide lists JavaScript and SSL support, but HTTPS compatibility with current GitHub Pages must be confirmed on the actual Kindle. [Kindle user guide](https://kindle.s3.amazonaws.com/Kindle_User%27s_Guide_4th_Edition.pdf).

The source repository is public, so anyone can view or fork the code and forecast image history. The Pages site is also public. The repository uses **Settings → Pages → Build and deployment → GitHub Actions**. Open-Meteo's free endpoint is for personal, non-commercial use.

Once deployed, open `https://joltstudio.github.io/witney-kindle-weather/kindle.html` in the Kindle's **Experimental → Web Browser**. Bookmark it and leave it open. The latest image is generated every 30 minutes and the page reloads at the same cadence. If the Kindle rejects the HTTPS certificate or site, its stock browser cannot use this live URL; the ZIP/JPG transfer below remains the no-firmware-change fallback. Neither stock browser mode nor Picture Viewer will wake the sleeping Kindle to refresh the e-ink display.

### Copy a snapshot to a Kindle 4 (no firmware changes)

On the D01100/K4NT, use its built-in Picture Viewer as a static snapshot. The K4NT-specific workflow is to zip a JPG (PNG support is inconsistent), then copy the `.zip` archive into the Kindle's `documents` folder. It appears in Home as a book; open it to view the image. The full-screen image is 600×800 and does not auto-update. Repeat with a fresh image/archive when needed. This needs no jailbreak or firmware change. [K4NT Picture Viewer instructions](https://www.mobileread.com/forums/showthread.php?nojs=1&t=152104), [Kindle 4 User Guide](https://kindle.s3.amazonaws.com/Kindle_User%27s_Guide_4th_Edition.pdf).

After rendering a fresh live PNG, package a JPG for the Kindle with macOS's built-in tools:

```sh
sips -s format jpeg outputs/witney-weather-live-600x800.png --out /tmp/witney-weather-live.jpg
rm -f /tmp/witney-weather-kindle.zip
zip -j /tmp/witney-weather-kindle.zip /tmp/witney-weather-live.jpg
```

The included `outputs/witney-weather-kindle.zip` is a fallback package built from the live snapshot at 15:00 Europe/London on 17 Nov 2026. Connect the Kindle by USB, copy the ZIP into its `documents` folder, eject it, then open the new item from Home. In Picture Viewer, use Menu → Full Screen Mode if needed. This is a manual snapshot workflow; the browser page is the live route.

## Kindle compatibility status

The user reports firmware **4.1.3**. Amazon's update table lists 4.1.3 → 4.1.4 for Kindle 4th/5th generation; the MobileRead Kindle 4 Non-Touch page lists 4.0.0–4.1.4 for its K4NT method. That puts 4.1.3 inside the published range for D01100/K4NT. This update contains no device-specific package or installation steps; the screen will be delivered as a PNG until a separate device path is prepared and verified.

## Reference pages

- Open-Meteo API fields and timestamp behaviour: https://open-meteo.com/en/docs
- Open-Meteo free-use terms: https://open-meteo.com/en/terms
- Amazon previous Kindle software updates: https://digprjsurvey.amazon.com/csad/help/node/GX3VVAQS4DYDE5KE?theme=light
- MobileRead Kindle 4 Non-Touch compatibility page: https://wiki.mobileread.com/wiki/Kindle4NTHacking
- MobileRead K4NT-specific Picture Viewer steps: https://www.mobileread.com/forums/showthread.php?nojs=1&t=152104
- Kindle 4 User Guide (USB transfer): https://kindle.s3.amazonaws.com/Kindle_User%27s_Guide_4th_Edition.pdf
- Inter font and SIL OFL licence: https://github.com/rsms/inter/blob/master/LICENSE.txt
- GitHub Pages custom workflows: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- GitHub Actions billing: https://docs.github.com/en/billing/concepts/product-billing/github-actions
