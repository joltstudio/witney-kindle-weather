import { CONFIG } from "./config.js";
import {
  DEMO_PAYLOAD,
  chartBoundaries,
  dateLabel,
  forecastApiUrl,
  hourAt,
  hourLabel,
  localParts,
  selectForecastHours,
  sunshineMinutes,
  summarizeForecast,
  validatePayload,
  weatherText,
} from "./weather.js";
import {
  currentMeasurements,
  OBSERVATION_STATION_ID,
} from "./observations.js";

const byId = (id) => document.getElementById(id);
const MINUTE_MS = 60 * 1000;
const SNAPSHOT_TIMEOUT_MS = Math.min(CONFIG.api.timeoutMs, 2_000);
const STALE_AFTER_MS = CONFIG.api.snapshotStaleMinutes * MINUTE_MS;

function configurePage() {
  const root = document.documentElement;
  const variables = {
    "--page-width": `${CONFIG.display.width}px`,
    "--page-height": `${CONFIG.display.height}px`,
    "--page-gutter": `${CONFIG.spacing.page}px`,
    "--page-top": `${CONFIG.spacing.top}px`,
    "--page-bottom": `${CONFIG.spacing.bottom}px`,
    "--current-column-width": `${CONFIG.spacing.currentColumn}px`,
    "--type-scale": String(CONFIG.typography.scale),
    "--weather-font": `"${CONFIG.typography.body}",Arial,sans-serif`,
  };
  for (const [name, value] of Object.entries(variables)) {
    root.style.setProperty(name, value);
  }

  const fitPreview = () => {
    const scale = Math.min(
      1,
      innerWidth / CONFIG.display.width,
      innerHeight / CONFIG.display.height,
    );
    root.style.setProperty("--preview-scale", String(scale));
  };
  fitPreview();
  window.addEventListener("resize", fitPreview);
}

function formatNumber(value, decimals = 0) {
  return Number.isFinite(value) ? value.toFixed(decimals) : "—";
}

function escapeSvg(value) {
  const entities = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  };
  return String(value).replace(/[&<>"']/g, (character) => entities[character]);
}

function showUnavailable(message, updateLabel) {
  byId("status").dataset.state = "error";
  byId("status-text").textContent = "DATA UNAVAILABLE";
  byId("updated").textContent = updateLabel;
  byId("condition-text").textContent = message;
  byId("chart-wrap").innerHTML = `<div class="empty">${message}</div>`;
}

function render(payload, fetchedAt, options = {}) {
  const {
    stale = false,
    error = false,
    demo = false,
    nowMs = Date.now(),
    stationObservation = null,
  } = options;
  const forecastHours = selectForecastHours(payload, nowMs);
  const summary = summarizeForecast(forecastHours);
  const current = currentMeasurements(
    payload.current,
    stationObservation,
    nowMs,
  );

  byId("current-temp").innerHTML =
    `${formatNumber(current.temperatureC)}<sup>${CONFIG.units.temperature}</sup>`;
  byId("current-feels").textContent =
    `${formatNumber(current.apparentTemperatureC)}${CONFIG.units.temperature}`;
  byId("current-humidity").textContent =
    `${formatNumber(current.humidityPct)}${CONFIG.units.humidity}`;
  byId("current-wind").textContent =
    `${formatNumber(current.windMph)}${CONFIG.units.wind}`;
  byId("condition-text").textContent = weatherText(
    payload.current.weather_code,
  );

  const observedTime = current.observedAt
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: CONFIG.location.timezone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date(current.observedAt))
    : "";
  byId("observation-source").textContent = observedTime
    ? `NOAA ${OBSERVATION_STATION_ID} ${observedTime}`
    : `NOAA ${OBSERVATION_STATION_ID}`;

  const status = byId("status");
  status.dataset.state = stale
    ? "stale"
    : error
      ? "error"
      : demo
        ? "demo"
        : "live";
  byId("status-text").textContent = stale
    ? "STALE DATA"
    : error
      ? "DATA UNAVAILABLE"
      : "";
  const updated = new Intl.DateTimeFormat("en-GB", {
    timeZone: CONFIG.location.timezone,
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "short",
    hourCycle: "h23",
  }).format(new Date(fetchedAt));
  byId("updated").textContent = `Updated ${updated}${stale ? " · stale" : ""}`;

  byId("announcement").textContent =
    `Witney weather updated ${new Intl.DateTimeFormat("en-GB", {
      timeZone: CONFIG.location.timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(fetchedAt))}.`;
  byId("chart-wrap").innerHTML = chartSvg(forecastHours, summary, nowMs);
}

