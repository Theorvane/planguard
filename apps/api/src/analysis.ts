import {
  type RequestClient,
  buildCheckRunSummary,
  completeCheckRun,
} from "@planguard/github-client";
import { analyzePolicies } from "@planguard/policy-engine";
import { calculateRisk, type RiskConfig, type RiskResult } from "@planguard/risk-engine";
import type { Finding } from "@planguard/schemas";
import { type TerraformPlanJson, parseTerraformPlan } from "@planguard/terraform-parser";

export interface AnalysisRequest {
  readonly owner: string;
  readonly repo: string;
  readonly checkRunId: number;
  readonly plan: TerraformPlanJson;
  /** Normalized findings from optional external scanners such as Checkov. */
  readonly securityFindings?: ReadonlyArray<Finding>;
  readonly availabilityFindings?: ReadonlyArray<Finding>;
  readonly estimatedMonthlyDeltaUsd?: number;
  readonly riskConfig?: RiskConfig;
}


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
  const policyFindings = analyzePolicies(resourceChanges);
  const securityFindings = [
    ...policyFindings.filter((finding) => finding.category === "security"),
    ...(request.securityFindings ?? []),
  ];
  const availabilityFindings = [
    ...policyFindings.filter((finding) => finding.category === "availability"),
    ...(request.availabilityFindings ?? []),
  ];

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

  return sections.join("\n\n");
}
