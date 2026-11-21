import assert from "node:assert/strict";
import test from "node:test";
import trigger from "../ops/cloudflare-weather-trigger.js";

test("scheduled handler dispatches even when its event is delivered late", async (t) => {
  let request;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    request = { url, options };
    return new Response(null, { status: 204 });
  });

  await trigger.scheduled(
    {
      scheduledTime: Date.UTC(2026, 10, 19, 14, 58),
      cron: "57 * * * *",
    },
    { GITHUB_TOKEN: "test-only-token" },
  );

  assert.equal(
    request.url,
    "https://api.github.com/repos/joltstudio/witney-kindle-weather/actions/workflows/pages.yml/dispatches",
  );
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers.Authorization, "Bearer test-only-token");
  assert.deepEqual(JSON.parse(request.options.body), {
    ref: "main",
    inputs: { trigger: "timer" },
  });
});

test("scheduled handler reports rejected dispatches without exposing the token", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    new Response("Resource not accessible by integration", { status: 403 }),
  );

  await assert.rejects(
    trigger.scheduled(
      { scheduledTime: Date.UTC(2026, 10, 20, 6, 58) },
      { GITHUB_TOKEN: "test-only-token" },
    ),
    /GitHub workflow dispatch failed \(403\)/,
  );
});

test("scheduled handler refuses to run without a configured token", async () => {
  await assert.rejects(
    trigger.scheduled({ scheduledTime: Date.UTC(2026, 10, 20, 6, 58) }, {}),
    /Missing GITHUB_TOKEN secret/,
  );
});
