import { appendFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TIME_ZONE = "Europe/London";
const PUBLISH_HOURS = new Set([6, 10, 14, 18, 22]);
// Leave 15 minutes of scheduling tolerance while preventing duplicate timer fetches.
export const REFRESH_AFTER_MS = (4 * 60 - 15) * 60 * 1000;

export function isPublishWindow(now = Date.now()) {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: TIME_ZONE,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date(now)),
  );
  return PUBLISH_HOURS.has(hour);
}

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
  if (!isPublishWindow(now)) return false;
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
