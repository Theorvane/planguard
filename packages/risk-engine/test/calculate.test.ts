import assert from "node:assert/strict";
import { test } from "node:test";
import type { Finding, FindingSeverity, ResourceAction, ResourceChange } from "@planguard/schemas";
import { calculateRisk, toRiskLevel } from "../src/calculate.js";
import { DEFAULT_CONFIG, DEFAULT_THRESHOLDS } from "../src/config.js";

function finding(severity: FindingSeverity, title = "t"): Finding {
  return {
    category: "security",
    severity,
    title,
    evidence: "e",
    source: "s",
    recommendation: "r",
  };
}

function change(action: ResourceAction, resource: string): ResourceChange {
  return {
    resource,
    resourceType: resource.split(".")[0] ?? "",
    action,
    changedFields: [],
    replacementRequired: action === "replace",
  };
}

const EMPTY = { resourceChanges: [], securityFindings: [], availabilityFindings: [] };

test("an empty plan scores 0 / Low / success", () => {
  const result = calculateRisk(EMPTY);
  assert.equal(result.score, 0);
  assert.equal(result.level, "Low");
  assert.equal(result.conclusion, "success");
});

test("grade boundaries follow the #6.6 table exactly", () => {
  assert.equal(toRiskLevel(0, DEFAULT_THRESHOLDS), "Low");
  assert.equal(toRiskLevel(19, DEFAULT_THRESHOLDS), "Low");
  assert.equal(toRiskLevel(20, DEFAULT_THRESHOLDS), "Moderate");
  assert.equal(toRiskLevel(39, DEFAULT_THRESHOLDS), "Moderate");
  assert.equal(toRiskLevel(40, DEFAULT_THRESHOLDS), "High");
  assert.equal(toRiskLevel(69, DEFAULT_THRESHOLDS), "High");
  assert.equal(toRiskLevel(70, DEFAULT_THRESHOLDS), "Critical");
  assert.equal(toRiskLevel(100, DEFAULT_THRESHOLDS), "Critical");
});

test("High and Critical fail the check; Low and Moderate pass", () => {
  assert.equal(DEFAULT_CONFIG.conclusions.Low, "success");
  assert.equal(DEFAULT_CONFIG.conclusions.Moderate, "success");
  assert.equal(DEFAULT_CONFIG.conclusions.High, "failure");
  assert.equal(DEFAULT_CONFIG.conclusions.Critical, "failure");
});

test("the canonical scenario: disabling production RDS Multi-AZ blocks the PR", () => {
  // docs/PRODUCT_PLAN.md #5 시나리오 C — availability critical must not slip through.
  const result = calculateRisk({
    resourceChanges: [change("update", "aws_db_instance.production")],
    securityFindings: [],
    availabilityFindings: [finding("critical", "RDS Multi-AZ is being disabled")],
    estimatedMonthlyDeltaUsd: -121,
  });

  assert.equal(result.conclusion, "failure");
  assert.ok(
    result.level === "High" || result.level === "Critical",
    `expected a blocking grade, got ${result.level} (${result.score})`,
  );
});

test("a cost saving alone never blocks a PR", () => {
  // Cost is 5% — a big saving with no findings must stay well under the High line.
  const result = calculateRisk({
    resourceChanges: [change("update", "aws_instance.web")],
    securityFindings: [],
    availabilityFindings: [],
    estimatedMonthlyDeltaUsd: -5000,
  });

  assert.equal(result.conclusion, "success");
  assert.ok(result.score < DEFAULT_THRESHOLDS.high, `score ${result.score} should stay under High`);
});

test("security and availability dominate over blast radius", () => {
  const manyHarmlessCreates = calculateRisk({
    resourceChanges: Array.from({ length: 12 }, (_, i) => change("create", `aws_s3_bucket.b${i}`)),
    securityFindings: [],
    availabilityFindings: [],
  });
  const oneCriticalFinding = calculateRisk({
    resourceChanges: [change("update", "aws_security_group.bastion")],
    securityFindings: [finding("critical", "SSH exposed to the internet")],
    availabilityFindings: [],
  });

  assert.ok(
    oneCriticalFinding.score > manyHarmlessCreates.score,
    `one critical (${oneCriticalFinding.score}) should outweigh 12 creates (${manyHarmlessCreates.score})`,
  );
});

test("the breakdown explains every axis, including unpriced cost", () => {
  const result = calculateRisk({
    resourceChanges: [change("delete", "aws_nat_gateway.a")],
    securityFindings: [finding("high", "Something")],
    availabilityFindings: [],
  });

  for (const sub of Object.values(result.breakdown)) {
    assert.ok(sub.reason.length > 0, "every sub-score must carry a reason");
    assert.ok(sub.score >= 0 && sub.score <= 100);
  }
  assert.match(result.breakdown.costImpact.reason, /could not be estimated/);
  assert.match(result.breakdown.destructiveness.reason, /aws_nat_gateway\.a/);
});

test("identical input always produces an identical result", () => {
  const input = {
    resourceChanges: [change("replace", "aws_instance.web")],
    securityFindings: [finding("moderate")],
    availabilityFindings: [finding("high")],
    estimatedMonthlyDeltaUsd: 34.2,
  };
  assert.deepEqual(calculateRisk(input), calculateRisk(input));
});

