import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const builder = join(projectRoot, "scripts/build-device-update.mjs");
const updater = join(
  projectRoot,
  "device/kual-extension/WitneyWeather/bin/update.sh",
);
const wifiDiagnostic = join(
  projectRoot,
  "device/kual-extension/WitneyWeather/bin/wifi-diagnostic.sh",
);

test("device update manifest covers the complete allowlisted app payload", (t) => {
  const output = mkdtempSync(join(tmpdir(), "witney-device-update-"));
  t.after(() => rmSync(output, { recursive: true, force: true }));
  execFileSync("node", [builder, output, "test-version"], {
    cwd: projectRoot,
  });

  const manifest = readFileSync(join(output, "manifest.txt"), "utf8").trim();
  const [versionRow, ...fileRows] = manifest.split("\n");
  assert.equal(versionRow, "version test-version");
  assert.equal(fileRows.length, 5);
  assert.deepEqual(
    fileRows.map((row) => row.split(" ")[1]).sort(),
    ["menu.json", "watchdog.sh", "weather-loop.sh", "weather.sh", "wifi-diagnostic.sh"],
  );

  for (const row of fileRows) {
    const [expected, name] = row.split(" ");
    const content = readFileSync(join(output, "files", name));
    const actual = createHash("sha256").update(content).digest("hex");
    assert.equal(actual, expected, `${name} digest matches the published manifest`);
  }
  assert.doesNotThrow(() => JSON.parse(readFileSync(join(output, "files/menu.json"))));
});

