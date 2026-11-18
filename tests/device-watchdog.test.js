import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const watchdog = new URL('../device/kindle-weather-watchdog.sh', import.meta.url).pathname;

async function waitForFile(path) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (existsSync(path)) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail(`Timed out waiting for ${path}`);
}

test('boot watchdog launches the app and respects the Home/Exit opt-out marker', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'witney-weather-watchdog-'));
  try {
    const app = join(temp, 'weather.sh');
    const marker = join(temp, 'user-exit');
    const calls = join(temp, 'calls.log');
    const appPidfile = join(temp, 'app.pid');
    const legacyPidfile = join(temp, 'legacy.pid');
    const log = join(temp, 'app.log');
    writeFileSync(app, `#!/bin/sh\nprintf '%s\\n' "$1" >> '${calls}'\n`);
    chmodSync(app, 0o755);
    const env = {
      ...process.env,
      WEATHER_APP: app,
      WEATHER_APP_PIDFILE: appPidfile,
      WEATHER_EXIT_MARKER: marker,
      WEATHER_LEGACY_PIDFILE: legacyPidfile,
      WEATHER_LOG: log,
    };

    const firstRun = spawnSync('/bin/sh', [watchdog], { env, encoding: 'utf8' });
    assert.equal(firstRun.status, 0, firstRun.stderr);
    await waitForFile(calls);
    assert.equal(readFileSync(calls, 'utf8').trim(), 'autostart');

    writeFileSync(marker, '');
    const secondRun = spawnSync('/bin/sh', [watchdog], { env, encoding: 'utf8' });
    assert.equal(secondRun.status, 0, secondRun.stderr);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(readFileSync(calls, 'utf8').trim().split('\n').length, 1);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