test("the same change grades differently per environment, via finding severity", () => {
  // docs/PRODUCT_PLAN.md #7: Multi-AZ disabled is Moderate in dev, Critical in production.
  // policy-engine encodes the environment by choosing the severity; the engine honours it.
  const resourceChanges = [change("update", "aws_db_instance.db")];

  const dev = calculateRisk({
    resourceChanges,
    securityFindings: [],
    availabilityFindings: [finding("moderate", "Multi-AZ disabled")],
  });
  const production = calculateRisk({
    resourceChanges,
    securityFindings: [],
    availabilityFindings: [finding("critical", "Multi-AZ disabled")],
  });

  assert.equal(dev.conclusion, "success");
  assert.equal(production.level, "Critical");
  assert.equal(production.conclusion, "failure");
});

test("thresholds retune the weighted grade when no finding floor applies", () => {
  const input = {
    resourceChanges: Array.from({ length: 8 }, (_, i) => change("delete", `aws_s3_bucket.b${i}`)),
    securityFindings: [],
    availabilityFindings: [],
  };

  const relaxed = calculateRisk(input);
  const strict = calculateRisk(input, {
    ...DEFAULT_CONFIG,
    thresholds: { moderate: 10, high: 25, critical: 60 },
  });

  assert.equal(relaxed.conclusion, "success");
  assert.equal(strict.conclusion, "failure");
  assert.equal(relaxed.score, strict.score, "thresholds change the grade, not the score");
});

test("with no findings, structural risk alone tops out at exactly the High line", () => {
  // The non-finding axes are destructiveness (20%) + blast radius (15%) + cost (5%)
  // = 40 points maximum, exactly the High threshold and never Critical. So a change
  // nothing flagged can warn but can never reach the top grade on shape alone —
  // blocking severity is driven by findings. A repo wanting deletions to weigh more
  // must lower `thresholds` or have policy-engine emit a finding for them.
  const worstPossibleWithoutFindings = calculateRisk({
    resourceChanges: Array.from({ length: 40 }, (_, i) => change("delete", `aws_type${i}.r${i}`)),
    securityFindings: [],
    availabilityFindings: [],
    estimatedMonthlyDeltaUsd: 100_000,
  });

  assert.equal(worstPossibleWithoutFindings.breakdown.destructiveness.score, 100);
  assert.equal(worstPossibleWithoutFindings.breakdown.blastRadius.score, 100);
  assert.equal(worstPossibleWithoutFindings.score, 40);
  assert.equal(worstPossibleWithoutFindings.level, "High");
});

test("a critical finding escalates the grade and records why", () => {
  const result = calculateRisk({
    resourceChanges: [change("update", "aws_db_instance.production")],
    securityFindings: [],
    availabilityFindings: [finding("critical", "RDS Multi-AZ is being disabled")],
  });

  assert.equal(result.level, "Critical");
  assert.ok(result.escalation, "an escalation must be recorded");
  assert.equal(result.escalation?.to, "Critical");
  assert.match(result.escalation?.reason ?? "", /RDS Multi-AZ is being disabled/);
  assert.ok(
    result.score < DEFAULT_THRESHOLDS.critical,
    "the weighted score alone would not have reached Critical — that is the point",
  );
});

test("no escalation is recorded when the weighted score already leads", () => {
  const result = calculateRisk({
    resourceChanges: [change("create", "aws_s3_bucket.a")],
    securityFindings: [],
    availabilityFindings: [],
  });
  assert.equal(result.escalation, undefined);
});

test("a floor only ever raises a grade, never lowers it", () => {
  // Many deletions push the weighted score high on their own; a lone `high` finding
  // whose floor is only "High" must not drag a Critical result back down.
  const result = calculateRisk({
    resourceChanges: Array.from({ length: 20 }, (_, i) => change("delete", `aws_instance.i${i}`)),
    securityFindings: [finding("high", "Something high")],
    availabilityFindings: [finding("critical", "Something critical")],
  });
  assert.equal(result.level, "Critical");
});

test("severity floors can be disabled by a repo that never wants blocking", () => {
  const result = calculateRisk(
    {
      resourceChanges: [change("update", "aws_db_instance.db")],
      securityFindings: [],
      availabilityFindings: [finding("critical", "Multi-AZ disabled")],
    },
    {
      ...DEFAULT_CONFIG,
      severityFloors: { low: null, moderate: null, high: null, critical: null },
    },
  );

  assert.equal(result.escalation, undefined);
  assert.equal(result.conclusion, "success");
});

test("weights that do not sum to 1 are rejected loudly", () => {
  assert.throws(
    () =>
      calculateRisk(EMPTY, {
        ...DEFAULT_CONFIG,
        weights: {
          security: 0.5,
          availability: 0.5,
          destructiveness: 0.5,
          blastRadius: 0.5,
          costImpact: 0.5,
        },
      }),
    /must sum to 1/,
  );
});

test("out-of-order thresholds are rejected loudly", () => {
  assert.throws(
    () =>
      calculateRisk(EMPTY, {
        ...DEFAULT_CONFIG,
        thresholds: { moderate: 80, high: 40, critical: 90 },
      }),
    /must increase/,
  );
});

test("a non-positive cost ceiling is rejected", () => {
  assert.throws(
    () => calculateRisk(EMPTY, { ...DEFAULT_CONFIG, costSaturationUsd: 0 }),
    /greater than 0/,
  );
});
