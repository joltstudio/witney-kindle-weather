import test from "node:test";
import assert from "node:assert/strict";
import {
  REFRESH_AFTER_MS,
  isPublishWindow,
  shouldRefreshSnapshot,
} from "../scripts/refresh-policy.mjs";

const now = Date.UTC(2026, 10, 18, 18, 17); // 18:17 GMT, a due London slot.

test("push and manual publishes always fetch current data", () => {
  const fresh = { fetchedAt: now - 1000 };
  assert.equal(shouldRefreshSnapshot(fresh, "push", now), true);
  assert.equal(shouldRefreshSnapshot(fresh, "workflow_dispatch", now), true);
});

test("external timer dispatches are restricted to the London publish slots", () => {
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

test("hourly schedule skips recent snapshots and refreshes after the four-hour cadence", () => {
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

test("timer gating follows London time through daylight-saving changes", () => {
  assert.equal(isPublishWindow(Date.UTC(2026, 0, 14, 6, 17)), true); // 06:17 GMT
  assert.equal(isPublishWindow(Date.UTC(2026, 6, 14, 5, 17)), true); // 06:17 BST
  assert.equal(isPublishWindow(Date.UTC(2026, 6, 14, 6, 17)), false); // 07:17 BST
  assert.equal(
    shouldRefreshSnapshot({ fetchedAt: now - 5 * 60 * 60 * 1000 }, "schedule", Date.UTC(2026, 10, 18, 19, 17)),
    false,
  );
  assert.equal(shouldRefreshSnapshot(undefined, "schedule", Date.UTC(2026, 10, 18, 19, 17)), true);
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
