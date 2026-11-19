import test from 'node:test';
import assert from 'node:assert/strict';
import { REFRESH_AFTER_MS, shouldRefreshSnapshot } from '../scripts/refresh-policy.mjs';

const now = Date.UTC(2026, 10, 18, 17, 0);

test('push and manual publishes always fetch current data', () => {
  const fresh = { fetchedAt: now - 1000 };
  assert.equal(shouldRefreshSnapshot(fresh, 'push', now), true);
  assert.equal(shouldRefreshSnapshot(fresh, 'workflow_dispatch', now), true);
});

test('five-minute schedule skips a recent snapshot and refreshes at four minutes', () => {
  assert.equal(shouldRefreshSnapshot({ fetchedAt: now - REFRESH_AFTER_MS + 1 }, 'schedule', now), false);
  assert.equal(shouldRefreshSnapshot({ fetchedAt: now - REFRESH_AFTER_MS }, 'schedule', now), true);
  assert.equal(shouldRefreshSnapshot({ fetchedAt: now - REFRESH_AFTER_MS - 1 }, 'schedule', now), true);
});

test('missing, malformed and future-dated snapshots trigger a live fetch', () => {
  assert.equal(shouldRefreshSnapshot(undefined, 'schedule', now), true);
  assert.equal(shouldRefreshSnapshot({ fetchedAt: 'invalid' }, 'schedule', now), true);
  assert.equal(shouldRefreshSnapshot({ fetchedAt: now + 1 }, 'schedule', now), true);
});
