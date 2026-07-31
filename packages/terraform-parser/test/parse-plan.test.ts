import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type { TerraformPlanJson } from "../src/plan-json.js";
import { parseTerraformPlan } from "../src/parse-plan.js";

function loadFixture(name: string): TerraformPlanJson {
  // npm workspace scripts run with cwd set to this package directory.
  const fixturePath = path.join(process.cwd(), "..", "..", "fixtures", "terraform-plans", name);
  return JSON.parse(readFileSync(fixturePath, "utf8")) as TerraformPlanJson;
}

test("update: diffs changed fields and skips unchanged ones", () => {
  const [change] = parseTerraformPlan(loadFixture("rds-multi-az-disable.json"));

  assert.equal(change.resource, "aws_db_instance.production");
  assert.equal(change.resourceType, "aws_db_instance");
  assert.equal(change.action, "update");
  assert.equal(change.replacementRequired, false);

  const fields = new Map(change.changedFields.map((f) => [f.field, f]));
  assert.equal(fields.size, 2, "instance_class and id are unchanged and must not appear");
  assert.deepEqual(fields.get("multi_az"), { field: "multi_az", before: true, after: false });
});

test("update: redacts fields marked sensitive by Terraform", () => {
  const [change] = parseTerraformPlan(loadFixture("rds-multi-az-disable.json"));
  const password = change.changedFields.find((f) => f.field === "password");

  assert.ok(password, "password changed and must be reported");
  assert.equal(password?.before, "(sensitive value hidden)");
  assert.equal(password?.after, "(sensitive value hidden)");
});

test("update: surfaces a widened security group CIDR", () => {
  const [change] = parseTerraformPlan(loadFixture("sg-open-ssh.json"));

  assert.equal(change.action, "update");
  assert.deepEqual(change.changedFields, [
    { field: "cidr_blocks", before: ["10.0.0.0/8"], after: ["0.0.0.0/0"] },
  ]);
});

test("create: reports no changed fields and filters out data sources", () => {
  const changes = parseTerraformPlan(loadFixture("s3-bucket-create.json"));

  assert.equal(changes.length, 1, "the data.aws_ami read must be filtered out");
  assert.equal(changes[0]?.resource, "aws_s3_bucket.access_logs");
  assert.equal(changes[0]?.action, "create");
  assert.deepEqual(changes[0]?.changedFields, []);
  assert.equal(changes[0]?.replacementRequired, false);
});

test("replace: flags replacementRequired and skips unknown-until-apply fields", () => {
  const [change] = parseTerraformPlan(loadFixture("ec2-instance-type-replace.json"));

  assert.equal(change.action, "replace");
  assert.equal(change.replacementRequired, true);
  assert.deepEqual(change.changedFields, [
    { field: "availability_zone", before: "us-east-1a", after: "us-east-1b" },
  ]);
});