function chartSvg(hours, summary, nowMs = Date.now()) {
  const { width, labelWidth, rowHeight } = CONFIG.chart;
  const top = 52;
  const plotWidth = width - labelWidth;
  const gap = CONFIG.spacing.rowGap;
  const hourCount = hours.length;
  const firstHour = hours[0].time;
  const step = plotWidth / hourCount;
  const timeline = hours.map((hour) => ({ time: hour.time }));
  const temperatures = hours
    .flatMap((hour) => [hour.temp, hour.feels])
    .filter(Number.isFinite);
  const temperatureMin = temperatures.length
    ? Math.floor(Math.min(...temperatures) - 1)
    : -10;
  const temperatureMax = temperatures.length
    ? Math.ceil(Math.max(...temperatures) + 1)
    : 10;
  const maximumRain = Math.max(0, ...hours.map((hour) => hour.rain ?? 0));
  const maximumWind = Math.max(0, ...hours.map((hour) => hour.wind ?? 0));

  const rows = [
    {
      key: "temp",
      title: "TEMP + FEELS",
      detail: `↑${formatNumber(summary.high)}° · ↓${formatNumber(summary.low)}°`,
      detail2: `↑${formatNumber(summary.feelsHigh)}° · ↓${formatNumber(summary.feelsLow)}°`,
      min: temperatureMin,
      max: temperatureMax,
    },
    {
      key: "sun",
      title: "SUNSHINE",
      detail: `${formatNumber(summary.sunshine.low)}–${formatNumber(summary.sunshine.high)} ${CONFIG.units.sunshine}`,
      min: 0,
      max: 60,
    },
    {
      key: "rain",
      title: "RAIN",
      detail: `${formatNumber(summary.rainPeak, 1)} ${CONFIG.units.precipitation}/h MAX`,
      min: 0,
      max: Math.max(0.5, Math.ceil(maximumRain * 2) / 2),
    },
    {
      key: "wind",
      title: "WIND",
      detail: `${formatNumber(summary.wind.low)}–${formatNumber(summary.wind.high)} ${CONFIG.units.wind}`,
      min: 0,
      max: Math.max(10, Math.ceil(maximumWind / 5) * 5),
    },
  ];

  const bottomPadding = CONFIG.forecast.weekdayLabels ? 0 : 24;
  const height = top + rows.length * (rowHeight + gap) + bottomPadding;
  const svg = [
    `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Next ${CONFIG.forecast.hours} hours of forecast temperature, feels-like, rainfall, sunshine and wind.">`,
  ];
  const boundaries = chartBoundaries(timeline);
  const occupiedLabels = [];

  for (let index = 0; index < boundaries.length; index += 1) {
    const start = boundaries[index];
    const end = boundaries[index + 1] ?? hourCount;
    const left = labelWidth + start * step;
    const right = labelWidth + end * step;
    const label = CONFIG.forecast.weekdayLabels
      ? localParts(timeline[start].time).weekday
      : dateLabel(timeline[start].time);
    const labelWidthEstimate = label.length * 5.8 * CONFIG.typography.scale;
    const middle = (left + right) / 2;
    const x = Math.max(
      labelWidth + labelWidthEstimate / 2,
      Math.min(labelWidth + plotWidth - labelWidthEstimate / 2, middle),
    );
    let lane = 0;
    while (
      occupiedLabels[lane] !== undefined &&
      occupiedLabels[lane] > x - labelWidthEstimate / 2 - 4
    )
      lane += 1;
    occupiedLabels[lane] = x + labelWidthEstimate / 2;
    svg.push(
      `<text x="${x}" y="${19 + lane * 18}" text-anchor="middle" class="date">${escapeSvg(label)}</text>`,
    );
  }

  for (const index of boundaries.filter((boundary) => boundary > 0)) {
    const x = labelWidth + index * step;
    svg.push(
      `<line x1="${x}" x2="${x}" y1="43" y2="${height - 22}" class="midnight"/>`,
    );
  }

  const currentX =
    labelWidth +
    Math.max(0, Math.min(hourCount, (nowMs / 1000 - firstHour) / 3600)) * step;
  svg.push(
    `<line x1="${currentX}" x2="${currentX}" y1="43" y2="${height - 22}" class="now-marker"/><text x="${currentX + 3}" y="49" class="now-label">NOW</text>`,
  );

  rows.forEach((series, rowIndex) => {
    const y = top + rowIndex * (rowHeight + gap);
    const bottom = y + rowHeight;
    const valueY = (value) =>
      bottom -
      6 -
      ((Math.max(series.min, Math.min(series.max, value)) - series.min) /
        (series.max - series.min || 1)) *
        (rowHeight - 14);

    svg.push(
      `<text x="0" y="${y + 21}" class="metric">${escapeSvg(series.title)}</text>`,
    );
    svg.push(
      `<text x="0" y="${y + 42}" class="scale">${escapeSvg(series.detail)}</text>`,
    );
    if (series.detail2)
      svg.push(
        `<text x="0" y="${y + 61}" class="scale">${escapeSvg(series.detail2)}</text>`,
      );

    if (series.key === "temp") {
      for (const [key, className] of [
        ["temp", "temp-line"],
        ["feels", "feels-line"],
      ]) {
        const path = hours
          .map((hour, index) =>
            Number.isFinite(hour[key])
              ? `${index ? "L" : "M"} ${labelWidth + (index + 0.5) * step} ${valueY(hour[key])}`
              : "",
          )
          .filter(Boolean)
          .join(" ");
        svg.push(`<path d="${path}" class="${className}"/>`);
      }

      const extremeSeries = [
        ["temp", summary.highIndex, summary.lowIndex, "air-extreme"],
        [
          "feels",
          summary.feelsHighIndex,
          summary.feelsLowIndex,
          "feels-extreme",
        ],
      ];
      for (const [key, highIndex, lowIndex, className] of extremeSeries) {
        for (const index of new Set([highIndex, lowIndex])) {
          if (index < 0 || !Number.isFinite(hours[index]?.[key])) continue;
          const x = labelWidth + (index + 0.5) * step;
          svg.push(
            `<circle cx="${x}" cy="${valueY(hours[index][key])}" r="3.5" class="extreme-dot ${className}"/>`,
          );
        }
      }
      return;
    }

    hours.forEach((hour, index) => {
      const value =
        series.key === "sun"
          ? sunshineMinutes(hour.sunshine)
          : hour[series.key];
      if (!Number.isFinite(value) || value <= 0) return;
      const x = labelWidth + index * step + step * 0.2;
      const yValue = valueY(value);
      const barHeight = Math.max(1, bottom - 6 - yValue);
      const className = series.key === "rain" ? "rain-bar" : "bar";
      svg.push(
        `<rect x="${x}" y="${yValue}" width="${step * 0.6}" height="${barHeight}" class="${className}"/>`,
      );
    });
  });

  const axisY = height - 6;
  timeline.forEach((hour, index) => {
    if (hourAt(hour.time) % 6 !== 0) return;
    const x = labelWidth + (index + 0.5) * step;
    if (CONFIG.forecast.weekdayLabels) {
      svg.push(
        `<line x1="${x}" x2="${x}" y1="${height - 19}" y2="${height - 11}" class="axis-tick"/>`,
      );
    } else {
      svg.push(
        `<text x="${x}" y="${axisY}" text-anchor="middle" class="axis">${hourLabel(hour.time, timeline)}</text>`,
      );
    }
  });

  svg.push("</svg>");
  return svg.join("");
}

