import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { buildUploadEndpoint, sanitizePlan, validateResponse } from "../scripts/prepare-upload.mjs";

const sensitivePlan = JSON.parse(
  await readFile(new URL("../../../fixtures/terraform-plans/rds-multi-az-disable.json", import.meta.url), "utf8"),
);

test("redacts Terraform sensitive values before upload while retaining policy fields", () => {
  const sanitized = sanitizePlan(sensitivePlan);
  const serialized = JSON.stringify(sanitized);

  assert.doesNotMatch(serialized, /old-rotated-secret|new-rotated-secret/);
  assert.equal(sanitized.resource_changes[0].change.after.password, "[REDACTED]");
  assert.equal(sanitized.resource_changes[0].change.after.multi_az, false);
});

test("accepts only HTTPS base URLs and the exact upload endpoint", () => {
  assert.equal(buildUploadEndpoint("https://planguard.example.com"), "https://planguard.example.com/analysis/terraform-plan");
  assert.equal(
    buildUploadEndpoint("https://planguard.example.com/analysis/terraform-plan"),
    "https://planguard.example.com/analysis/terraform-plan",
  );
  for (const value of ["http://planguard.example.com", "https://planguard.example.com/other", "https://evil.example/analysis/terraform-plan?x=1"]) {
    assert.throws(() => buildUploadEndpoint(value), /HTTPS base URL or upload endpoint/);
  }
});

test("rejects response values that would inject GitHub Action outputs", () => {
  assert.throws(
    () => validateResponse({ risk: { score: 0, level: "Low\ninjected=pwned", conclusion: "success" }, summary: "ok" }),
    /invalid analysis response/i,
  );
});
