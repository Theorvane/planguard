import type { CheckConclusion, FindingSeverity, RiskLevel } from "@planguard/schemas";

/**
 * Weights from docs/PRODUCT_PLAN.md #6.6. They must sum to 1 — `calculateRisk`
 * asserts this so a bad repo override fails loudly instead of silently
 * producing scores that can never reach 100.
 */
export interface RiskWeights {
  readonly security: number;
  readonly availability: number;
  readonly destructiveness: number;
  readonly blastRadius: number;
  readonly costImpact: number;
}

export const DEFAULT_WEIGHTS: RiskWeights = {
  security: 0.3,
  availability: 0.3,
  destructiveness: 0.2,
  blastRadius: 0.15,
  costImpact: 0.05,
};

/**
 * Lower bound of each grade, per #6.6. Repo-configurable ("저장소별로 임계값을
 * 조정할 수 있게 한다") — a team that ships to dev constantly can raise these.
 */
export interface RiskThresholds {
  readonly moderate: number;
  readonly high: number;
  readonly critical: number;
}

export const DEFAULT_THRESHOLDS: RiskThresholds = {
  moderate: 20,
  high: 40,
  critical: 70,
};

/** Grade -> default Check conclusion, per the #6.6 table. */
export const DEFAULT_CONCLUSIONS: Readonly<Record<RiskLevel, CheckConclusion>> = {
  Low: "success",
  Moderate: "success",
  High: "failure",
  Critical: "failure",
};

/**
 * A finding this severe forces at least this grade, whatever the weighted score says.
 *
 * Without this the weighted sum alone cannot express #6.6's intent: security and
 * availability carry 30% each, so maxing either axis yields only 30 points — below
 * the High threshold of 40. A single critical finding could never block a PR, which
 * contradicts 시나리오 C ("RDS Multi-AZ 비활성화 → Check 실패"). The weighted score
 * still answers "how risky overall"; these floors answer "is any one thing bad enough
 * on its own". A floor only ever raises a grade, never lowers it.
 *
 * Environment-specific behaviour (#7: the same change is Moderate in dev, Critical in
 * production) comes from policy-engine assigning the finding a different severity —
 * not from disabling these floors.
 */
export type SeverityFloors = Readonly<Record<FindingSeverity, RiskLevel | null>>;

export const DEFAULT_SEVERITY_FLOORS: SeverityFloors = {
  low: null,
  moderate: null,
  high: "High",
  critical: "Critical",
};

export interface RiskConfig {
  readonly weights: RiskWeights;
  readonly thresholds: RiskThresholds;
  readonly conclusions: Readonly<Record<RiskLevel, CheckConclusion>>;
  readonly severityFloors: SeverityFloors;
  /**
   * Absolute monthly USD delta treated as maximum cost risk. A $500 swing scores
   * 100 on the cost axis by default; below that it scales linearly.
   */
  readonly costSaturationUsd: number;
}

export const DEFAULT_CONFIG: RiskConfig = {
  weights: DEFAULT_WEIGHTS,
  thresholds: DEFAULT_THRESHOLDS,
  conclusions: DEFAULT_CONCLUSIONS,
  severityFloors: DEFAULT_SEVERITY_FLOORS,
  costSaturationUsd: 500,
};

/** Ascending, so a floor and a weighted grade can be compared. */
export const RISK_LEVEL_ORDER: ReadonlyArray<RiskLevel> = [
  "Low",
  "Moderate",
  "High",
  "Critical",
];
