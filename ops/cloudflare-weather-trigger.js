const REPOSITORY = "joltstudio/witney-kindle-weather";
const WORKFLOW = "pages.yml";

export default {
  async scheduled(controller, env) {
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
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({ ref: "main" }),
      },
    );

    if (response.status !== 204) {
      // Do not include request headers or the token in logs.
      const detail = (await response.text()).slice(0, 300);
      throw new Error(
        `GitHub workflow dispatch failed (${response.status}): ${detail}`,
      );
    }

    console.log(`Dispatched ${WORKFLOW} at ${new Date(controller.scheduledTime).toISOString()}`);
  },
};
