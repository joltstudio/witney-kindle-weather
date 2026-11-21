# Weather publishing schedule

The Pages workflow and optional Cloudflare timer are scheduled hourly at minute
57 UTC. Scheduled events publish once the previous snapshot is at least 55
minutes old. This remains valid if GitHub or Cloudflare starts a runner late;
the workflow does not check the runner's current minute. The Kindle checks at
:05 local time from 05:05 through 23:05. Manual runs and code pushes publish
immediately.

The Cloudflare Worker is retained as a secondary trigger. Its Cron Events page
showed no events in the past week on 2026-11-20, but prior Observability notes
record one successful test dispatch at 11:50 UTC; recurring hourly reliability
is not verified. The production Cron Trigger is configured at `57 * * * *`
(verified in Cloudflare Settings on 2026-11-21). The deployed Worker dispatches
on each configured tick. Local source does not impose a second exact-minute
check, so delayed Cron events still reach Pages. If both timers run, the Pages
workflow's age guard avoids duplicate forecast requests.

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
4. Under Settings → Triggers, confirm the Cron Trigger `57 * * * *` (hourly at
   minute 57 UTC). Allow up to
   15 minutes for the schedule to propagate.
5. Check Cloudflare's Cron Events, Worker logs and GitHub Actions. The Actions
   entry should say **Manually run** and complete successfully. Confirm the
   public snapshot's `fetchedAt` advances at a due London time. Do not remove
   GitHub's native schedule; it is the active trigger.

The workflow marks Worker dispatches as `trigger=timer`; timer-triggered runs
publish if the snapshot is at least 55 minutes old, even when setup takes the
runner past :57. A missing or invalid cached forecast still causes a live fetch
for recovery.

If the GitHub workflow returns 403, verify that the token is unexpired, is
restricted to this repository, and has Actions write permission. If Worker
invocations are absent, check that the Cron Trigger was saved and has
propagated. Do not paste the token into logs when diagnosing either case.

## References

- [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/) — UTC scheduling, supported cron syntax, and propagation delay.
- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) — Free plan allowance.
- [GitHub workflow dispatch API](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event) — requires Actions repository permission **write** for a fine-grained token.
