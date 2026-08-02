import { getInstallationToken } from "@planguard/github-client";
import { loadConfig } from "./config.js";
import { createInMemoryDeliveryLog } from "./delivery-log.js";
import { createApiServer } from "./server.js";

const config = loadConfig();
const deliveryLog = createInMemoryDeliveryLog();

const server = createApiServer({
  webhookSecret: config.webhookSecret,
  planUploadToken: config.planUploadToken,
  deliveryLog,
  clientForInstallation: async (installationId) => {
    const token = await getInstallationToken(
      { appId: config.appId, privateKey: config.privateKey },
      installationId,
    );

    return {
      request: async (route, options = {}) => {
        const [method, path] = route.split(" ");
        const url = new URL(
          `https://api.github.com${interpolate(path ?? "", options)}`,
        );

        const response = await fetch(url, {
          method: method ?? "GET",
          headers: {
            authorization: `Bearer ${token}`,
            accept: "application/vnd.github+json",
            "x-github-api-version": "2022-11-28",
            "content-type": "application/json",
          },
          body: method === "GET" ? undefined : JSON.stringify(stripPathParams(path ?? "", options)),
        });

        if (!response.ok) {
          throw new Error(`GitHub API ${route} failed: ${response.status} ${await response.text()}`);
        }
        return { data: await response.json() };
      },
    };
  },
});

/** Replaces `{owner}`-style placeholders in an Octokit-style route with option values. */
function interpolate(path: string, options: Record<string, unknown>): string {
  return path.replace(/\{(\w+)\}/g, (_match, key: string) =>
    encodeURIComponent(String(options[key] ?? "")),
  );
}

/** Path placeholders belong in the URL, not repeated in the JSON body. */
function stripPathParams(path: string, options: Record<string, unknown>): Record<string, unknown> {
  const pathKeys = new Set([...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
  return Object.fromEntries(Object.entries(options).filter(([key]) => !pathKeys.has(key)));
}

server.listen(config.port, () => {
  console.log(`PlanGuard API listening on port ${config.port}`);
});
