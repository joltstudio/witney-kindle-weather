# Independent hourly trigger

GitHub's scheduled workflow events have stopped appearing in this repository's
Actions history. This small Cloudflare Worker provides a separate clock and
asks GitHub to run the existing Pages workflow through its supported
`workflow_dispatch` event. GitHub still fetches weather, renders the 600×800 PNG,
and deploys Pages; the Worker stores no forecast data.

## Cost and limits

One hourly trigger is 24 Worker invocations per day. Cloudflare's current Free
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
   minute 17 UTC). Allow up to 15 minutes for the schedule to propagate.
5. Check Cloudflare's Worker invocation logs and GitHub Actions. The Actions
   entry should say **Manually run** and complete successfully. Confirm the
   public snapshot's `fetchedAt` advances on the next due hourly run.
6. Keep GitHub's own hourly schedule enabled until two hourly Worker
   dispatches have succeeded. Then remove the `schedule:` block from
   `.github/workflows/pages.yml` and push that small change to avoid duplicate
   timers. Push and manual runs remain available.

The workflow marks Worker dispatches as `trigger=timer` and applies the same
45-minute age gate used for GitHub schedule events. This avoids fetching the
weather twice if GitHub's own timer resumes during the verification period.
Manual runs and code pushes still fetch immediately. The workflow may still
perform a lightweight deployment when a timer is gated; it will reuse the
cached snapshot without making another weather API request.

If the GitHub workflow returns 403, verify that the token is unexpired, is
restricted to this repository, and has Actions write permission. If Worker
invocations are absent, check that the Cron Trigger was saved and has
propagated. Do not paste the token into logs when diagnosing either case.

## References

- [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/) — UTC scheduling, supported cron syntax, and propagation delay.
- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) — Free plan allowance.
- [GitHub workflow dispatch API](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event) — requires Actions repository permission **write** for a fine-grained token.
