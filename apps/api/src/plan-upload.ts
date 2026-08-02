import { analyzePolicies } from "@planguard/policy-engine";
import { calculateRisk } from "@planguard/risk-engine";
import type { Finding } from "@planguard/schemas";
import { type TerraformPlanJson, parseTerraformPlan } from "@planguard/terraform-parser";
import { buildAnalysisSummary } from "./analysis.js";

export interface UploadedPlanAnalysis {
  readonly risk: {
    readonly score: number;
    readonly level: "Low" | "Moderate" | "High" | "Critical";
    readonly conclusion: "success" | "failure";
  };
  readonly summary: string;
}

/**
 * Deterministically analyzes a Terraform JSON plan uploaded by the repository Action.
 * This boundary never contacts GitHub or executes external programs.
 */
export function analyzeUploadedPlan(plan: TerraformPlanJson): UploadedPlanAnalysis {
  const resourceChanges = parseTerraformPlan(plan);
  const policyFindings = analyzePolicies(resourceChanges);
  const securityFindings = policyFindings.filter((finding) => finding.category === "security");
  const availabilityFindings = policyFindings.filter((finding) => finding.category === "availability");
  const risk = calculateRisk({ resourceChanges, securityFindings, availabilityFindings });

  return {
    risk: {
      score: risk.score,
      level: risk.level,
      conclusion: risk.conclusion === "failure" ? "failure" : "success",
    },
    summary: buildAnalysisSummary(risk, { resourceChanges, securityFindings, availabilityFindings }),
  };
}
