import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchStationData, isFreshStationObservation, parseStationObservationSeries, parseStationObservations, STATION_OBSERVATION_URL } from '../observations.js';

const now = Date.parse('2026-11-18T13:05:00Z');
const report = overrides => ({
  icaoId: 'EGVN', metarType: 'METAR', obsTime: now / 1000 - 15 * 60,
  temp: 9, dewp: 8, wspd: 10, ...overrides
});

test('parses a recent Brize Norton METAR into supported display units', () => {
  // Live API sample observed 2026-11-18T12:50Z: 09/07°C and 9 kt wind.
  const observation = parseStationObservations([report({
    obsTime: 1795006200, temp: 9, dewp: 7, wspd: 9
  })], now);
  assert.equal(observation.stationId, 'EGVN');
  assert.equal(observation.temperatureC, 9);
  assert.ok(observation.humidityPct > 85 && observation.humidityPct < 90);
  assert.ok(Math.abs(observation.windMph - 10.3570) < 0.001);
  assert.equal(observation.observedAt, 1795006200 * 1000);
  assert.equal(isFreshStationObservation(observation, now), true);
});

test('uses the newest usable METAR and rejects another station', () => {
  const older = report({ obsTime: now / 1000 - 45 * 60, temp: 7 });
  const otherStation = report({ icaoId: 'EGUW', temp: 30 });
  const latest = report({ obsTime: now / 1000 - 5 * 60, temp: 10 });
  assert.equal(parseStationObservations([latest, otherStation, older], now).temperatureC, 10);
});

test('returns sorted actual readings over 24 hours while keeping them separate from forecasts', () => {
  const oldest = report({ obsTime: now / 1000 - 23 * 3600, temp: 6 });
  const newest = report({ obsTime: now / 1000 - 15 * 60, temp: 9 });
  const history = parseStationObservationSeries([newest, oldest, newest], now);
  assert.equal(history.length, 2);
  assert.ok(history[0].observedAt < history[1].observedAt);
  assert.equal(history.at(-1).temperatureC, 9);
  assert.equal(parseStationObservationSeries([report({ obsTime: now / 1000 - 25 * 3600 })], now).length, 0);
});

test('stale, future, missing and implausible reports safely fall back', () => {
  assert.equal(parseStationObservations([report({ obsTime: now / 1000 - 91 * 60 })], now), null);
  assert.equal(parseStationObservations([report({ obsTime: now / 1000 + 6 * 60 })], now), null);
  assert.equal(parseStationObservations([report({ temp: 99 })], now), null);
  assert.equal(parseStationObservations(null, now), null);
  const malformed = parseStationObservations([report({ dewp: 30, wspd: 400 })], now);
  assert.equal(malformed.humidityPct, null);
  assert.equal(malformed.windMph, null);
  assert.equal(isFreshStationObservation(malformed, now), true,'a valid temperature is still useful when other readings are missing');
  assert.equal(isFreshStationObservation({ ...malformed, temperatureC: 99 }, now), false);
});

test('applies humidity and wind plausibility checks to cached observations', () => {
  const observation = parseStationObservations([report()], now);
  assert.equal(isFreshStationObservation({ ...observation, humidityPct: 140 }, now), false);
  assert.equal(isFreshStationObservation({ ...observation, windMph: -1 }, now), false);
  assert.equal(isFreshStationObservation({ ...observation, observedAt: now - 91 * 60_000 }, now), false);
});

test('station outages and malformed responses return no observation without failing the forecast', async () => {
  assert.deepEqual(await fetchStationData(async () => { throw new Error('offline'); }, now), { stationObservation: null, stationObservations: [] });
  assert.deepEqual(await fetchStationData(async () => ({ ok: false, json: async () => [] }), now), { stationObservation: null, stationObservations: [] });
  assert.deepEqual(await fetchStationData(async () => ({ ok: true, json: async () => ({ bad: true }) }), now), { stationObservation: null, stationObservations: [] });
  let requestedUrl;
  const { stationObservation: observation, stationObservations } = await fetchStationData(async url => {
    requestedUrl = url;
    return { ok: true, json: async () => [report({ obsTime: now / 1000 - 10 * 60 })] };
  }, now);
  assert.equal(requestedUrl, STATION_OBSERVATION_URL);
  assert.equal(observation.stationId, 'EGVN');
  assert.equal(stationObservations.length, 1);
});
