# Weather publishing schedule

The Pages workflow has a native hourly GitHub schedule at minute 17 UTC. Its
refresh policy uses `Europe/London` and permits a forecast fetch only at 06, 10,
14, 18 and 22 local time. It skips a duplicate timer fetch if the latest saved
forecast is less than 3 hours 45 minutes old. Manual runs and pushes publish
immediately. The Kindle checks the published PNG five minutes after each
scheduled slot.

The Cloudflare Worker is retained as a secondary trigger. Its Cron Events page
showed no events in the past week on 2026-11-20, but prior Observability notes
record one successful test dispatch at 11:50 UTC; recurring hourly reliability
is not verified. The source dispatches only at the five `Europe/London` slots,
and the workflow's age gate avoids duplicate forecast API requests when both
clocks fire.

## Cost and limits

An hourly trigger is 24 Worker invocations per day. Cloudflare's current Free
Workers plan includes 100,000 requests per day and 10 ms CPU time per
invocation, so this workload is within the free allowance. GitHub's workflow
and Pages limits still apply. The trigger uses one GitHub API request per hour.

## Set up

The Worker needs a GitHub fine-grained personal access token. Create it yourself
and enter it only in Cloudflare's secret field; do not put it in this
repository, a chat, or a log.

1. Create a fine-grained token limited to `joltstudio/witney-kindle-weather`,
   with **Actions: Read and write**. Set an expiry and note when it must be
   rotated. GitHub requires this permission to dispatch a workflow.
2. In Cloudflare Dashboard → Workers & Pages, create a Worker named
   `witney-weather-trigger` and paste the contents of
   `ops/cloudflare-weather-trigger.js` into its editor. Deploy it.
3. In the Worker settings, add `GITHUB_TOKEN` as a **secret** and enter the
   token there.
4. Under Settings → Triggers, add the Cron Trigger `17 * * * *` (hourly at
   minute 17 UTC) only if deliberately reactivating the fallback. Allow up to
   15 minutes for the schedule to propagate.
5. Check Cloudflare's Cron Events, Worker logs and GitHub Actions. The Actions
   entry should say **Manually run** and complete successfully. Confirm the
   public snapshot's `fetchedAt` advances at a due London time. Do not remove
   GitHub's native schedule; it is the active trigger.

The workflow marks Worker dispatches as `trigger=timer`. Timer-triggered runs
are restricted to the five London slots and use a 3-hour-45-minute cache age
gate. A gated run may perform a lightweight deployment using the existing
snapshot without making another weather API request.

If the GitHub workflow returns 403, verify that the token is unexpired, is
restricted to this repository, and has Actions write permission. If Worker
invocations are absent, check that the Cron Trigger was saved and has
propagated. Do not paste the token into logs when diagnosing either case.

## References

- [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/) — UTC scheduling, supported cron syntax, and propagation delay.
- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) — Free plan allowance.
- [GitHub workflow dispatch API](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event) — requires Actions repository permission **write** for a fine-grained token.
