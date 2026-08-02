import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import type { TerraformPlanJson } from "@planguard/terraform-parser";
import { analyzeUploadedPlan } from "../src/plan-upload.js";

async function fixture(name: string): Promise<TerraformPlanJson> {
  return JSON.parse(
    await readFile(new URL(`../../../../fixtures/terraform-plans/${name}`, import.meta.url), "utf8"),
  ) as TerraformPlanJson;
}

test("returns a deterministic low-risk response for an empty Terraform plan", async () => {
  const result = analyzeUploadedPlan({ format_version: "1.2", resource_changes: [] });

  assert.deepEqual(result.risk, { score: 0, level: "Low", conclusion: "success" });
  assert.match(result.summary, /Risk score: 0\/100/);
});

test("returns a failed critical-risk response for a Multi-AZ disablement plan", async () => {
  const result = analyzeUploadedPlan(await fixture("rds-multi-az-disable.json"));

  assert.deepEqual(result.risk, { score: 36, level: "Critical", conclusion: "failure" });
  assert.match(result.summary, /RDS Multi-AZ is being disabled/);
});
