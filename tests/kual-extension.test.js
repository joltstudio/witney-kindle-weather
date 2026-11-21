import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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
  assert.match(loop, /REFRESH_TIMES=05:05,06:05,07:05,08:05,09:05,10:05,11:05,12:05,13:05,14:05,15:05,16:05,17:05,18:05,19:05,20:05,21:05,22:05,23:05/);
  assert.match(loop, /trap 'REFRESH_NOW=1' USR1/);
  assert.match(launcher, /kill -USR1/);
  assert.match(loop, /last good screen retained/);
  assert.match(loop, /Home key received; exiting weather display/);
  assert.match(loop, /start_home_key_watcher\nsleep 3/);
  const watcherCall = loop.indexOf("\nstart_home_key_watcher\n");
  const cachedDisplayCall = loop.indexOf("\ndisplay_cached_image\n", watcherCall);
  const firstRefreshCall = loop.lastIndexOf("\nrefresh_weather\n");
  assert.ok(
    watcherCall < cachedDisplayCall && cachedDisplayCall < firstRefreshCall,
  );
  assert.match(loop, /Home key forwarded to Kindle framework/);
  assert.match(loop, /Weather refresh started/);
  assert.match(loop, /echo mem > "\$power_state"/);
  assert.match(loop, /wifid enable 0/);
  assert.match(loop, /rtc1\/wakealarm/);
  assert.match(loop, /WEATHER_REFRESH_TIMES/);
  assert.match(loop, /date '\+%H %M %S'/);
  assert.match(loop, /wake_at=\$\(\(now \+ refresh_delay\)\)/);
  assert.doesNotMatch(loop, /\$\(date -d/);
  assert.doesNotMatch(loop, /sleep "\$INTERVAL"/);
  assert.doesNotMatch(loop, /sleep 10/);
  assert.match(launcher, /autostart\)/);
  assert.match(launcher, /witney-weather-user-exit/);
});

test("Kindle schedule delay uses local clock arithmetic for configured slots", () => {
  const loop = read("bin/weather-loop.sh");
  const helper = loop.match(/  calculate_refresh_delay\(\) \{[\s\S]*?\n  \}/)?.[0];
  assert.ok(helper, "schedule delay helper is present");
  const run = (time, schedule, calendar = "5 20 11 2026") => execFileSync(
    "sh",
    ["-c", `${helper}\ncalculate_refresh_delay "$1" "$2" "$3"`, "test", time, schedule, calendar],
    { encoding: "utf8" },
  ).trim();
  const slots = "05:05,06:05,07:05,08:05,09:05,10:05,11:05,12:05,13:05,14:05,15:05,16:05,17:05,18:05,19:05,20:05,21:05,22:05,23:05";

  assert.equal(run("05 00 00", slots), "300");
  assert.equal(run("05 05 00", slots), "3600");
  assert.equal(run("12 06 00", slots), "3540");
  assert.equal(run("23 06 00", slots), "21540");
  assert.equal(run("23 06 00", slots, "6 28 03 2026"), "17940");
  assert.equal(run("23 06 00", slots, "6 24 10 2026"), "25140");
  assert.throws(() => run("25 00 00", slots));
  assert.throws(() => run("12 00 00", "bad"));
});

test("weather loop waits for Wi-Fi and retries transient DNS or network failures", () => {
  const loop = read("bin/weather-loop.sh");
  const config = readFileSync(
    new URL("../../kindle-weather-config.example", root),
    "utf8",
  );

  assert.match(config, /WEATHER_REFRESH_TIMES=05:05,06:05,07:05,08:05,09:05,10:05,11:05,12:05,13:05,14:05,15:05,16:05,17:05,18:05,19:05,20:05,21:05,22:05,23:05/);
  assert.match(config, /WEATHER_WIFI_SETTLE_SECONDS=60/);
  assert.match(config, /WEATHER_FETCH_ATTEMPTS=3/);
  assert.match(config, /WEATHER_RETRY_DELAY_SECONDS=10/);
  assert.match(loop, /attempt=1/);
  assert.match(loop, /while \[ "\$attempt" -le "\$FETCH_ATTEMPTS" \]/);
  assert.match(loop, /Reconnecting Wi-Fi before retry/);
  assert.match(loop, /Waiting \$WIFI_SETTLE_SECONDS seconds after Wi-Fi reconnect/);
  assert.match(loop, /Retrying weather download in \$delay seconds/);
  assert.match(loop, /All \$FETCH_ATTEMPTS weather download attempts failed/);
  assert.match(loop, /Wi-Fi enable request failed; download retries will continue/);
  assert.match(loop, /Waiting \$WIFI_SETTLE_SECONDS seconds for Wi-Fi connection/);
});
