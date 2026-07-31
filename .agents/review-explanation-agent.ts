import { Tool } from "@theorvane/type-chain";
import { Agent } from "@theorvane/type-chain/agent";
import { z } from "zod";
import type { ReviewContext } from "./types.js";

const EMPTY_SCHEMA = z.object({});

/**
 * The only LLM-facing node in PlanGuard's review pipeline (see docs/PRODUCT_PLAN.md #11).
 * Every tool returns data produced by the deterministic analysis stages that ran before
 * this agent — the model may summarize and connect findings, but it cannot introduce a
 * finding that isn't backed by a tool result (docs/PRODUCT_PLAN.md #3.1).
 */
@Agent({
  systemPrompt: [
    "You are PlanGuard's infrastructure review explainer.",
    "Only describe findings returned by your tools. Never invent a resource, finding, or number.",
    "Label any inference that is not directly stated by a tool result as 'Needs verification'.",
  ].join(" "),
})
export class ReviewExplanationAgent {
  constructor(private readonly context: ReviewContext) {}

  @Tool({
    name: "get_resource_changes",
    description: "List Terraform resource changes detected in this pull request.",
    schema: EMPTY_SCHEMA,
  })
  async getResourceChanges() {
    return this.context.resourceChanges;
  }

  @Tool({
    name: "get_security_findings",
    description: "List Checkov and PlanGuard security findings for this pull request.",
    schema: EMPTY_SCHEMA,
  })
  async getSecurityFindings() {
    return this.context.securityFindings;
  }

  @Tool({
    name: "get_availability_findings",
    description: "List availability-impact findings for this pull request.",
    schema: EMPTY_SCHEMA,
  })
  async getAvailabilityFindings() {
    return this.context.availabilityFindings;
  }

  @Tool({
    name: "get_cost_findings",
    description: "List estimated cost-impact findings for this pull request.",
    schema: EMPTY_SCHEMA,
  })
  async getCostFindings() {
    return this.context.costFindings;
  }

  @Tool({
    name: "get_historical_risk_matches",
    description: "List similar past pull requests or incidents retrieved from Risk Memory.",
    schema: EMPTY_SCHEMA,
  })
  async getHistoricalRiskMatches() {
    return this.context.historicalRiskMatches;
  }
}
