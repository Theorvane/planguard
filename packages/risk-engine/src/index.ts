export { calculateRisk, toRiskLevel } from "./calculate.js";
export type { RiskBreakdown, RiskInput, RiskResult } from "./calculate.js";

export {
  DEFAULT_CONCLUSIONS,
  DEFAULT_CONFIG,
  DEFAULT_SEVERITY_FLOORS,
  DEFAULT_THRESHOLDS,
  DEFAULT_WEIGHTS,
  RISK_LEVEL_ORDER,
} from "./config.js";
export type {
  RiskConfig,
  RiskThresholds,
  RiskWeights,
  SeverityFloors,
} from "./config.js";

export {
  scoreBlastRadius,
  scoreCostImpact,
  scoreDestructiveness,
  scoreFindings,
} from "./sub-scores.js";
export type { SubScore } from "./sub-scores.js";
