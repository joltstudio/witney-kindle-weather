import test from "node:test";
import assert from "node:assert/strict";
import {
  REFRESH_AFTER_MS,
  isPublishWindow,
  shouldRefreshSnapshot,
} from "../scripts/refresh-policy.mjs";

const now = Date.UTC(2026, 10, 18, 18, 57); // 18:57 GMT, an hourly slot.

test("push and manual publishes always fetch current data", () => {
  const fresh = { fetchedAt: now - 1000 };
  assert.equal(shouldRefreshSnapshot(fresh, "push", now), true);
  assert.equal(shouldRefreshSnapshot(fresh, "workflow_dispatch", now), true);
});

test("external timer dispatches run hourly at :57 and deduplicate within 55 minutes", () => {
  assert.equal(
    shouldRefreshSnapshot(
      { fetchedAt: now - REFRESH_AFTER_MS + 1 },
      "workflow_dispatch",
      now,
      "timer",
    ),
    false,
  );
  assert.equal(
    shouldRefreshSnapshot(
      { fetchedAt: now - REFRESH_AFTER_MS },
      "workflow_dispatch",
      now,
      "timer",
    ),
    true,
  );
});

test("hourly schedule skips recent snapshots and refreshes after the 55-minute guard", () => {
  assert.equal(
    shouldRefreshSnapshot(
      { fetchedAt: now - REFRESH_AFTER_MS + 1 },
      "schedule",
      now,
    ),
    false,
  );
  assert.equal(
    shouldRefreshSnapshot(
      { fetchedAt: now - REFRESH_AFTER_MS },
      "schedule",
      now,
    ),
    true,
  );
  assert.equal(
    shouldRefreshSnapshot(
      { fetchedAt: now - REFRESH_AFTER_MS - 1 },
      "schedule",
      now,
    ),
    true,
  );
});

test("timer gating follows the hourly :57 minute through daylight-saving changes", () => {
  assert.equal(isPublishWindow(Date.UTC(2026, 0, 14, 6, 57)), true);
  assert.equal(isPublishWindow(Date.UTC(2026, 6, 14, 5, 57)), true);
  assert.equal(isPublishWindow(Date.UTC(2026, 6, 14, 6, 57)), true);
  assert.equal(isPublishWindow(Date.UTC(2026, 6, 14, 6, 56)), false);
  assert.equal(
    shouldRefreshSnapshot({ fetchedAt: now - 5 * 60 * 1000 }, "schedule", Date.UTC(2026, 10, 18, 19, 56)),
    false,
  );
  assert.equal(shouldRefreshSnapshot(undefined, "schedule", Date.UTC(2026, 10, 18, 19, 56)), true);
});

test("missing, malformed and future-dated snapshots trigger a live fetch", () => {
  assert.equal(shouldRefreshSnapshot(undefined, "schedule", now), true);
  assert.equal(
    shouldRefreshSnapshot({ fetchedAt: "invalid" }, "schedule", now),
    true,
  );
  assert.equal(
    shouldRefreshSnapshot({ fetchedAt: now + 1 }, "schedule", now),
    true,
  );
});
