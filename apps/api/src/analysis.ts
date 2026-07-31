import {
  type RequestClient,
  buildCheckRunSummary,
  completeCheckRun,
} from "@planguard/github-client";
import { calculateRisk, type RiskConfig, type RiskResult } from "@planguard/risk-engine";
import type { Finding } from "@planguard/schemas";
import { type TerraformPlanJson, parseTerraformPlan } from "@planguard/terraform-parser";

export interface AnalysisRequest {
  readonly owner: string;
  readonly repo: string;
  readonly checkRunId: number;
  readonly plan: TerraformPlanJson;
  /**
   * Findings from policy-engine. That package does not exist yet, so callers pass
   * nothing and every analysis currently scores on structure alone — see
   * `NO_POLICY_ENGINE_NOTICE`.
   */
  readonly securityFindings?: ReadonlyArray<Finding>;
  readonly availabilityFindings?: ReadonlyArray<Finding>;
  readonly estimatedMonthlyDeltaUsd?: number;
  readonly riskConfig?: RiskConfig;
}

/**
 * Until policy-engine lands there are no security or availability findings, and those
 * two axes carry 60% of the score. Every result is therefore an undercount, and the
 * Check says so rather than presenting a falsely clean verdict.
 */
export const NO_POLICY_ENGINE_NOTICE =
  "Security and availability policy checks are not enabled yet, so this score reflects " +
  "structural risk only (resource actions, blast radius, cost). Do not read a passing " +
  "result as a security review.";

export interface AnalysisResult {
  readonly risk: RiskResult;
  readonly summary: string;
}

/**
 * Runs one review end to end: plan JSON in, completed Check Run out.
 *
 * Every number here comes from the deterministic packages — this function only
 * sequences them and formats the result (AGENTS.md).
 */
export async function runAnalysis(
  client: RequestClient,
  request: AnalysisRequest,
): Promise<AnalysisResult> {
  const resourceChanges = parseTerraformPlan(request.plan);
  const securityFindings = request.securityFindings ?? [];
  const availabilityFindings = request.availabilityFindings ?? [];

  const risk = calculateRisk(
    {
      resourceChanges,
      securityFindings,
      availabilityFindings,
      ...(request.estimatedMonthlyDeltaUsd === undefined
        ? {}
        : { estimatedMonthlyDeltaUsd: request.estimatedMonthlyDeltaUsd }),
    },
    request.riskConfig,
  );

  const summary = buildSummary(risk, {
    resourceChanges,
    securityFindings,
    availabilityFindings,
    policyEngineEnabled: request.securityFindings !== undefined,
  });

  await completeCheckRun(client, {
    owner: request.owner,
    repo: request.repo,
    checkRunId: request.checkRunId,
    conclusion: risk.conclusion,
    title: `Overall risk: ${risk.level}`,
    summary,
  });

  return { risk, summary };
}

function buildSummary(
  risk: RiskResult,
  context: {
    resourceChanges: ReturnType<typeof parseTerraformPlan>;
    securityFindings: ReadonlyArray<Finding>;
    availabilityFindings: ReadonlyArray<Finding>;
    policyEngineEnabled: boolean;
  },
): string {
  const sections = [
    buildCheckRunSummary({
      riskLevel: risk.level,
      decision: risk.conclusion === "failure" ? "Changes requested" : "Approved",
      resourceChanges: context.resourceChanges,
      securityFindings: context.securityFindings,
      availabilityFindings: context.availabilityFindings,
    }),
  ];

  if (risk.escalation) {
    sections.push(
      `Escalated from ${risk.escalation.from} to ${risk.escalation.to} — ${risk.escalation.reason}`,
    );
  }

  sections.push(
    [
      `Risk score: ${risk.score}/100`,
      `- Security: ${risk.breakdown.security.score} — ${risk.breakdown.security.reason}`,
      `- Availability: ${risk.breakdown.availability.score} — ${risk.breakdown.availability.reason}`,
      `- Destructiveness: ${risk.breakdown.destructiveness.score} — ${risk.breakdown.destructiveness.reason}`,
      `- Blast radius: ${risk.breakdown.blastRadius.score} — ${risk.breakdown.blastRadius.reason}`,
      `- Cost impact: ${risk.breakdown.costImpact.score} — ${risk.breakdown.costImpact.reason}`,
    ].join("\n"),
  );

  if (!context.policyEngineEnabled) {
    sections.push(NO_POLICY_ENGINE_NOTICE);
  }

  return sections.join("\n\n");
}
