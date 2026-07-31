import { createAppAuth } from "@octokit/auth-app";
import type { RequestInterface } from "@octokit/types";

export interface AppCredentials {
  readonly appId: number | string;
  readonly privateKey: string;
}

/**
 * Exchanges the GitHub App's private key for a short-lived installation access token
 * (docs/PRODUCT_PLAN.md #15 — "GitHub Installation Token 단기 사용"). Never cache this
 * token beyond the request that needed it; call this again for the next one.
 *
 * `request` is injectable so callers (and tests) can run this without a real network
 * call — @octokit/auth-app calls it once to exchange the signed JWT for the token.
 */
export async function getInstallationToken(
  credentials: AppCredentials,
  installationId: number,
  request?: RequestInterface,
): Promise<string> {
  const auth = createAppAuth({
    appId: credentials.appId,
    privateKey: credentials.privateKey,
    ...(request ? { request } : {}),
  });

  const authentication = await auth({ type: "installation", installationId });
  return authentication.token;
}
