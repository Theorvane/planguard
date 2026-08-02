import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const rootAction = await readFile(new URL("../../../action.yml", import.meta.url), "utf8");

test("exposes a Marketplace-compatible root wrapper for the secure explanation Action", () => {
  assert.match(rootAction, /^name: PlanGuard BYO-AI Explanation$/m);
  assert.match(rootAction, /^description: .+/m);
  assert.match(rootAction, /^branding:\n  icon: shield\n  color: purple$/m);
  assert.match(rootAction, /^runs:\n  using: composite$/m);
  assert.match(rootAction, /uses: \.\/actions\/ai-review/);
  assert.match(rootAction, /plan-json-path:/);
  assert.doesNotMatch(rootAction, /^\s*(terraform (init|plan|show)|run:.*terraform)/im);
  assert.doesNotMatch(rootAction, /pull_request_target/);
});
