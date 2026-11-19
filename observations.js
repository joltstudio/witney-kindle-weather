import { CONFIG } from "./config.js";

const STATION_ID = CONFIG.observations.stationId;
const MAX_OBSERVATION_AGE_MS = CONFIG.observations.maxAgeMinutes * 60_000;
const MAX_FUTURE_SKEW_MS = CONFIG.observations.maxFutureSkewMinutes * 60_000;
const KNOTS_TO_MPH = 1.150779448;

export const OBSERVATION_SOURCE = CONFIG.observations.provider;
export const OBSERVATION_STATION = CONFIG.observations.stationName;
export const OBSERVATION_STATION_ID = CONFIG.observations.stationId;
export const STATION_OBSERVATION_URL = `https://aviationweather.gov/api/data/metar?ids=${STATION_ID}&format=json&hours=${CONFIG.observations.requestHours}`;

function humidityFromDewPoint(tempC, dewpointC) {
  const saturation = (value) => (17.625 * value) / (243.04 + value);
  return Math.max(
    0,
    Math.min(100, 100 * Math.exp(saturation(dewpointC) - saturation(tempC))),
  );
}

function finiteInRange(value, min, max) {
  return Number.isFinite(value) && value >= min && value <= max;
}

function observationFromRecord(record, observedAt) {
  const tempC = record.temp;
  if (!finiteInRange(tempC, -50, 60)) return null;

  const dewpointC = record.dewp;
  const hasDewpoint =
    finiteInRange(dewpointC, -60, 60) && dewpointC <= tempC + 2;
  const windKnots = record.wspd;
  const windMph = finiteInRange(windKnots, 0, 120)
    ? windKnots * KNOTS_TO_MPH
    : null;
  const humidityPct = hasDewpoint
    ? humidityFromDewPoint(tempC, dewpointC)
    : null;

  return {
    source: OBSERVATION_SOURCE,
    station: OBSERVATION_STATION,
    stationId: STATION_ID,
    observedAt,
    temperatureC: tempC,
    humidityPct,
    windMph,
  };
}

export function parseStationObservations(records, nowMs = Date.now()) {
  if (!Array.isArray(records)) return null;
  const candidates = records
    .filter(
      (record) =>
        record?.icaoId === STATION_ID &&
        ["METAR", "SPECI"].includes(record.metarType),
    )
    .map((record) => ({ record, observedAt: Number(record.obsTime) * 1000 }))
    .filter(
      ({ observedAt }) =>
        Number.isFinite(observedAt) && observedAt <= nowMs + MAX_FUTURE_SKEW_MS,
    )
    .sort((a, b) => b.observedAt - a.observedAt);
  for (const { record, observedAt } of candidates) {
    const observation = observationFromRecord(record, observedAt);
    if (observation && isFreshStationObservation(observation, nowMs)) {
      return observation;
    }
  }
  return null;
}

export function isValidStationObservation(observation) {
  if (
    !observation ||
    observation.stationId !== STATION_ID ||
    observation.source !== OBSERVATION_SOURCE ||
    !Number.isFinite(observation.observedAt) ||
    !finiteInRange(observation.temperatureC, -50, 60)
  )
    return false;
  if (
    observation.humidityPct !== null &&
    !finiteInRange(observation.humidityPct, 0, 100)
  )
    return false;
  if (
    observation.windMph !== null &&
    !finiteInRange(observation.windMph, 0, 140)
  )
    return false;
  return true;
}

export function isFreshStationObservation(observation, nowMs = Date.now()) {
  return (
    isValidStationObservation(observation) &&
    observation.observedAt <= nowMs + MAX_FUTURE_SKEW_MS &&
    nowMs - observation.observedAt <= MAX_OBSERVATION_AGE_MS
  );
}

export async function fetchStationData(
  fetchImpl = globalThis.fetch,
  nowMs = Date.now(),
) {
  try {
    const response = await fetchImpl(STATION_OBSERVATION_URL, {
      signal: AbortSignal.timeout(CONFIG.observations.timeoutMs),
      headers: {
        "User-Agent": "WitneyKindleWeather/1.0 (personal weather display)",
      },
    });
    if (!response.ok) return null;
    const records = await response.json();
    return parseStationObservations(records, nowMs);
  } catch {
    return null;
  }
}
