import assert from "node:assert/strict";
import test from "node:test";
import trigger, { isPublishWindow } from "../ops/cloudflare-weather-trigger.js";

test("dispatch minute stays at :57 in winter and summer", () => {
  assert.equal(isPublishWindow(Date.UTC(2026, 10, 20, 6, 57)), true);
  assert.equal(isPublishWindow(Date.UTC(2026, 5, 20, 5, 57)), true);
  assert.equal(isPublishWindow(Date.UTC(2026, 5, 20, 6, 57)), true);
  assert.equal(isPublishWindow(Date.UTC(2026, 5, 20, 6, 56)), false);
});

test("dispatch window covers every hour at minute 57", () => {
  for (let hour = 0; hour < 24; hour += 1) {
    assert.equal(
      isPublishWindow(Date.UTC(2026, 10, 20, hour, 57)),
      true,
      `${hour}:57 UTC should dispatch`,
    );
  }
  assert.equal(isPublishWindow(Date.UTC(2026, 10, 20, 22, 56)), false);
  assert.equal(isPublishWindow(Date.UTC(2026, 10, 20, 22, 0)), false);
});

test("scheduled handler dispatches the timer on the hourly minute", async (t) => {
  let request;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    request = { url, options };
    return new Response(null, { status: 204 });
  });

  await trigger.scheduled(
    { scheduledTime: Date.UTC(2026, 10, 19, 14, 57) },
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
      { scheduledTime: Date.UTC(2026, 10, 20, 6, 57) },
      { GITHUB_TOKEN: "test-only-token" },
    ),
    /GitHub workflow dispatch failed \(403\)/,
  );
});

test("scheduled handler refuses to run without a configured token", async () => {
  await assert.rejects(
    trigger.scheduled({ scheduledTime: Date.UTC(2026, 10, 20, 6, 57) }, {}),
    /Missing GITHUB_TOKEN secret/,
  );
});

test("off-minute trigger does not dispatch or need a GitHub token", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("fetch must not run outside a publish window");
  });

  await trigger.scheduled(
    { scheduledTime: Date.UTC(2026, 10, 20, 7, 56), cron: "57 * * * *" },
    {},
  );
});
