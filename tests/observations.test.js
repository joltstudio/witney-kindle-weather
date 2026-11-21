import test from "node:test";
import assert from "node:assert/strict";
import {
  currentMeasurements,
  fetchStationData,
  isFreshStationObservation,
  parseStationObservations,
  STATION_OBSERVATION_URL,
} from "../observations.js";

const now = Date.parse("2026-11-18T13:05:00Z");
const report = (overrides) => ({
  icaoId: "EGVN",
  metarType: "METAR",
  obsTime: now / 1000 - 15 * 60,
  temp: 9,
  dewp: 8,
  wspd: 10,
  ...overrides,
});

test("parses a recent Brize Norton METAR into supported display units", () => {
  // Live API sample observed 2026-11-18T12:50Z: 09/07°C and 9 kt wind.
  const observation = parseStationObservations(
    [
      report({
        obsTime: 1795006200,
        temp: 9,
        dewp: 7,
        wspd: 9,
      }),
    ],
    now,
  );
  assert.equal(observation.stationId, "EGVN");
  assert.equal(observation.temperatureC, 9);
  assert.ok(observation.humidityPct > 85 && observation.humidityPct < 90);
  assert.ok(Math.abs(observation.windMph - 10.357) < 0.001);
  assert.equal(observation.observedAt, 1795006200 * 1000);
  assert.equal(isFreshStationObservation(observation, now), true);
});

test("uses fresh station temperature, humidity and wind in the current row", () => {
  const observation = parseStationObservations([report()], now);
  const current = currentMeasurements(
    {
      temperature_2m: 8,
      apparent_temperature: 5,
      relative_humidity_2m: 60,
      wind_speed_10m: 3,
    },
    observation,
    now,
  );
  assert.equal(current.temperatureC, 9);
  assert.equal(current.apparentTemperatureC, 5);
  assert.ok(current.humidityPct > 90);
  assert.ok(Math.abs(current.windMph - 11.508) < 0.001);
  assert.equal(current.observedAt, observation.observedAt);
});

test("falls back to forecast values when station readings are stale or missing", () => {
  const forecast = {
    temperature_2m: 8,
    apparent_temperature: 5,
    relative_humidity_2m: 60,
    wind_speed_10m: 3,
  };
  const stale = parseStationObservations(
    [report({ obsTime: now / 1000 - 91 * 60 })],
    now,
  );
  assert.deepEqual(currentMeasurements(forecast, stale, now), {
    temperatureC: 8,
    apparentTemperatureC: 5,
    humidityPct: 60,
    windMph: 3,
    observedAt: null,
  });
  assert.deepEqual(currentMeasurements(forecast, null, now), {
    temperatureC: 8,
    apparentTemperatureC: 5,
    humidityPct: 60,
    windMph: 3,
    observedAt: null,
  });
});

test("uses the newest usable METAR and rejects another station", () => {
  const older = report({ obsTime: now / 1000 - 45 * 60, temp: 7 });
  const otherStation = report({ icaoId: "EGUW", temp: 30 });
  const latest = report({ obsTime: now / 1000 - 5 * 60, temp: 10 });
  assert.equal(
    parseStationObservations([latest, otherStation, older], now).temperatureC,
    10,
  );
});

test("rejects stale readings instead of retaining historical station series", () => {
  const old = report({ obsTime: now / 1000 - 91 * 60, temp: 6 });
  const recent = report({ obsTime: now / 1000 - 15 * 60, temp: 9 });
  assert.equal(parseStationObservations([recent, old], now).temperatureC, 9);
  assert.equal(parseStationObservations([old], now), null);
});

test("falls back to the newest fresh plausible report", () => {
  const usable = report({ obsTime: now / 1000 - 10 * 60, temp: 9 });
  const invalidNewer = report({ obsTime: now / 1000 - 2 * 60, temp: 99 });
  assert.equal(
    parseStationObservations([invalidNewer, usable], now).temperatureC,
    9,
  );
});

test("stale, future, missing and implausible reports safely fall back", () => {
  assert.equal(
    parseStationObservations([report({ obsTime: now / 1000 - 91 * 60 })], now),
    null,
  );
  assert.equal(
    parseStationObservations([report({ obsTime: now / 1000 + 6 * 60 })], now),
    null,
  );
  assert.equal(parseStationObservations([report({ temp: 99 })], now), null);
  assert.equal(parseStationObservations(null, now), null);
  const malformed = parseStationObservations(
    [report({ dewp: 30, wspd: 400 })],
    now,
  );
  assert.equal(malformed.humidityPct, null);
  assert.equal(malformed.windMph, null);
  assert.equal(
    isFreshStationObservation(malformed, now),
    true,
    "a valid temperature is still useful when other readings are missing",
  );
  assert.equal(
    isFreshStationObservation({ ...malformed, temperatureC: 99 }, now),
    false,
  );
});

test("applies humidity and wind plausibility checks to cached observations", () => {
  const observation = parseStationObservations([report()], now);
  assert.equal(
    isFreshStationObservation({ ...observation, humidityPct: 140 }, now),
    false,
  );
  assert.equal(
    isFreshStationObservation({ ...observation, windMph: -1 }, now),
    false,
  );
  assert.equal(
    isFreshStationObservation(
      { ...observation, observedAt: now - 91 * 60_000 },
      now,
    ),
    false,
  );
});

test("station outages and malformed responses return no observation without failing the forecast", async () => {
  assert.equal(
    await fetchStationData(async () => {
      throw new Error("offline");
    }, now),
    null,
  );
  assert.equal(
    await fetchStationData(
      async () => ({ ok: false, json: async () => [] }),
      now,
    ),
    null,
  );
  assert.equal(
    await fetchStationData(
      async () => ({ ok: true, json: async () => ({ bad: true }) }),
      now,
    ),
    null,
  );
  let requestedUrl;
  const observation = await fetchStationData(async (url) => {
    requestedUrl = url;
    return {
      ok: true,
      json: async () => [report({ obsTime: now / 1000 - 10 * 60 })],
    };
  }, now);
  assert.equal(requestedUrl, STATION_OBSERVATION_URL);
  assert.match(requestedUrl, /hours=2$/);
  assert.equal(observation.stationId, "EGVN");
});
