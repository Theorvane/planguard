export interface BootstrapConfig {
  readonly mode: "bootstrap";
  readonly port: number;
}

export interface ActiveApiConfig {
  readonly mode: "active";
  readonly appId: string;
  readonly privateKey: string;
  readonly webhookSecret: string;
  /** Shared secret accepted by the Terraform plan upload endpoint. */
  readonly planUploadToken: string;
  readonly port: number;
}

export type ApiConfig = BootstrapConfig | ActiveApiConfig;

/**
 * Reads configuration from the environment.
 *
 * Bootstrap mode is intentionally health-only: it exists solely to obtain a first public HTTPS
 * URL before a GitHub App has generated its credentials. It never accepts webhooks or plan uploads.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new RangeError(`PORT must be a valid port number, got "${env.PORT}".`);
  }

  if (env.PLANGUARD_BOOTSTRAP_MODE === "true") return { mode: "bootstrap", port };

  const missing: string[] = [];
  const read = (name: string): string => {
    const value = env[name];
    if (!value || value.trim() === "") {
      missing.push(name);
      return "";
    }
    return value;
  };

  const appId = read("PLANGUARD_GITHUB_APP_ID");
  const privateKey = read("PLANGUARD_GITHUB_PRIVATE_KEY");
  const webhookSecret = read("PLANGUARD_GITHUB_WEBHOOK_SECRET");
  const planUploadToken = read("PLANGUARD_API_TOKEN");

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}. ` +
        "See docs/installation/README.md for how to obtain them.",
    );
  }

  return {
    mode: "active",
    appId,
    privateKey: privateKey.replace(/\\n/g, "\n"),
    webhookSecret,
    planUploadToken,
    port,
  };
}
