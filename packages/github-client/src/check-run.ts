import type {
  CheckConclusion,
  Finding,
  ResourceAction,
  ResourceChange,
  RiskLevel,
} from "@planguard/schemas";

export const CHECK_NAME = "PlanGuard / Infrastructure Review";

/** Duck-typed Octokit — accepts a real Octokit instance or a test double, nothing more. */
export interface RequestClient {
  readonly request: (
    route: string,
    options?: Record<string, unknown>,
  ) => Promise<{ readonly data: unknown }>;
}

export interface CreateQueuedCheckRunInput {
  readonly owner: string;
  readonly repo: string;
  readonly headSha: string;
}

export async function createQueuedCheckRun(
  client: RequestClient,
  input: CreateQueuedCheckRunInput,
): Promise<unknown> {
  const response = await client.request("POST /repos/{owner}/{repo}/check-runs", {
    owner: input.owner,
    repo: input.repo,
    name: CHECK_NAME,
    head_sha: input.headSha,
    status: "queued",
  });
  return response.data;
}

export interface CompleteCheckRunInput {
  readonly owner: string;
  readonly repo: string;
  readonly checkRunId: number;
  readonly conclusion: CheckConclusion;
  readonly title: string;
  readonly summary: string;
}

export async function completeCheckRun(
  client: RequestClient,
  input: CompleteCheckRunInput,
): Promise<unknown> {
  const response = await client.request(
    "PATCH /repos/{owner}/{repo}/check-runs/{check_run_id}",
    {
      owner: input.owner,
      repo: input.repo,
      check_run_id: input.checkRunId,
      status: "completed",
      conclusion: input.conclusion,
      output: { title: input.title, summary: input.summary },
    },
  );
  return response.data;
}

const ACTION_LABELS: ReadonlyArray<readonly [ResourceAction, string]> = [
  ["create", "created"],
  ["update", "updated"],
  ["delete", "deleted"],
  ["replace", "replaced"],
];

export interface CheckRunSummaryInput {
  readonly riskLevel: RiskLevel;
  readonly decision: string;
  readonly resourceChanges: ReadonlyArray<ResourceChange>;
  readonly securityFindings: ReadonlyArray<Finding>;
  readonly availabilityFindings: ReadonlyArray<Finding>;
  readonly estimatedMonthlyChangeText?: string;
}

/**
 * Builds the Check Run summary body per docs/PRODUCT_PLAN.md #6.7. Every number here is a
 * straight count of what packages/terraform-parser and packages/risk-engine already computed
 * — this function only formats, per AGENTS.md's "AI/deterministic code decides, not this file" rule
 * (there's no AI involved here at all, but the same discipline applies: no invented numbers).
 */
export function buildCheckRunSummary(input: CheckRunSummaryInput): string {
  const counts = new Map<ResourceAction, number>();
  for (const change of input.resourceChanges) {
    counts.set(change.action, (counts.get(change.action) ?? 0) + 1);
  }

  const breakdown = ACTION_LABELS.filter(([action]) => (counts.get(action) ?? 0) > 0)
    .map(([action, label]) => `${counts.get(action)} ${label}`)
    .join(" · ");

  const lines = [
    `Overall risk: ${input.riskLevel}`,
    `${input.resourceChanges.length} resources changed`,
  ];
  if (breakdown) lines.push(breakdown);
  lines.push(`Security findings: ${input.securityFindings.length}`);
  lines.push(`Availability findings: ${input.availabilityFindings.length}`);
  if (input.estimatedMonthlyChangeText) {
    lines.push(`Estimated monthly change: ${input.estimatedMonthlyChangeText}`);
  }
  lines.push("", "Decision", input.decision);

  return lines.join("\n");
}
