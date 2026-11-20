import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const root = new URL(
  "../device/kual-extension/WitneyWeather/",
  import.meta.url,
);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("KUAL extension exposes open, refresh, and stop actions with valid scripts", () => {
  const menu = JSON.parse(read("menu.json"));
  const actions = menu.items.map((item) => item.params);
  assert.deepEqual(actions, ["start", "refresh", "stop"]);
  assert.deepEqual(
    menu.items.map((item) => item.name),
    ["Open Weather Display", "Refresh Forecast Now", "Exit Weather Display"],
  );
  assert.equal(menu.items[0].exitmenu, true);
  assert.equal(menu.items[1].exitmenu, true);
  assert.equal("refresh" in menu.items[0], false);
  assert.equal("refresh" in menu.items[1], false);
  for (const item of menu.items) {
    assert.equal(item.action, "./bin/weather.sh");
    assert.ok(existsSync(new URL(item.action.replace("./", ""), root)));
  }
  assert.match(
    read("config.xml"),
    /<menu type="json" dynamic="true">menu\.json<\/menu>/,
  );
});

test("weather loop refreshes on demand, retains cache, and sleeps with Wi-Fi off between updates", () => {
  const menu = read("menu.json");
  const launcher = read("bin/weather.sh");
  const loop = read("bin/weather-loop.sh");
  assert.match(menu, /"exitmenu": true/);
  assert.match(loop, /INTERVAL=1800/);
  assert.match(loop, /trap 'REFRESH_NOW=1' USR1/);
  assert.match(launcher, /kill -USR1/);
  assert.match(loop, /last good screen retained/);
  assert.match(loop, /Home key received; exiting weather display/);
  assert.ok(
    loop.indexOf("refresh_weather\nstart_home_key_watcher") >
      loop.indexOf("display_cached_image\n"),
  );
  assert.ok(
    loop.indexOf("refresh_weather\nstart_home_key_watcher") <
      loop.indexOf("while :; do"),
  );
  assert.match(loop, /Weather refresh started/);
  assert.match(loop, /echo mem > "\$power_state"/);
  assert.match(loop, /wifid enable 0/);
  assert.match(loop, /rtc1\/wakealarm/);
  assert.match(loop, /WEATHER_REFRESH_SECONDS/);
  assert.doesNotMatch(loop, /sleep 10/);
  assert.match(launcher, /autostart\)/);
  assert.match(launcher, /witney-weather-user-exit/);
});

test("weather loop waits for Wi-Fi and retries transient DNS or network failures", () => {
  const loop = read("bin/weather-loop.sh");
  const config = readFileSync(
    new URL("../../kindle-weather-config.example", root),
    "utf8",
  );

  assert.match(config, /WEATHER_WIFI_SETTLE_SECONDS=20/);
  assert.match(config, /WEATHER_FETCH_ATTEMPTS=3/);
  assert.match(config, /WEATHER_RETRY_DELAY_SECONDS=10/);
  assert.match(loop, /attempt=1/);
  assert.match(loop, /while \[ "\$attempt" -le "\$FETCH_ATTEMPTS" \]/);
  assert.match(loop, /Retrying weather download in \$delay seconds/);
  assert.match(loop, /All \$FETCH_ATTEMPTS weather download attempts failed/);
  assert.match(loop, /Wi-Fi enable request failed; download retries will continue/);
  assert.match(loop, /Waiting \$WIFI_SETTLE_SECONDS seconds for Wi-Fi connection/);
});
