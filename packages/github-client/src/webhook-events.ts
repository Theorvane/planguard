import { CHECK_NAME } from "./check-run.js";

/** Only the fields PlanGuard reads — not the full GitHub webhook schema. */

export interface RepositoryRef {
  readonly name: string;
  readonly owner: { readonly login: string };
}

export interface PullRequestWebhookPayload {
  readonly action: "opened" | "synchronize" | "reopened" | "closed" | string;
  readonly number: number;
  readonly pull_request: {
    readonly head: { readonly sha: string; readonly ref: string };
    readonly base: { readonly ref: string };
  };
  readonly repository: RepositoryRef;
  readonly installation?: { readonly id: number };
}

export interface CheckRunWebhookPayload {
  readonly action: "created" | "rerequested" | "completed" | "requested_action" | string;
  readonly check_run: {
    readonly id: number;
    readonly name: string;
    readonly head_sha: string;
  };
  readonly repository: RepositoryRef;
  readonly installation?: { readonly id: number };
}

const TRIGGERING_PULL_REQUEST_ACTIONS = new Set(["opened", "synchronize", "reopened"]);

/**
 * docs/PRODUCT_PLAN.md #10: "`pull_request` 이벤트로 PR 생성·수정·재오픈을 감지"
 */
export function shouldAnalyzePullRequest(payload: PullRequestWebhookPayload): boolean {
  return TRIGGERING_PULL_REQUEST_ACTIONS.has(payload.action);
}

/**
 * docs/PRODUCT_PLAN.md #10: "`check_run`의 `rerequested`... 통해 재분석을 수행"
 * Only re-runs for PlanGuard's own Check Run, never someone else's.
 */
export function shouldReanalyze(payload: CheckRunWebhookPayload): boolean {
  return payload.action === "rerequested" && payload.check_run.name === CHECK_NAME;
}
