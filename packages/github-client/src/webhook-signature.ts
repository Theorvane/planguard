import { verify } from "@octokit/webhooks-methods";

/**
 * Verifies a GitHub webhook's `X-Hub-Signature-256` header against the raw request body.
 * Always verify before parsing the payload — this is the only thing standing between
 * PlanGuard and a forged webhook triggering an analysis or a Check Run update.
 */
export async function verifyWebhookSignature(
  secret: string,
  rawBody: string,
  signatureHeader: string | undefined | null,
): Promise<boolean> {
  if (!signatureHeader) return false;
  return verify(secret, rawBody, signatureHeader);
}
