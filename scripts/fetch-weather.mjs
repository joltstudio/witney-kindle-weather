import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { API_URL, validatePayload, selectForecastHours } from "../weather.js";
import { fetchStationData } from "../observations.js";

let response;
let requestError;
const MAX_ATTEMPTS = 5;
const describeError = (error) => {
  const parts = [];
  for (let current = error; current; current = current.cause) {
    const detail = current.code
      ? `${current.message} (${current.code})`
      : current.message;
    if (detail && !parts.includes(detail)) parts.push(detail);
  }
  return parts.join(": ") || "Unknown request error";
};
for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  try {
    response = await fetch(API_URL, {
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
    if (response.status < 500) break;
    requestError = new Error(`Open-Meteo returned ${response.status}.`);
  } catch (error) {
    requestError = error;
  }
  if (attempt < MAX_ATTEMPTS) {
    console.warn(
      `Open-Meteo request ${attempt}/${MAX_ATTEMPTS} failed; retrying. ${describeError(requestError)}`,
    );
    await new Promise((resolve) => setTimeout(resolve, 2_000 * attempt));
  }
}
let snapshot;
if (response?.ok) {
  try {
    const payload = validatePayload(await response.json());
    const fetchedAt = Date.now();
    selectForecastHours(payload, fetchedAt);
    const stationObservation = await fetchStationData(fetch, fetchedAt);
    if (!stationObservation)
      console.warn("No fresh, valid EGVN METAR; forecast will be used alone.");
    snapshot = { payload, fetchedAt, stationObservation };
  } catch (error) {
    requestError = error;
  }
}
if (!snapshot) {
  try {
    const previous = JSON.parse(
      await readFile(resolve("outputs/weather-snapshot.json"), "utf8"),
    );
    validatePayload(previous.payload);
    selectForecastHours(previous.payload, previous.fetchedAt);
    if (Date.now() - previous.fetchedAt > 24 * 60 * 60_000)
      throw new Error("Cached forecast is older than 24 hours.");
    snapshot = previous;
    const reason = requestError
      ? describeError(requestError)
      : response
        ? `HTTP ${response.status}`
        : "no response";
    const cachedAt = new Date(previous.fetchedAt).toISOString();
    const message = `Open-Meteo unavailable (${reason}); keeping cached forecast from ${cachedAt}.`;
    console.warn(message);
    if (process.env.GITHUB_ACTIONS === "true")
      console.log(`::warning title=Using cached weather::${message}`);
  } catch (error) {
    throw new Error(
      `Open-Meteo unavailable and no usable cached forecast exists: ${error.message}`,
    );
  }
}

await mkdir(resolve("outputs"), { recursive: true });
await writeFile(
  resolve("outputs/weather-snapshot.json"),
  JSON.stringify(snapshot),
);
console.log(
  `Saved validated weather snapshot at ${new Date(snapshot.fetchedAt).toISOString()}.`,
);
