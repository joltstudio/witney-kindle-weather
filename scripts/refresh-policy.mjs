import { appendFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Keep GitHub and Cloudflare hourly triggers deduplicated. Schedule runners may
// start late, so due-ness must not depend on the wall-clock minute at runtime.
export const REFRESH_AFTER_MS = 55 * 60 * 1000;

export function shouldRefreshSnapshot(
  snapshot,
  eventName,
  now = Date.now(),
  source = "manual",
) {
  const isTimer =
    eventName === "schedule" ||
    (eventName === "workflow_dispatch" && source === "timer");
  if (!isTimer) return true;
  const fetchedAt = Number(snapshot?.fetchedAt);
  if (!Number.isFinite(fetchedAt) || fetchedAt <= 0 || fetchedAt > now)
    return true;
  return now - fetchedAt >= REFRESH_AFTER_MS;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const eventName = process.env.GITHUB_EVENT_NAME ?? "workflow_dispatch";
  const source = process.env.REFRESH_SOURCE ?? "manual";
  let snapshot;
  try {
    snapshot = JSON.parse(
      await readFile(resolve("outputs/weather-snapshot.json"), "utf8"),
    );
  } catch {
    // Missing or malformed cache must trigger a real request.
  }

  const due = shouldRefreshSnapshot(snapshot, eventName, Date.now(), source);
  console.log(`Forecast refresh ${due ? "due" : "not due"} for ${eventName}.`);
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `due=${due}\n`);
  }
}
