import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const workflow = await readFile(new URL("../../../examples/workflows/ai-terraform-review.yml", import.meta.url), "utf8");

test("keeps cloud Terraform and model secrets behind the trusted workflow boundary", () => {
  assert.match(workflow, /^on:\n  workflow_dispatch:\s*$/m);
  assert.doesNotMatch(workflow, /^\s*(pull_request|pull_request_target|push):/m);
  assert.match(workflow, /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/);

  const prepare = workflow.split("  explain-plan:", 1)[0];
  const explain = workflow.split("  explain-plan:", 2)[1];
  assert.doesNotMatch(prepare, /PLANGUARD_AI_API_KEY|secrets\./);
  assert.doesNotMatch(explain, /actions\/checkout@|terraform /i);
  assert.match(explain, /PLANGUARD_AI_API_KEY/);

  const references = [...workflow.matchAll(/^\s*-?\s*uses:\s*[^@\s]+@([^\s#]+)/gm)].map((match) => match[1]);
  assert.equal(references.length, 6);
  for (const reference of references) assert.match(reference, /^[0-9a-f]{40}$/);
});