async function readSnapshot() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SNAPSHOT_TIMEOUT_MS);
  try {
    const response = await fetch("outputs/weather-snapshot.json", {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const snapshot = await response.json();
    if (!Number.isFinite(snapshot.fetchedAt) || snapshot.fetchedAt <= 0) {
      return null;
    }
    return {
      ...snapshot,
      payload: validatePayload(snapshot.payload),
      stationObservation: snapshot.stationObservation ?? null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function readLocalCache(cacheKey) {
  try {
    const snapshot = JSON.parse(localStorage.getItem(cacheKey));
    if (!snapshot || !Number.isFinite(snapshot.fetchedAt)) return null;
    validatePayload(snapshot.payload);
    return snapshot;
  } catch {
    return null;
  }
}

function isStale(snapshot) {
  return Date.now() - snapshot.fetchedAt > STALE_AFTER_MS;
}

async function refreshWeather() {
  const cacheKey = CONFIG.api.cacheKey;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONFIG.api.timeoutMs);
  const publishedSnapshotPromise = readSnapshot();

  try {
    const response = await fetch(forecastApiUrl(), {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error(`Weather service returned ${response.status}.`);

    const payload = validatePayload(await response.json());
    const fetchedAt = Date.now();
    selectForecastHours(payload, fetchedAt);
    const publishedSnapshot = await publishedSnapshotPromise;
    const snapshot = {
      payload,
      fetchedAt,
      stationObservation: publishedSnapshot?.stationObservation ?? null,
    };

    try {
      localStorage.setItem(cacheKey, JSON.stringify(snapshot));
    } catch {
      // The live forecast remains usable if browser storage is unavailable.
    }
    render(payload, fetchedAt, snapshot);
  } catch (error) {
    let snapshot = await publishedSnapshotPromise;
    if (snapshot) {
      try {
        selectForecastHours(snapshot.payload, snapshot.fetchedAt);
      } catch {
        snapshot = null;
      }
    }

    if (snapshot) {
      try {
        localStorage.setItem(cacheKey, JSON.stringify(snapshot));
      } catch {
        // The published snapshot can still be shown without persisting it.
      }
      render(snapshot.payload, snapshot.fetchedAt, {
        stale: isStale(snapshot),
        nowMs: snapshot.fetchedAt,
        stationObservation: snapshot.stationObservation,
      });
      byId("status-text").textContent = isStale(snapshot)
        ? "STALE DATA"
        : "CACHED DATA";
      return;
    }

    snapshot = readLocalCache(cacheKey);
    if (snapshot) {
      render(snapshot.payload, snapshot.fetchedAt, {
        stale: true,
        error: true,
        nowMs: snapshot.fetchedAt,
        stationObservation: snapshot.stationObservation,
      });
      return;
    }

    console.error("Weather unavailable:", error);
    showUnavailable(
      "No weather data received. Check the connection; the display will retry.",
      "No saved weather",
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function refreshLoop() {
  try {
    await refreshWeather();
  } finally {
    window.setTimeout(refreshLoop, CONFIG.api.refreshMinutes * MINUTE_MS);
  }
}

async function renderSnapshot() {
  const snapshot = await readSnapshot();
  if (!snapshot) {
    showUnavailable("No weather snapshot is available.", "No snapshot");
    return;
  }

  try {
    selectForecastHours(snapshot.payload, snapshot.fetchedAt);
    render(snapshot.payload, snapshot.fetchedAt, {
      stale: isStale(snapshot),
      nowMs: snapshot.fetchedAt,
      stationObservation: snapshot.stationObservation,
    });
  } catch {
    showUnavailable("No weather snapshot is available.", "No snapshot");
  }
}

configurePage();
const mode = new URLSearchParams(location.search).get("mode");
if (mode === "five-day-fixture" || mode === "five-day-live") {
  CONFIG.forecast.hours = 120;
  CONFIG.forecast.weekdayLabels = true;
}
if (mode === "five-day-fixture") {
  render(DEMO_PAYLOAD, Date.parse("2026-11-17T10:45:00Z"), {
    demo: true,
    nowMs: DEMO_PAYLOAD.current.time * 1000,
  });
} else if (mode === "fixture") {
  render(DEMO_PAYLOAD, Date.parse("2026-11-17T10:45:00Z"), {
    demo: true,
    nowMs: DEMO_PAYLOAD.current.time * 1000,
  });
} else if (mode === "snapshot") {
  renderSnapshot();
} else {
  refreshLoop();
}
