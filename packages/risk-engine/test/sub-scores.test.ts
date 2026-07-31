import assert from "node:assert/strict";
import { test } from "node:test";
import type { Finding, FindingSeverity, ResourceAction, ResourceChange } from "@planguard/schemas";
import {
  scoreBlastRadius,
  scoreCostImpact,
  scoreDestructiveness,
  scoreFindings,
} from "../src/sub-scores.js";

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

test("findings: none scores 0", () => {
  assert.equal(scoreFindings([], "security").score, 0);
});

test("findings: severity drives the score", () => {
  assert.equal(scoreFindings([finding("low")], "security").score, 15);
  assert.equal(scoreFindings([finding("moderate")], "security").score, 40);
  assert.equal(scoreFindings([finding("high")], "security").score, 70);
  assert.equal(scoreFindings([finding("critical")], "security").score, 100);
});

test("findings: the worst severity wins regardless of order", () => {
  const lowFirst = scoreFindings([finding("low"), finding("critical")], "security");
  const criticalFirst = scoreFindings([finding("critical"), finding("low")], "security");
  assert.equal(lowFirst.score, criticalFirst.score);
  assert.match(lowFirst.reason, /worst is critical/);
});

test("findings: more findings outrank fewer at the same severity", () => {
  const one = scoreFindings([finding("high")], "security").score;
  const three = scoreFindings([finding("high"), finding("high"), finding("high")], "security").score;
  assert.ok(three > one, `${three} should exceed ${one}`);
});

test("findings: score never exceeds 100", () => {
  const many = Array.from({ length: 20 }, () => finding("critical"));
  assert.equal(scoreFindings(many, "security").score, 100);
});

test("destructiveness: delete outranks replace outranks update", () => {
  const del = scoreDestructiveness([change("delete", "aws_db_instance.a")]).score;
  const rep = scoreDestructiveness([change("replace", "aws_db_instance.a")]).score;
  const upd = scoreDestructiveness([change("update", "aws_db_instance.a")]).score;
  assert.ok(del > rep, `delete ${del} > replace ${rep}`);
  assert.ok(rep > upd, `replace ${rep} > update ${upd}`);
});

test("destructiveness: pure creates score low and say so", () => {
  const result = scoreDestructiveness([change("create", "aws_s3_bucket.a")]);
  assert.ok(result.score <= 10);
  assert.match(result.reason, /No resources are destroyed/);
});

test("destructiveness: names the destroyed resources, truncating past three", () => {
  const result = scoreDestructiveness([
    change("delete", "aws_nat_gateway.a"),
    change("delete", "aws_nat_gateway.b"),
    change("delete", "aws_nat_gateway.c"),
    change("delete", "aws_nat_gateway.d"),
  ]);
  assert.match(result.reason, /\+1 more/);
});

test("blast radius: grows with resource count and type spread", () => {
  const narrow = scoreBlastRadius([
    change("update", "aws_instance.a"),
    change("update", "aws_instance.b"),
  ]);
  const wide = scoreBlastRadius([
    change("update", "aws_instance.a"),
    change("update", "aws_db_instance.b"),
  ]);
  assert.ok(wide.score > narrow.score, `${wide.score} should exceed ${narrow.score}`);
});

test("blast radius: no-op and read resources do not count", () => {
  const result = scoreBlastRadius([
    change("no-op", "aws_instance.a"),
    change("read", "aws_ami.b"),
  ]);
  assert.equal(result.score, 0);
  assert.match(result.reason, /No resources are affected/);
});

test("cost: an unknown estimate scores 0 and never invents a number", () => {
  const result = scoreCostImpact(undefined, 500);
  assert.equal(result.score, 0);
  assert.match(result.reason, /could not be estimated/);
  assert.doesNotMatch(result.reason, /\$/);
});

test("cost: a savings and a spend of equal size weigh the same", () => {
  assert.equal(scoreCostImpact(250, 500).score, scoreCostImpact(-250, 500).score);
  assert.match(scoreCostImpact(250, 500).reason, /increase/);
  assert.match(scoreCostImpact(-250, 500).reason, /decrease/);
});

test("cost: saturates at 100 past the configured ceiling", () => {
  assert.equal(scoreCostImpact(500, 500).score, 100);
  assert.equal(scoreCostImpact(100_000, 500).score, 100);
});
