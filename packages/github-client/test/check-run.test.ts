import assert from "node:assert/strict";
import { test } from "node:test";
import type { Finding, ResourceChange } from "@planguard/schemas";
import {
  CHECK_NAME,
  buildCheckRunSummary,
  completeCheckRun,
  createQueuedCheckRun,
} from "../src/check-run.js";

function recordingClient() {
  const calls: Array<{ route: string; options: Record<string, unknown> }> = [];
  return {
    calls,
    request: async (route: string, options: Record<string, unknown> = {}) => {
      calls.push({ route, options });
      return { data: { id: 99 } };
    },
  };
}

function change(action: ResourceChange["action"], resource: string): ResourceChange {
  return {
    resource,
    resourceType: resource.split(".")[0] ?? "",
    action,
    changedFields: [],
    replacementRequired: action === "replace",
  };
}

function finding(category: Finding["category"]): Finding {
  return {
    category,
    severity: "high",
    title: "t",
    evidence: "e",
    source: "s",
    recommendation: "r",
  };
}

test("creates the check run queued, under PlanGuard's check name", async () => {
  const client = recordingClient();
  await createQueuedCheckRun(client, { owner: "planguard", repo: "api-infra", headSha: "abc123" });

  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0]?.route, "POST /repos/{owner}/{repo}/check-runs");
  assert.equal(client.calls[0]?.options.name, CHECK_NAME);
  assert.equal(client.calls[0]?.options.status, "queued");
  assert.equal(client.calls[0]?.options.head_sha, "abc123");
});

test("completes the check run with the given conclusion and output", async () => {
  const client = recordingClient();
  await completeCheckRun(client, {
    owner: "planguard",
    repo: "api-infra",
    checkRunId: 99,
    conclusion: "failure",
    title: "Overall risk: High",
    summary: "…",
  });

  const options = client.calls[0]?.options ?? {};
  assert.equal(client.calls[0]?.route, "PATCH /repos/{owner}/{repo}/check-runs/{check_run_id}");
  assert.equal(options.status, "completed");
  assert.equal(options.conclusion, "failure");
  assert.deepEqual(options.output, { title: "Overall risk: High", summary: "…" });
});

test("summary counts resources by action and reports finding totals", () => {
  const summary = buildCheckRunSummary({
    riskLevel: "High",
    decision: "Changes requested",
    resourceChanges: [
      change("create", "aws_s3_bucket.a"),
      change("create", "aws_s3_bucket.b"),
      change("update", "aws_db_instance.c"),
      change("delete", "aws_nat_gateway.d"),
    ],
    securityFindings: [finding("security"), finding("security")],
    availabilityFindings: [finding("availability")],
    estimatedMonthlyChangeText: "-$121",
  });

  assert.match(summary, /^Overall risk: High$/m);
  assert.match(summary, /^4 resources changed$/m);
  assert.match(summary, /^2 created · 1 updated · 1 deleted$/m);
  assert.match(summary, /^Security findings: 2$/m);
  assert.match(summary, /^Availability findings: 1$/m);
  assert.match(summary, /^Estimated monthly change: -\$121$/m);
  assert.match(summary, /^Changes requested$/m);
});

test("summary omits the cost line when no estimate is available", () => {
  const summary = buildCheckRunSummary({
    riskLevel: "Low",
    decision: "Approved",
    resourceChanges: [change("create", "aws_s3_bucket.a")],
    securityFindings: [],
    availabilityFindings: [],
  });

  assert.doesNotMatch(summary, /Estimated monthly change/);
  assert.match(summary, /^1 created$/m);
});
