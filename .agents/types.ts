// Promoted to packages/schemas so terraform-parser, policy-engine, and risk-engine
// share the same shapes. Re-exported here so existing imports in .agents/ don't churn.
export type {
  ChangedField,
  Finding,
  FindingCategory,
  FindingSeverity,
  HistoricalRiskMatch,
  ResourceAction,
  ResourceChange,
  ReviewContext,
} from "@planguard/schemas";
