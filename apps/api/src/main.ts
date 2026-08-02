import { getInstallationToken } from "@planguard/github-client";
import { loadConfig } from "./config.js";
import { createInMemoryDeliveryLog } from "./delivery-log.js";
import { createApiServer, createBootstrapServer } from "./server.js";

const config = loadConfig();

const server = config.mode === "bootstrap"
  ? createBootstrapServer()
  : createApiServer({
      webhookSecret: config.webhookSecret,
      planUploadToken: config.planUploadToken,
      deliveryLog: createInMemoryDeliveryLog(),
      clientForInstallation: async (installationId) => {
        const token = await getInstallationToken(
          { appId: config.appId, privateKey: config.privateKey },
          installationId,
        );

        return {
          request: async (route, options = {}) => {
            const [method, path] = route.split(" ");
            const url = new URL(`https://api.github.com${interpolate(path ?? "", options)}`);
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

function interpolate(path: string, options: Record<string, unknown>): string {
  return path.replace(/\{(\w+)\}/g, (_match, key: string) => encodeURIComponent(String(options[key] ?? "")));
}

function stripPathParams(path: string, options: Record<string, unknown>): Record<string, unknown> {
  const pathKeys = new Set([...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
  return Object.fromEntries(Object.entries(options).filter(([key]) => !pathKeys.has(key)));
}

server.listen(config.port, () => {
  console.log(`PlanGuard API (${config.mode}) listening on port ${config.port}`);
});
