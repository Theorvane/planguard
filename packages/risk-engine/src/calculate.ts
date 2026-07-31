import type { CheckConclusion, Finding, ResourceChange, RiskLevel } from "@planguard/schemas";
import {
  DEFAULT_CONFIG,
  RISK_LEVEL_ORDER,
  type RiskConfig,
  type RiskThresholds,
} from "./config.js";
import {
  type SubScore,
  scoreBlastRadius,
  scoreCostImpact,
  scoreDestructiveness,
  scoreFindings,
} from "./sub-scores.js";

export interface RiskInput {
  readonly resourceChanges: ReadonlyArray<ResourceChange>;
  readonly securityFindings: ReadonlyArray<Finding>;
  readonly availabilityFindings: ReadonlyArray<Finding>;
  /** Omit when the estimator could not price the change — never pass a guess. */
  readonly estimatedMonthlyDeltaUsd?: number;
}

export interface RiskBreakdown {
  readonly security: SubScore;
  readonly availability: SubScore;
  readonly destructiveness: SubScore;
  readonly blastRadius: SubScore;
  readonly costImpact: SubScore;
}

export interface RiskResult {
  readonly score: number;
  readonly level: RiskLevel;
  readonly conclusion: CheckConclusion;
  readonly breakdown: RiskBreakdown;
  /**
   * Set when a finding's severity raised the grade above what the weighted score
   * alone would give. Surfacing this keeps the verdict explainable — a user seeing
   * "score 37 but Critical" deserves to know which finding forced it.
   */
  readonly escalation?: {
    readonly from: RiskLevel;
    readonly to: RiskLevel;
    readonly reason: string;
  };
}

const WEIGHT_SUM_TOLERANCE = 1e-9;

/**
 * The weighted rule engine from docs/PRODUCT_PLAN.md #6.6.
 *
 * This is the deterministic heart of PlanGuard: no LLM participates in producing
 * this number, and nothing downstream may override it (see AGENTS.md). Given the
 * same input and config it always returns the same result.
 */
export function calculateRisk(
  input: RiskInput,
  config: RiskConfig = DEFAULT_CONFIG,
): RiskResult {
  assertValidConfig(config);

  const breakdown: RiskBreakdown = {
    security: scoreFindings(input.securityFindings, "security"),
    availability: scoreFindings(input.availabilityFindings, "availability"),
    destructiveness: scoreDestructiveness(input.resourceChanges),
    blastRadius: scoreBlastRadius(input.resourceChanges),
    costImpact: scoreCostImpact(input.estimatedMonthlyDeltaUsd, config.costSaturationUsd),
  };

  const { weights } = config;
  const weighted =
    breakdown.security.score * weights.security +
    breakdown.availability.score * weights.availability +
    breakdown.destructiveness.score * weights.destructiveness +
    breakdown.blastRadius.score * weights.blastRadius +
    breakdown.costImpact.score * weights.costImpact;

  const score = Math.round(weighted);
  const weightedLevel = toRiskLevel(score, config.thresholds);
  const floor = highestSeverityFloor(
    [...input.securityFindings, ...input.availabilityFindings],
    config,
  );

  const level =
    floor && rank(floor.level) > rank(weightedLevel) ? floor.level : weightedLevel;
  const result: RiskResult = {
    score,
    level,
    conclusion: config.conclusions[level],
    breakdown,
  };

  if (level !== weightedLevel && floor) {
    return {
      ...result,
      escalation: { from: weightedLevel, to: level, reason: floor.reason },
    };
  }
  return result;
}

function rank(level: RiskLevel): number {
  return RISK_LEVEL_ORDER.indexOf(level);
}

/** The strictest floor any single finding imposes, plus which finding imposed it. */
function highestSeverityFloor(
  findings: ReadonlyArray<Finding>,
  config: RiskConfig,
): { readonly level: RiskLevel; readonly reason: string } | undefined {
  let strictest: { level: RiskLevel; reason: string } | undefined;

  for (const finding of findings) {
    const floor = config.severityFloors[finding.severity];
    if (!floor) continue;
    if (strictest && rank(floor) <= rank(strictest.level)) continue;

    strictest = {
      level: floor,
      reason: `${finding.severity} ${finding.category} finding: ${finding.title}`,
    };
  }

  return strictest;
}

export function toRiskLevel(score: number, thresholds: RiskThresholds): RiskLevel {
  if (score >= thresholds.critical) return "Critical";
  if (score >= thresholds.high) return "High";
  if (score >= thresholds.moderate) return "Moderate";
  return "Low";
}

function assertValidConfig(config: RiskConfig): void {
  const { weights, thresholds } = config;
  const sum =
    weights.security +
    weights.availability +
    weights.destructiveness +
    weights.blastRadius +
    weights.costImpact;

  if (Math.abs(sum - 1) > WEIGHT_SUM_TOLERANCE) {
    throw new RangeError(
      `Risk weights must sum to 1, got ${sum}. Check the repository's risk configuration.`,
    );
  }

  if (!(thresholds.moderate < thresholds.high && thresholds.high < thresholds.critical)) {
    throw new RangeError(
      "Risk thresholds must increase: moderate < high < critical. " +
        `Got ${thresholds.moderate}, ${thresholds.high}, ${thresholds.critical}.`,
    );
  }

  if (config.costSaturationUsd <= 0) {
    throw new RangeError("costSaturationUsd must be greater than 0.");
  }
}