test("Wi-Fi updater is syntax-valid and restricts remote file targets", () => {
  execFileSync("sh", ["-n", updater]);
  const source = readFileSync(updater, "utf8");
  assert.match(source, /--verify "\$CA_BUNDLE"/);
  assert.match(source, /sha256sum/);
  assert.match(source, /weather-update-backup/);
  assert.match(source, /weather-update-in-progress/);
  assert.match(source, /menu\.json\|weather\.sh\|weather-loop\.sh\|wifi-diagnostic\.sh\|watchdog\.sh/);
  assert.doesNotMatch(source, /config\|menu\.json/);
  assert.doesNotMatch(source, /\beval\s/);
  execFileSync("sh", ["-n", wifiDiagnostic]);
  const diagnostic = readFileSync(wifiDiagnostic, "utf8");
  assert.match(diagnostic, /com\.lab126\.wifid cmState/);
  assert.match(diagnostic, /WIFI_DIAG_CONNECT_TIMEOUT:-120/);
  assert.match(diagnostic, /GitHub manifest HTTPS succeeded/);
  assert.match(diagnostic, /log "completed;/);
});

test("Wi-Fi diagnostic measures a healthy Kindle connection and tests the update host", (t) => {
  const sandbox = mkdtempSync(join(tmpdir(), "witney-wifi-diag-"));
  t.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const root = join(sandbox, "kindle-weather");
  const fakeBin = join(sandbox, "bin");
  const remote = join(sandbox, "remote");
  mkdirSync(root, { recursive: true });
  mkdirSync(fakeBin, { recursive: true });
  execFileSync("node", [builder, remote, "diag-version"], { cwd: projectRoot });
  writeFileSync(join(sandbox, "ca.pem"), "test CA bundle\n");
  writeFileSync(join(sandbox, "resolv.conf"), "nameserver 192.0.2.53\n");
  writeFileSync(join(fakeBin, "lipc-set"), "#!/bin/sh\necho \"$*\" >> \"$WIFI_DIAG_COMMANDS\"\n");
  writeFileSync(join(fakeBin, "lipc-get"), "#!/bin/sh\necho CONNECTED\n");
  writeFileSync(join(fakeBin, "ifconfig"), "#!/bin/sh\necho 'wlan0 Link encap:Ethernet inet addr:192.0.2.44 Bcast:192.0.2.255'\n");
  writeFileSync(join(fakeBin, "eips"), "#!/bin/sh\necho \"$*\" >> \"$WIFI_DIAG_SCREEN\"\n");
  writeFileSync(
    join(fakeBin, "xh"),
    `#!/bin/sh\noutput=\nwhile [ \"$#\" -gt 0 ]; do\n case \"$1\" in -o) output=$2; shift 2 ;; *) shift ;; esac\ndone\ncp \"$WIFI_DIAG_FIXTURE/manifest.txt\" \"$output\"\n`,
  );
  for (const name of ["lipc-set", "lipc-get", "ifconfig", "eips", "xh"]) {
    chmodSync(join(fakeBin, name), 0o755);
  }
  const env = {
    ...process.env,
    PATH: `${fakeBin}:${process.env.PATH}`,
    WIFI_DIAG_ROOT: root,
    WIFI_DIAG_LIPC_SET: join(fakeBin, "lipc-set"),
    WIFI_DIAG_LIPC_GET: join(fakeBin, "lipc-get"),
    WIFI_DIAG_XH: join(fakeBin, "xh"),
    WIFI_DIAG_CA_BUNDLE: join(sandbox, "ca.pem"),
    WIFI_DIAG_EIPS: join(fakeBin, "eips"),
    WIFI_DIAG_RESOLV_CONF: join(sandbox, "resolv.conf"),
    WIFI_DIAG_FIXTURE: remote,
    WIFI_DIAG_COMMANDS: join(sandbox, "commands.log"),
    WIFI_DIAG_SCREEN: join(sandbox, "screen.log"),
    WIFI_DIAG_CONNECT_TIMEOUT: "2",
    WIFI_DIAG_POLL_SECONDS: "1",
  };
  execFileSync("/bin/sh", [wifiDiagnostic], { env, cwd: projectRoot });
  const log = readFileSync(join(root, "app.log"), "utf8");
  assert.match(log, /Wi-Fi reached CONNECTED after \d+s/);
  assert.match(log, /GitHub manifest HTTPS succeeded/);
  assert.match(log, /interface IPv4: 192\.0\.2\.44/);
  assert.match(log, /configured DNS server: 192\.0\.2\.53/);
  assert.match(readFileSync(join(sandbox, "commands.log"), "utf8"), /com\.lab126\.wifid enable 1/);
  assert.match(readFileSync(join(sandbox, "commands.log"), "utf8"), /com\.lab126\.wifid enable 0/);
  assert.match(readFileSync(join(sandbox, "screen.log"), "utf8"), /GitHub HTTPS: OK/);
});

test("Wi-Fi updater verifies, backs up and installs the complete app payload", (t) => {
  const sandbox = mkdtempSync(join(tmpdir(), "witney-update-run-"));
  t.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const remote = join(sandbox, "remote");
  const root = join(sandbox, "kindle-weather");
  const app = join(sandbox, "extensions/WitneyWeather");
  const fakeBin = join(sandbox, "bin");
  const originals = {
    config: "user config stays local\n",
    "menu.json": '{"items":[]}\n',
    "weather.sh": "old launcher\n",
    "weather-loop.sh": "old loop\n",
    "wifi-diagnostic.sh": "old diagnostic\n",
    "watchdog.sh": "old watchdog\n",
  };

  execFileSync("node", [builder, remote, "test-version"], { cwd: projectRoot });
  mkdirSync(join(root), { recursive: true });
  mkdirSync(join(app, "bin"), { recursive: true });
  mkdirSync(fakeBin, { recursive: true });
  writeFileSync(join(root, "config"), originals.config);
  writeFileSync(join(root, "kindle-weather-watchdog.sh"), originals["watchdog.sh"]);
  writeFileSync(join(root, "weather-update-version"), "old-version\n");
  writeFileSync(join(app, "menu.json"), originals["menu.json"]);
  writeFileSync(join(app, "bin/weather.sh"), "#!/bin/sh\necho \"$1\" >> \"$WEATHER_UPDATE_ACTIONS\"\n");
  writeFileSync(join(fakeBin, "launcher.sh"), "#!/bin/sh\necho \"$1\" >> \"$WEATHER_UPDATE_ACTIONS\"\n");
  writeFileSync(join(app, "bin/weather-loop.sh"), originals["weather-loop.sh"]);
  writeFileSync(join(app, "bin/wifi-diagnostic.sh"), originals["wifi-diagnostic.sh"]);
  for (const filename of ["weather.sh", "weather-loop.sh"]) {
    chmodSync(join(app, "bin", filename), 0o755);
  }
  chmodSync(join(fakeBin, "launcher.sh"), 0o755);
  writeFileSync(join(sandbox, "cacert.pem"), "test CA bundle\n");
  writeFileSync(join(fakeBin, "lipc"), "#!/bin/sh\nexit 0\n");
  writeFileSync(
    join(fakeBin, "xh"),
    `#!/bin/sh\noutput=\nurl=\nwhile [ \"$#\" -gt 0 ]; do\n  case \"$1\" in\n    -o) output=$2; shift 2 ;;\n    get) url=$2; shift 2 ;;\n    *) shift ;;\n  esac\ndone\ncase \"$url\" in\n  */manifest.txt*) cp \"$WEATHER_UPDATE_FIXTURE/manifest.txt\" \"$output\" ;;\n  */files/*) name=\${url##*/}; name=\${name%%\\?*}; cp \"$WEATHER_UPDATE_FIXTURE/files/$name\" \"$output\" ;;\n  *) exit 1 ;;\nesac\n`,
  );
  writeFileSync(
    join(fakeBin, "sha256sum"),
    "#!/bin/sh\nexec shasum -a 256 \"$@\"\n",
  );
  for (const name of ["lipc", "xh", "sha256sum"]) chmodSync(join(fakeBin, name), 0o755);

  const env = {
    ...process.env,
    PATH: `${fakeBin}:${process.env.PATH}`,
    WEATHER_UPDATE_ROOT: root,
    WEATHER_UPDATE_APP: app,
    WEATHER_UPDATE_LAUNCHER: join(fakeBin, "launcher.sh"),
    WEATHER_UPDATE_XH: join(fakeBin, "xh"),
    WEATHER_UPDATE_CA_BUNDLE: join(sandbox, "cacert.pem"),
    WEATHER_UPDATE_LIPC: join(fakeBin, "lipc"),
    WEATHER_UPDATE_BASE_URL: "https://updates.invalid/device-update",
    WEATHER_UPDATE_FIXTURE: remote,
    WEATHER_UPDATE_LOG: join(root, "app.log"),
    WEATHER_UPDATE_ACTIONS: join(sandbox, "actions.log"),
    WEATHER_UPDATE_WIFI_SETTLE_SECONDS: "0",
    WEATHER_UPDATE_TIMEOUT_SECONDS: "5",
  };
  try {
    execFileSync("/bin/sh", [updater, "update"], { env, cwd: projectRoot });
  } catch (error) {
    assert.fail(`${error.message}\n${readFileSync(join(root, "app.log"), "utf8")}`);
  }

  for (const [name] of [
    ["menu.json"],
    ["weather.sh"],
    ["weather-loop.sh"],
    ["wifi-diagnostic.sh"],
    ["watchdog.sh"],
  ]) {
    const installed = name === "watchdog.sh"
        ? join(root, "kindle-weather-watchdog.sh")
        : name === "menu.json"
          ? join(app, name)
          : join(app, "bin", name);
    assert.deepEqual(
      readFileSync(installed),
      readFileSync(join(remote, "files", name)),
      `${name} installed from the verified payload`,
    );
  }
  assert.equal(readFileSync(join(root, "config"), "utf8"), originals.config);
  assert.equal(readFileSync(join(root, "weather-update-version"), "utf8"), "test-version\n");
  assert.equal(readFileSync(join(root, "weather-update-backup/menu.json"), "utf8"), originals["menu.json"]);
  assert.equal(readFileSync(join(root, "weather-update-backup/wifi-diagnostic.sh"), "utf8"), originals["wifi-diagnostic.sh"]);
  assert.equal(readFileSync(join(sandbox, "actions.log"), "utf8"), "stop\nstart\n");
  assert.match(readFileSync(join(root, "app.log"), "utf8"), /installed; restarting display/);
});

test("Wi-Fi updater rejects a bad digest before stopping or changing the app", (t) => {
  const sandbox = mkdtempSync(join(tmpdir(), "witney-update-bad-digest-"));
  t.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const remote = join(sandbox, "remote");
  const root = join(sandbox, "kindle-weather");
  const app = join(sandbox, "extensions/WitneyWeather");
  const fakeBin = join(sandbox, "bin");
  execFileSync("node", [builder, remote, "test-version"], { cwd: projectRoot });
  const manifestPath = join(remote, "manifest.txt");
  const manifest = readFileSync(manifestPath, "utf8");
  writeFileSync(
    manifestPath,
    manifest.replace(/\n([0-9a-f]{63})([0-9a-f])/, (_, prefix, last) =>
      `\n${prefix}${last === "0" ? "1" : "0"}`),
  );
  mkdirSync(join(root), { recursive: true });
  mkdirSync(join(app, "bin"), { recursive: true });
  mkdirSync(fakeBin, { recursive: true });
  const original = "keep this config\n";
  writeFileSync(join(root, "config"), original);
  writeFileSync(join(app, "menu.json"), '{"items":[]}\n');
  writeFileSync(join(app, "bin/weather.sh"), "#!/bin/sh\nexit 0\n");
  writeFileSync(join(app, "bin/weather-loop.sh"), "#!/bin/sh\nexit 0\n");
  writeFileSync(join(root, "kindle-weather-watchdog.sh"), "#!/bin/sh\nexit 0\n");
  writeFileSync(join(sandbox, "cacert.pem"), "test CA bundle\n");
  writeFileSync(join(fakeBin, "lipc"), "#!/bin/sh\nexit 0\n");
  writeFileSync(
    join(fakeBin, "xh"),
    `#!/bin/sh\noutput=\nurl=\nwhile [ \"$#\" -gt 0 ]; do\n  case \"$1\" in\n    -o) output=$2; shift 2 ;;\n    get) url=$2; shift 2 ;;\n    *) shift ;;\n  esac\ndone\ncase \"$url\" in\n  */manifest.txt*) cp \"$WEATHER_UPDATE_FIXTURE/manifest.txt\" \"$output\" ;;\n  */files/*) name=\${url##*/}; name=\${name%%\\?*}; cp \"$WEATHER_UPDATE_FIXTURE/files/$name\" \"$output\" ;;\n  *) exit 1 ;;\nesac\n`,
  );
  writeFileSync(join(fakeBin, "sha256sum"), "#!/bin/sh\nexec shasum -a 256 \"$@\"\n");
  for (const name of ["lipc", "xh", "sha256sum"]) chmodSync(join(fakeBin, name), 0o755);
  const actions = join(sandbox, "actions.log");
  writeFileSync(join(fakeBin, "launcher.sh"), "#!/bin/sh\necho \"$1\" >> \"$WEATHER_UPDATE_ACTIONS\"\n");
  chmodSync(join(fakeBin, "launcher.sh"), 0o755);
  const env = {
    ...process.env,
    PATH: `${fakeBin}:${process.env.PATH}`,
    WEATHER_UPDATE_ROOT: root,
    WEATHER_UPDATE_APP: app,
    WEATHER_UPDATE_LAUNCHER: join(fakeBin, "launcher.sh"),
    WEATHER_UPDATE_XH: join(fakeBin, "xh"),
    WEATHER_UPDATE_CA_BUNDLE: join(sandbox, "cacert.pem"),
    WEATHER_UPDATE_LIPC: join(fakeBin, "lipc"),
    WEATHER_UPDATE_BASE_URL: "https://updates.invalid/device-update",
    WEATHER_UPDATE_FIXTURE: remote,
    WEATHER_UPDATE_LOG: join(root, "app.log"),
    WEATHER_UPDATE_ACTIONS: actions,
    WEATHER_UPDATE_WIFI_SETTLE_SECONDS: "0",
    WEATHER_UPDATE_TIMEOUT_SECONDS: "5",
  };
  assert.throws(() => execFileSync("/bin/sh", [updater, "update"], { env, cwd: projectRoot }));
  assert.equal(readFileSync(join(root, "config"), "utf8"), original);
  assert.equal(existsSync(actions), false);
  assert.match(readFileSync(join(root, "app.log"), "utf8"), /SHA-256 mismatch/);
});
