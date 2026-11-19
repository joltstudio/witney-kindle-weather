import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { grayscalePng } from "./grayscale-png.mjs";

const chrome =
  process.env.CHROME_BIN ??
  (process.platform === "darwin"
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : "google-chrome");
const live = process.argv.includes("--live");
const snapshot = process.argv.includes("--snapshot");
const outputArg = process.argv
  .find((arg) => arg.startsWith("--output="))
  ?.slice("--output=".length);
const out = resolve(
  outputArg ||
    (live || snapshot
      ? "outputs/witney-weather-live-600x800.png"
      : "outputs/witney-weather-600x800.png"),
);
const url = `http://127.0.0.1:4173/?mode=${snapshot ? "snapshot" : live ? "live" : "fixture"}`;
await mkdir(resolve("outputs"), { recursive: true });
const profile = await mkdtemp(join(tmpdir(), "witney-weather-chrome-"));
try {
  const result = spawnSync(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      ...(process.env.CHROME_NO_SANDBOX === "1" ? ["--no-sandbox"] : []),
      "--window-size=600,800",
      `--user-data-dir=${profile}`,
      `--screenshot=${out}`,
      `--virtual-time-budget=${live || snapshot ? 15000 : 1500}`,
      url,
    ],
    { encoding: "utf8" },
  );
  if (result.error) {
    throw new Error(
      `Could not start Chrome (${chrome}): ${result.error.message}`,
    );
  }
  if (result.status !== 0) {
    const exit = result.signal
      ? `Chrome exited after signal ${result.signal}.`
      : `Chrome exited with status ${result.status}.`;
    throw new Error(result.stderr?.trim() || exit);
  }
  const png = grayscalePng(await readFile(out));
  await writeFile(out, png);
  const width = png.readUInt32BE(16),
    height = png.readUInt32BE(20);
  const colorType = png[25];
  if (width !== 600 || height !== 800)
    throw new Error(`Expected 600×800 PNG; got ${width}×${height}.`);
  if (colorType !== 0)
    throw new Error(
      `Expected an 8-bit grayscale PNG for Kindle eips; got color type ${colorType}.`,
    );
  console.log(`Wrote ${out} (${width}×${height}, grayscale PNG)`);
} finally {
  await rm(profile, { recursive: true, force: true });
}
