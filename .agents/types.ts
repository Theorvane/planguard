export interface ResourceChange {
  readonly resource: string;
  readonly action: "create" | "update" | "delete" | "replace" | "read" | "no-op";
  readonly changedFields: ReadonlyArray<{
    readonly field: string;
    readonly before: unknown;
    readonly after: unknown;
  }>;
  readonly replacementRequired: boolean;
}

export interface Finding {
  readonly category: "security" | "availability" | "cost";
  readonly severity: "low" | "moderate" | "high" | "critical";
  readonly title: string;
  readonly evidence: string;
  readonly source: string;
  readonly recommendation: string;
}

export interface HistoricalRiskMatch {
  readonly pullRequest: string;
  readonly summary: string;
}

export interface ReviewContext {
  readonly resourceChanges: ReadonlyArray<ResourceChange>;
  readonly securityFindings: ReadonlyArray<Finding>;
  readonly availabilityFindings: ReadonlyArray<Finding>;
  readonly costFindings: ReadonlyArray<Finding>;
  readonly historicalRiskMatches: ReadonlyArray<HistoricalRiskMatch>;
}
