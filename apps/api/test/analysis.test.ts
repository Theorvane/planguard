import assert from "node:assert/strict";
import { test } from "node:test";
import type { RequestClient } from "@planguard/github-client";
import type { Finding } from "@planguard/schemas";
import type { TerraformPlanJson } from "@planguard/terraform-parser";
import { NO_POLICY_ENGINE_NOTICE, runAnalysis } from "../src/analysis.js";

function recordingClient() {
  const calls: Array<{ route: string; options: Record<string, unknown> }> = [];
  const client: RequestClient = {
    request: async (route, options = {}) => {
      calls.push({ route, options });
      return { data: {} };
    },
  };
  return { calls, client };
}

const MULTI_AZ_DISABLED: TerraformPlanJson = {
  format_version: "1.2",
  resource_changes: [
    {
      address: "aws_db_instance.production",
      mode: "managed",
      type: "aws_db_instance",
      name: "production",
      provider_name: "registry.terraform.io/hashicorp/aws",
      change: {
        actions: ["update"],
        before: { multi_az: true },
        after: { multi_az: false },
      },
    },
  ],
};

const CRITICAL_AVAILABILITY: Finding = {
  category: "availability",
  severity: "critical",
  title: "RDS Multi-AZ is being disabled",
  evidence: "multi_az true -> false",
  source: "planguard:PG-AVAILABILITY-RDS-MULTI-AZ",
  recommendation: "Keep multi_az enabled in production.",
};

const BASE = { owner: "acme", repo: "api-infra", checkRunId: 42 };

test("completes the check run with the computed conclusion", async () => {
  const { calls, client } = recordingClient();

  const { risk } = await runAnalysis(client, {
    ...BASE,
    plan: MULTI_AZ_DISABLED,
    securityFindings: [],
    availabilityFindings: [CRITICAL_AVAILABILITY],
  });

  assert.equal(risk.level, "Critical");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.route, "PATCH /repos/{owner}/{repo}/check-runs/{check_run_id}");
  assert.equal(calls[0]?.options.check_run_id, 42);
  assert.equal(calls[0]?.options.conclusion, "failure");
  assert.equal(calls[0]?.options.status, "completed");
});

test("the summary shows every axis with its reason, not just a number", async () => {
  const { client } = recordingClient();
  const { summary } = await runAnalysis(client, {
    ...BASE,
    plan: MULTI_AZ_DISABLED,
    securityFindings: [],
    availabilityFindings: [CRITICAL_AVAILABILITY],
  });

  for (const axis of ["Security", "Availability", "Destructiveness", "Blast radius", "Cost impact"]) {
    assert.match(summary, new RegExp(`- ${axis}: \\d+ — `), `${axis} must show a reason`);
  }
});

test("an escalated verdict explains which finding forced it", async () => {
  const { client } = recordingClient();
  const { risk, summary } = await runAnalysis(client, {
    ...BASE,
    plan: MULTI_AZ_DISABLED,
    securityFindings: [],
    availabilityFindings: [CRITICAL_AVAILABILITY],
  });

  assert.ok(risk.escalation, "a lone critical finding must escalate");
  assert.match(summary, /Escalated from .* to Critical/);
  assert.match(summary, /RDS Multi-AZ is being disabled/);
});

test("warns that the score is incomplete while policy-engine is missing", async () => {
  const { client } = recordingClient();
  const { summary } = await runAnalysis(client, { ...BASE, plan: MULTI_AZ_DISABLED });

  assert.match(summary, /not enabled yet/);
  assert.equal(summary.includes(NO_POLICY_ENGINE_NOTICE), true);
});

test("omits the warning once findings are supplied", async () => {
  const { client } = recordingClient();
  const { summary } = await runAnalysis(client, {
    ...BASE,
    plan: MULTI_AZ_DISABLED,
    securityFindings: [],
    availabilityFindings: [],
  });

  assert.doesNotMatch(summary, /not enabled yet/);
});

test("an empty plan passes without inventing a cost estimate", async () => {
  const { client } = recordingClient();
  const { risk, summary } = await runAnalysis(client, {
    ...BASE,
    plan: { format_version: "1.2", resource_changes: [] },
    securityFindings: [],
    availabilityFindings: [],
  });

  assert.equal(risk.conclusion, "success");
  assert.equal(risk.score, 0);
  assert.match(summary, /Cost impact: 0 — Cost impact could not be estimated/);
});
