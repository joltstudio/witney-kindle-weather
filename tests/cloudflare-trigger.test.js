import assert from "node:assert/strict";
import test from "node:test";
import trigger from "../ops/cloudflare-weather-trigger.js";

test("scheduled handler dispatches the Pages workflow on main", async (t) => {
  let request;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    request = { url, options };
    return new Response(null, { status: 204 });
  });

  await trigger.scheduled({ scheduledTime: Date.UTC(2026, 10, 19, 14, 30) }, {
    GITHUB_TOKEN: "test-only-token",
  });

  assert.equal(
    request.url,
    "https://api.github.com/repos/joltstudio/witney-kindle-weather/actions/workflows/pages.yml/dispatches",
  );
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers.Authorization, "Bearer test-only-token");
  assert.deepEqual(JSON.parse(request.options.body), { ref: "main" });
});

test("scheduled handler fails clearly when the dispatch is rejected", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    new Response("Resource not accessible by integration", { status: 403 }),
  );

  await assert.rejects(
    trigger.scheduled({ scheduledTime: 0 }, { GITHUB_TOKEN: "test-only-token" }),
    /GitHub workflow dispatch failed \(403\)/,
  );
});

test("scheduled handler refuses to run without a configured token", async () => {
  await assert.rejects(
    trigger.scheduled({ scheduledTime: 0 }, {}),
    /Missing GITHUB_TOKEN secret/,
  );
});
