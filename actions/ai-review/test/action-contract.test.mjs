import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";

const actionRoot = new URL("../", import.meta.url);

test("provides a self-hosted AI Terraform review composite action", () => {
  assert.equal(existsSync(new URL("action.yml", actionRoot)), true);
  assert.equal(existsSync(new URL("scripts/explain.sh", actionRoot)), true);
  assert.equal(existsSync(new URL("scripts/analyze.sh", actionRoot)), true);
});
