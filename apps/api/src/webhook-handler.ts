import {
  type CheckRunWebhookPayload,
  type PullRequestWebhookPayload,
  type RequestClient,
  createQueuedCheckRun,
  shouldAnalyzePullRequest,
  shouldReanalyze,
  verifyWebhookSignature,
} from "@planguard/github-client";
import type { DeliveryLog } from "./delivery-log.js";

export interface WebhookRequest {
  readonly rawBody: string;
  readonly event: string | undefined;
  readonly signature: string | undefined;
  readonly deliveryId: string | undefined;
}

export interface WebhookResponse {
  readonly status: number;
  readonly body: { readonly message: string };
}

export interface WebhookDeps {
  readonly webhookSecret: string;
  readonly deliveryLog: DeliveryLog;
  /** Resolves an installation-scoped client. Injected so tests need no network. */
  readonly clientForInstallation: (installationId: number) => Promise<RequestClient>;
}

const ok = (message: string, status = 200): WebhookResponse => ({ status, body: { message } });

/**
 * Handles one GitHub webhook delivery. Pure with respect to I/O except for the
 * injected client, so the whole routing surface is testable without a server.
 *
 * Order matters and is deliberate: the signature is verified against the raw body
 * *before* anything is parsed. Parsing first would mean acting on attacker-controlled
 * JSON, and a forged delivery could drive a Check Run on any repo the App can reach.
 */
export async function handleWebhook(
  request: WebhookRequest,
  deps: WebhookDeps,
): Promise<WebhookResponse> {
  const verified = await verifyWebhookSignature(
    deps.webhookSecret,
    request.rawBody,
    request.signature,
  );
  if (!verified) {
    return { status: 401, body: { message: "Invalid webhook signature." } };
  }

  if (!request.deliveryId) {
    return { status: 400, body: { message: "Missing X-GitHub-Delivery header." } };
  }
  if (!deps.deliveryLog.claim(request.deliveryId)) {
    return ok("Duplicate delivery ignored.");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(request.rawBody);
  } catch {
    return { status: 400, body: { message: "Body is not valid JSON." } };
  }

  switch (request.event) {
    case "pull_request":
      return handlePullRequest(payload as PullRequestWebhookPayload, deps);
    case "check_run":
      return handleCheckRun(payload as CheckRunWebhookPayload, deps);
    case "installation":
    case "installation_repositories":
      // Nothing is persisted yet, so there is no installation state to update.
      return ok("Installation event acknowledged.");
    default:
      return ok(`Event "${request.event ?? "unknown"}" is not handled.`);
  }
}

async function handlePullRequest(
  payload: PullRequestWebhookPayload,
  deps: WebhookDeps,
): Promise<WebhookResponse> {
  if (!shouldAnalyzePullRequest(payload)) {
    return ok(`Pull request action "${payload.action}" does not trigger analysis.`);
  }

  const installationId = payload.installation?.id;
  if (installationId === undefined) {
    return { status: 400, body: { message: "Payload has no installation id." } };
  }

  const client = await deps.clientForInstallation(installationId);
  await createQueuedCheckRun(client, {
    owner: payload.repository.owner.login,
    repo: payload.repository.name,
    headSha: payload.pull_request.head.sha,
  });

  return ok("Analysis queued.", 202);
}

async function handleCheckRun(
  payload: CheckRunWebhookPayload,
  deps: WebhookDeps,
): Promise<WebhookResponse> {
  if (!shouldReanalyze(payload)) {
    return ok(`Check run action "${payload.action}" does not trigger re-analysis.`);
  }

  const installationId = payload.installation?.id;
  if (installationId === undefined) {
    return { status: 400, body: { message: "Payload has no installation id." } };
  }

  const client = await deps.clientForInstallation(installationId);
  await createQueuedCheckRun(client, {
    owner: payload.repository.owner.login,
    repo: payload.repository.name,
    headSha: payload.check_run.head_sha,
  });

  return ok("Re-analysis queued.", 202);
}
