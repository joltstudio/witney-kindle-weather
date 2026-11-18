import { appendFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REFRESH_AFTER_MS = 25 * 60 * 1000;

export function shouldRefreshSnapshot(snapshot, eventName, now = Date.now()) {
  if (eventName !== 'schedule') return true;
  const fetchedAt = Number(snapshot?.fetchedAt);
  if (!Number.isFinite(fetchedAt) || fetchedAt <= 0 || fetchedAt > now) return true;
  return now - fetchedAt >= REFRESH_AFTER_MS;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const eventName = process.env.GITHUB_EVENT_NAME ?? 'workflow_dispatch';
  let snapshot;
  try {
    snapshot = JSON.parse(await readFile(resolve('outputs/weather-snapshot.json'), 'utf8'));
  } catch {
    // Missing or malformed cache must trigger a real request.
  }

  const due = shouldRefreshSnapshot(snapshot, eventName);
  console.log(`Forecast refresh ${due ? 'due' : 'not due'} for ${eventName}.`);
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `due=${due}\n`);
  }
}
