export interface ApiConfig {
  readonly appId: string;
  readonly privateKey: string;
  readonly webhookSecret: string;
  /** Shared secret accepted by the Terraform plan upload endpoint. */
  readonly planUploadToken: string;
  readonly port: number;
}

/**
 * Reads configuration from the environment, failing loudly on anything missing.
 *
 * A missing webhook secret must never degrade into "skip verification" — that would
 * let anyone forge a webhook and drive a Check Run. Absent config is a startup error,
 * not a runtime fallback.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
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

  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new RangeError(`PORT must be a valid port number, got "${env.PORT}".`);
  }

  // Private keys are commonly stored in env with literal \n rather than real newlines.
  return {
    appId,
    privateKey: privateKey.replace(/\\n/g, "\n"),
    webhookSecret,
    planUploadToken,
    port,
  };
}
