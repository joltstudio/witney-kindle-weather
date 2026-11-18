import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../device/kual-extension/WitneyWeather/', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('KUAL extension exposes open, refresh, and stop actions with valid scripts', () => {
  const menu = JSON.parse(read('menu.json'));
  const actions = menu.items.map((item) => item.params);
  assert.deepEqual(actions, ['start', 'refresh', 'stop']);
  assert.deepEqual(menu.items.map((item) => item.name), [
    'Open Weather Display',
    'Refresh Forecast Now',
    'Exit Weather Display',
  ]);
  assert.equal(menu.items[0].exitmenu, true);
  assert.equal(menu.items[1].exitmenu, true);
  assert.equal('refresh' in menu.items[0], false);
  assert.equal('refresh' in menu.items[1], false);
  for (const item of menu.items) {
    assert.equal(item.action, './bin/weather.sh');
    assert.ok(existsSync(new URL(item.action.replace('./', ''), root)));
  }
  assert.match(read('config.xml'), /<menu type="json" dynamic="true">menu\.json<\/menu>/);
});

test('weather loop is session launched, refreshes on demand and periodically, and retains the last good image', () => {
  const menu = read('menu.json');
  const launcher = read('bin/weather.sh');
  const loop = read('bin/weather-loop.sh');
  assert.match(menu, /"exitmenu": true/);
  assert.match(loop, /INTERVAL=1800/);
  assert.match(loop, /trap 'REFRESH_NOW=1' USR1/);
  assert.match(launcher, /kill -USR1/);
  assert.match(loop, /last good screen retained/);
  assert.doesNotMatch(loop, /echo mem > \/sys\/power\/state/);
  assert.doesNotMatch(loop, /wifid enable 0/);
});
