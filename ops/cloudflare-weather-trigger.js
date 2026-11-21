const REPOSITORY = "joltstudio/witney-kindle-weather";
const WORKFLOW = "pages.yml";
const TIME_ZONE = "Europe/London";

export function isPublishWindow(scheduledTime) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(scheduledTime));
  const minute = Number(parts.find(({ type }) => type === "minute")?.value);
  return minute === 57;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== "/healthz") {
      return new Response("Not found\n", { status: 404 });
    }

    return Response.json({ service: "witney-weather-trigger", status: "ok" });
  },

  async scheduled(controller, env) {
    const scheduledAt = new Date(controller.scheduledTime).toISOString();
    console.log(`Cron started: ${scheduledAt} (${controller.cron})`);
    if (!isPublishWindow(controller.scheduledTime)) {
      console.log(`No publish due at ${scheduledAt}; checking next hour.`);
      return;
    }
    if (!env.GITHUB_TOKEN) {
      throw new Error("Missing GITHUB_TOKEN secret");
    }

    const response = await fetch(
      `https://api.github.com/repos/${REPOSITORY}/actions/workflows/${WORKFLOW}/dispatches`,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          "Content-Type": "application/json",
          "User-Agent": "Witney-Kindle-Weather-Cron/1.0",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({ ref: "main", inputs: { trigger: "timer" } }),
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (response.status !== 204) {
      const detail = (await response.text()).slice(0, 300);
      throw new Error(
        `GitHub workflow dispatch failed (${response.status}): ${detail}`,
      );
    }

    console.log(`Dispatched ${WORKFLOW} at ${scheduledAt}`);
  },
};
