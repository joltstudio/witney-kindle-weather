import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const worker = readFileSync(
  new URL("../ops/cloudflare-weather-trigger.js", import.meta.url),
  "utf8",
);

test("Cloudflare Worker exposes a secret-free health check", () => {
  assert.match(worker, /async fetch\(request\)/);
  assert.match(worker, /url\.pathname !== "\/healthz"/);
  assert.match(worker, /service: "witney-weather-trigger", status: "ok"/);
  assert.doesNotMatch(worker, /GITHUB_TOKEN[^\n]*Response/);
});

test("scheduled handler logs its scheduled time and dispatches the Pages workflow", () => {
  assert.match(worker, /async scheduled\(controller, env\)/);
  assert.match(worker, /Cron started: \$\{scheduledAt\}/);
  assert.match(worker, /actions\/workflows\/\$\{WORKFLOW\}\/dispatches/);
  assert.match(worker, /"User-Agent": "Witney-Kindle-Weather-Cron\/1\.0"/);
  assert.match(worker, /Dispatched \$\{WORKFLOW\} at \$\{scheduledAt\}/);
});
