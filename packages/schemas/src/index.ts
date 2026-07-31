/**
 * Shared types for PlanGuard's core entities (docs/PRODUCT_PLAN.md #14).
 * Deterministic analysis packages (terraform-parser, policy-engine, risk-engine)
 * and the .agents/ explanation agent both consume these — this is the one
 * place their shapes are allowed to diverge from the product plan.
 */

export type ResourceAction =
  | "create"
  | "update"
  | "delete"
  | "replace"
  | "read"
  | "no-op";

export interface ChangedField {
  readonly field: string;
  readonly before: unknown;
  readonly after: unknown;
}

export interface ResourceChange {
  readonly resource: string;
  readonly resourceType: string;
  readonly action: ResourceAction;
  readonly changedFields: ReadonlyArray<ChangedField>;
  readonly replacementRequired: boolean;
}

export type FindingCategory = "security" | "availability" | "cost";
export type FindingSeverity = "low" | "moderate" | "high" | "critical";

export interface Finding {
  readonly category: FindingCategory;
  readonly severity: FindingSeverity;
  readonly title: string;
  readonly evidence: string;
  readonly source: string;
  readonly recommendation: string;
}

export interface HistoricalRiskMatch {
  readonly pullRequest: string;
  readonly summary: string;
}

/** docs/PRODUCT_PLAN.md #6.6 등급. */
export type RiskLevel = "Low" | "Moderate" | "High" | "Critical";

/** GitHub Check Run conclusion. Shared so risk-engine and github-client cannot drift. */
export type CheckConclusion = "success" | "failure" | "neutral" | "action_required";

export interface ReviewContext {
  readonly resourceChanges: ReadonlyArray<ResourceChange>;
  readonly securityFindings: ReadonlyArray<Finding>;
  readonly availabilityFindings: ReadonlyArray<Finding>;
  readonly costFindings: ReadonlyArray<Finding>;
  readonly historicalRiskMatches: ReadonlyArray<HistoricalRiskMatch>;
}
