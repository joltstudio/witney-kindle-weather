import assert from "node:assert/strict";
import test from "node:test";
import trigger, { isPublishWindow } from "../ops/cloudflare-weather-trigger.js";

test("dispatch window follows UK local time in winter and summer", () => {
  assert.equal(isPublishWindow(Date.UTC(2026, 10, 20, 6, 17)), true);
  assert.equal(isPublishWindow(Date.UTC(2026, 5, 20, 5, 17)), true);
  assert.equal(isPublishWindow(Date.UTC(2026, 5, 20, 6, 17)), false);
});

test("dispatch window is limited to four-hour daytime slots", () => {
  for (const hour of [6, 10, 14, 18, 22]) {
    assert.equal(
      isPublishWindow(Date.UTC(2026, 10, 20, hour, 17)),
      true,
      `${hour}:17 UK time should publish`,
    );
  }
  assert.equal(isPublishWindow(Date.UTC(2026, 10, 20, 7, 17)), false);
  assert.equal(isPublishWindow(Date.UTC(2026, 10, 20, 22, 0)), false);
});

test("scheduled handler dispatches the timer only in a publish window", async (t) => {
  let request;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    request = { url, options };
    return new Response(null, { status: 204 });
  });

  await trigger.scheduled(
    { scheduledTime: Date.UTC(2026, 10, 19, 14, 17) },
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
      { scheduledTime: Date.UTC(2026, 10, 20, 6, 17) },
      { GITHUB_TOKEN: "test-only-token" },
    ),
    /GitHub workflow dispatch failed \(403\)/,
  );
});

test("scheduled handler refuses to run without a configured token", async () => {
  await assert.rejects(
    trigger.scheduled({ scheduledTime: Date.UTC(2026, 10, 20, 6, 17) }, {}),
    /Missing GITHUB_TOKEN secret/,
  );
});

test("off-window hourly trigger does not dispatch or need a GitHub token", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("fetch must not run outside a publish window");
  });

  await trigger.scheduled(
    { scheduledTime: Date.UTC(2026, 10, 20, 7, 17), cron: "17 * * * *" },
    {},
  );
});
