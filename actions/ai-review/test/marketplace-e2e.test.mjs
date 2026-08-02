import assert from "node:assert/strict";
import { chmod, cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { test } from "node:test";

const repositoryRoot = path.resolve(new URL("../../../", import.meta.url).pathname);
const fixture = path.join(repositoryRoot, "fixtures/terraform-plans/rds-multi-az-disable.json");

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stderr }));
  });
}

test("Marketplace root Action resolves its implementation from github.action_path, not consumer workspace", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "planguard-marketplace-e2e-"));
  const actionPath = path.join(directory, "downloaded-action");
  const consumerWorkspace = path.join(directory, "consumer");
  const bin = path.join(directory, "bin");
  const artifact = path.join(directory, "plan.json");
  const summary = path.join(directory, "summary.md");
  const request = path.join(directory, "request.json");
  await mkdir(actionPath, { recursive: true });
  await mkdir(consumerWorkspace);
  await mkdir(bin);
  await cp(path.join(repositoryRoot, "action.yml"), path.join(actionPath, "action.yml"));
  await cp(path.join(repositoryRoot, "actions"), path.join(actionPath, "actions"), { recursive: true });
  await cp(fixture, artifact);
  await writeFile(path.join(bin, "curl"), `#!/usr/bin/env bash
set -euo pipefail
output=""; body=""
while (($#)); do case "$1" in --output) output="$2"; shift 2 ;; --data-binary) body="\${2#@}"; shift 2 ;; *) shift ;; esac; done
cp "$body" "$CAPTURED_REQUEST"
printf '%s' '{"choices":[{"message":{"content":"Needs verification: review."}}]}' > "$output"
`);
  await chmod(path.join(bin, "curl"), 0o755);

  const result = await run("bash", [path.join(actionPath, "actions/ai-review/scripts/explain.sh")], {
    cwd: consumerWorkspace,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      INPUT_API_KEY: "key-not-in-request",
      INPUT_MODEL: "test-model",
      INPUT_API_URL: "https://api.openai.com/v1/chat/completions",
      INPUT_PLAN_JSON_PATH: artifact,
      GITHUB_STEP_SUMMARY: summary,
      CAPTURED_REQUEST: request,
    },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(await readFile(summary, "utf8"), /PlanGuard AI explanation/);
  assert.doesNotMatch(await readFile(request, "utf8"), /old-rotated-secret|new-rotated-secret|key-not-in-request/);
});
