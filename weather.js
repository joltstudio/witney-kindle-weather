import { CONFIG } from "./config.js";

export function forecastApiUrl(hours = CONFIG.forecast.hours) {
  // Keep Open-Meteo's Best Match default: for the UK it selects UKV when
  // available and fills gaps with global guidance across the forecast window.
  const temperatureUnit =
    CONFIG.units.temperature === "°F" ? "fahrenheit" : "celsius";
  const windUnit =
    CONFIG.units.wind === "km/h"
      ? "kmh"
      : CONFIG.units.wind === "m/s"
        ? "ms"
        : CONFIG.units.wind === "kn"
          ? "kn"
          : "mph";
  const precipitationUnit = CONFIG.units.precipitation === "in" ? "inch" : "mm";
  const q = new URLSearchParams({
    latitude: CONFIG.location.latitude,
    longitude: CONFIG.location.longitude,
    timezone: CONFIG.location.timezone,
    timeformat: "unixtime",
    forecast_hours: String(hours + 1),
    temperature_unit: temperatureUnit,
    wind_speed_unit: windUnit,
    precipitation_unit: precipitationUnit,
    current:
      "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code",
    hourly:
      "temperature_2m,apparent_temperature,precipitation,relative_humidity_2m,wind_speed_10m,sunshine_duration",
  });
  return `https://api.open-meteo.com/v1/forecast?${q}`;
}

export const API_URL = forecastApiUrl();

const REQUIRED = [
  "temperature_2m",
  "apparent_temperature",
  "precipitation",
  "relative_humidity_2m",
  "wind_speed_10m",
  "sunshine_duration",
];
const formatterCache = new Map();

function getFormatter(timezone, options) {
  const key = `${timezone}:${JSON.stringify(options)}`;
  if (!formatterCache.has(key)) {
    formatterCache.set(
      key,
      new Intl.DateTimeFormat("en-GB", { timeZone: timezone, ...options }),
    );
  }
  return formatterCache.get(key);
}

export function validatePayload(payload) {
  if (
    !payload ||
    payload.error ||
    payload.timezone !== CONFIG.location.timezone ||
    !payload.hourly ||
    !Array.isArray(payload.hourly.time) ||
    payload.hourly.time.length < CONFIG.forecast.hours + 1
  )
    throw new Error("Weather response is incomplete.");
  const n = payload.hourly.time.length;
  for (const key of REQUIRED)
    if (!Array.isArray(payload.hourly[key]) || payload.hourly[key].length !== n)
      throw new Error(`Weather response is missing ${key}.`);
  if (
    !payload.current ||
    !Number.isFinite(payload.current.temperature_2m) ||
    !Number.isFinite(payload.current.apparent_temperature)
  )
    throw new Error("Current conditions are missing.");
  const times = payload.hourly.time;
  for (let i = 0; i < n; i++)
    if (
      !Number.isFinite(Number(times[i])) ||
      (i && Number(times[i]) <= Number(times[i - 1]))
    )
      throw new Error("Weather timestamps are invalid.");
  return payload;
}

export function selectForecastHours(payload, nowMs) {
  validatePayload(payload);
  // Start at the next complete forecast hour so the full configured window
  // is still ahead when a request lands during a partial hour.
  const hour = Math.ceil(nowMs / 3600000) * 3600;
  const end = hour + CONFIG.forecast.hours * 3600;
  const h = payload.hourly;
  const indexes = h.time
    .map((t, i) => ({ t: Number(t), i }))
    .filter(({ t }) => t >= hour && t < end);
  if (indexes.length !== CONFIG.forecast.hours) {
    throw new Error(
      `Expected ${CONFIG.forecast.hours} hourly forecasts; received ${indexes.length}.`,
    );
  }
  return indexes.map(({ t, i }) => ({
    time: t,
    temp: finiteOrNull(h.temperature_2m[i]),
    feels: finiteOrNull(h.apparent_temperature[i]),
    rain: finiteOrNull(h.precipitation[i]),
    humidity: finiteOrNull(h.relative_humidity_2m[i]),
    wind: finiteOrNull(h.wind_speed_10m[i]),
    sunshine: finiteOrNull(h.sunshine_duration[i]),
  }));
}

export function finiteOrNull(v) {
  const n = Number(v);
  return v === null || v === "" || !Number.isFinite(n) ? null : n;
}
export const sunshineMinutes = (seconds) =>
  finiteOrNull(seconds) === null ? null : Math.round(seconds / 60);

