import type { Finding, ResourceChange } from "@planguard/schemas";
import { analyzeAwsPolicies } from "./aws.js";

/**
 * Evaluates deterministic PlanGuard-owned policies against normalized Terraform changes.
 * It does not call an LLM, execute external scanners, or derive cost estimates.
 */
export function analyzePolicies(resourceChanges: ReadonlyArray<ResourceChange>): Finding[] {
  return analyzeAwsPolicies(resourceChanges);
}
