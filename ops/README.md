# Reliable scheduled publishing

GitHub Actions supports cron, but GitHub says scheduled runs can be delayed or
dropped during load. The weather workflow is already valid and its push/manual
paths work; the Actions history confirms the schedule itself is intermittently
not delivered. This small Cloudflare Worker can provide an independent timer
and dispatch the existing GitHub workflow. It does not fetch or store weather
data itself.

## Set up the fallback timer

1. Create a fine-grained GitHub personal access token limited to the
   `joltstudio/witney-kindle-weather` repository, with **Actions: Read and write**.
2. In Cloudflare Workers & Pages, create a Worker named
   `witney-weather-trigger` and paste `cloudflare-weather-trigger.js` into its
   editor. Deploy it.
3. In that Worker, add `GITHUB_TOKEN` as a **secret** (not a plain-text
   variable), using the token from step 1.
4. Add Cron Trigger `*/5 * * * *` under the Worker’s Settings → Triggers.
   Cron Triggers use UTC. Allow a few minutes for the schedule change to
   propagate, then check the Worker’s Cron Events and the GitHub Actions page.
5. Once the Worker has produced at least two successful `Manually run`
   (`workflow_dispatch`) runs, remove the `schedule:` block from
   `.github/workflows/pages.yml` and push that change. This avoids duplicate
   builds while leaving push and manual runs available.

Keep the token only in Cloudflare’s Worker secret store. Never paste it into
this repository, source files, screenshots, or logs. If dispatches stop, check
the Worker’s Cron Events first, then GitHub Actions for the resulting
`Manually run` entries.

Cloudflare’s current Workers Free plan includes 100,000 requests/day; this
timer makes 288 small scheduled invocations/day. The free plan is sufficient
for this workload. GitHub remains responsible for fetching weather, rendering
the PNG and deploying Pages.

References:

- GitHub schedule behavior and `workflow_dispatch`:
  https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule
- GitHub workflow dispatch REST API:
  https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event
- Cloudflare Cron Triggers:
  https://developers.cloudflare.com/workers/configuration/cron-triggers/
- Cloudflare Workers pricing:
  https://developers.cloudflare.com/workers/platform/pricing/