export function summarizeForecast(hours) {
  const extrema = (key) => {
    const values = hours
      .map((h, i) => ({ value: h[key], index: i }))
      .filter((x) => Number.isFinite(x.value));
    const high = values.length
      ? values.reduce((a, b) => (b.value > a.value ? b : a))
      : null;
    const low = values.length
      ? values.reduce((a, b) => (b.value < a.value ? b : a))
      : null;
    return {
      high: high?.value ?? null,
      highIndex: high?.index ?? -1,
      low: low?.value ?? null,
      lowIndex: low?.index ?? -1,
    };
  };
  const temps = extrema("temp"),
    feels = extrema("feels");
  const rain = hours.map((h) => h.rain);
  const metricRange = (key) => {
    const values = hours.map((h) => h[key]).filter(Number.isFinite);
    return values.length
      ? { low: Math.min(...values), high: Math.max(...values) }
      : { low: null, high: null };
  };
  const completeRain = rain.length > 0 && rain.every(Number.isFinite);
  return {
    high: temps.high,
    highIndex: temps.highIndex,
    low: temps.low,
    lowIndex: temps.lowIndex,
    feelsHigh: feels.high,
    feelsHighIndex: feels.highIndex,
    feelsLow: feels.low,
    feelsLowIndex: feels.lowIndex,
    rainPeak: completeRain ? Math.max(...rain) : null,
    wind: metricRange("wind"),
    sunshine:
      metricRange("sunshine").low === null
        ? { low: null, high: null }
        : {
            low: Math.min(
              ...hours
                .map((h) => sunshineMinutes(h.sunshine))
                .filter(Number.isFinite),
            ),
            high: Math.max(
              ...hours
                .map((h) => sunshineMinutes(h.sunshine))
                .filter(Number.isFinite),
            ),
          },
  };
}

export function hourAt(epochSeconds, timezone = CONFIG.location.timezone) {
  return Number(
    getFormatter(timezone, { hour: "numeric", hourCycle: "h23" }).format(
      new Date(epochSeconds * 1000),
    ),
  );
}
export function dateKey(epochSeconds, timezone = CONFIG.location.timezone) {
  const parts = getFormatter(timezone, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(epochSeconds * 1000));
  const fields = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map(({ type, value }) => [type, value]),
  );
  return `${fields.year}-${fields.month}-${fields.day}`;
}
export function localParts(epochSeconds, timezone = CONFIG.location.timezone) {
  const parts = getFormatter(timezone, {
    weekday: "short",
    day: "2-digit",
    year: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(epochSeconds * 1000));
  return Object.fromEntries(
    parts.filter((p) => p.type !== "literal").map((p) => [p.type, p.value]),
  );
}
export function dateLabel(epochSeconds) {
  const p = localParts(epochSeconds);
  return `${p.weekday.toUpperCase()} ${p.day} ${p.month.toUpperCase()}`;
}
export function clockLabel(epochSeconds) {
  return getFormatter(CONFIG.location.timezone, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(epochSeconds * 1000));
}
export function hourLabel(epochSeconds, sequence) {
  const formatter = getFormatter(CONFIG.location.timezone, {
    hour: "2-digit",
    hourCycle: "h23",
  });
  const base = formatter.format(new Date(epochSeconds * 1000));
  const key = `${dateKey(epochSeconds)} ${base}`;
  const repeatedHours = sequence
    .filter(
      (hour) =>
        `${dateKey(hour.time)} ${formatter.format(new Date(hour.time * 1000))}` ===
        key,
    )
    .map((hour) => hour.time);
  if (repeatedHours.length > 1)
    return `${base}${repeatedHours.indexOf(epochSeconds) === 0 ? "a" : "b"}`;
  return base;
}

export function chartBoundaries(hours) {
  return hours
    .map((h, i) =>
      i === 0 || dateKey(h.time) !== dateKey(hours[i - 1].time) ? i : -1,
    )
    .filter((i) => i >= 0);
}

export function weatherText(code) {
  const labels = {
    0: "Clear",
    1: "Mostly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Freezing fog",
    51: "Light drizzle",
    53: "Drizzle",
    55: "Heavy drizzle",
    61: "Light rain",
    63: "Rain",
    65: "Heavy rain",
    71: "Light snow",
    73: "Snow",
    75: "Heavy snow",
    80: "Showers",
    81: "Showers",
    82: "Heavy showers",
    95: "Thunderstorm",
    96: "Thunderstorm",
    99: "Thunderstorm",
  };
  return labels[code] ?? "Conditions unavailable";
}

function demoHourly() {
  const start = Date.parse("2026-11-17T10:00:00Z") / 1000,
    times = [],
    vals = {};
  for (const key of REQUIRED) vals[key] = [];
  for (let i = 0; i < 146; i++) {
    const t = start + i * 3600,
      phase = i % 24,
      temp = 11 + 4 * Math.sin(((phase - 7) / 24) * Math.PI * 2);
    times.push(t);
    vals.temperature_2m.push(+temp.toFixed(1));
    vals.apparent_temperature.push(+(temp - 1.5 + Math.sin(i / 5)).toFixed(1));
    vals.precipitation.push(i % 13 === 6 ? 0.4 : i % 17 === 3 ? 0.1 : 0);
    vals.relative_humidity_2m.push(Math.round(80 + 15 * Math.sin(i / 7)));
    vals.wind_speed_10m.push(7 + Math.round(5 * Math.cos(i / 4)));
    vals.sunshine_duration.push(
      phase >= 8 && phase <= 15
        ? Math.max(0, Math.round(2100 * Math.sin(((phase - 7) / 10) * Math.PI)))
        : 0,
    );
  }
  return {
    timezone: CONFIG.location.timezone,
    current: {
      time: start + 2700,
      temperature_2m: 12.4,
      apparent_temperature: 10.9,
      relative_humidity_2m: 83,
      wind_speed_10m: 8,
      weather_code: 2,
    },
    hourly: { time: times, ...vals },
  };
}
export const DEMO_PAYLOAD = demoHourly();
