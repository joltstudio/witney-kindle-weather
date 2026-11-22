import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const destination = resolve(process.argv[2] ?? "outputs/device-update");
let version = process.argv[3] ?? process.env.UPDATE_VERSION;
if (!version) {
  version = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: projectRoot,
    encoding: "utf8",
  }).trim();
}
if (!/^[A-Za-z0-9._-]{1,64}$/.test(version)) {
  throw new Error("Update version must contain only letters, digits, dot, _ or -");
}

const files = [
  ["menu.json", "device/kual-extension/WitneyWeather/menu.json"],
  ["weather.sh", "device/kual-extension/WitneyWeather/bin/weather.sh"],
  ["weather-loop.sh", "device/kual-extension/WitneyWeather/bin/weather-loop.sh"],
  ["wifi-diagnostic.sh", "device/kual-extension/WitneyWeather/bin/wifi-diagnostic.sh"],
  ["watchdog.sh", "device/kindle-weather-watchdog.sh"],
];

await mkdir(`${destination}/files`, { recursive: true });
const manifest = [`version ${version}`];
for (const [name, relativePath] of files) {
  const content = await readFile(resolve(projectRoot, relativePath));
  if (name === "menu.json") JSON.parse(content.toString("utf8"));
  const digest = createHash("sha256").update(content).digest("hex");
  await writeFile(resolve(destination, "files", name), content);
  manifest.push(`${digest} ${name}`);
}
await writeFile(resolve(destination, "manifest.txt"), `${manifest.join("\n")}\n`);
console.log(`Built ${files.length} verified device files for ${version} in ${destination}`);
