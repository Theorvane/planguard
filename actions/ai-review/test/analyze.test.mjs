import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { test } from "node:test";

const repositoryRoot = path.resolve(new URL("../../../", import.meta.url).pathname);
const actionScript = path.join(repositoryRoot, "actions/ai-review/scripts/analyze.sh");
const sensitiveFixture = path.join(repositoryRoot, "fixtures/terraform-plans/rds-multi-az-disable.json");

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

test("posts only a sanitized plan and writes the AI explanation to the step summary", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "planguard-ai-review-"));
  const bin = path.join(directory, "bin");
  const terraform = path.join(bin, "terraform");
  const curl = path.join(bin, "curl");
  const capturedRequest = path.join(directory, "request.json");
  const stepSummary = path.join(directory, "summary.md");
  await mkdir(bin);
  await writeFile(terraform, `#!/usr/bin/env bash
set -euo pipefail
case "$1" in
  init|plan|show)
    [[ -z "\${INPUT_API_KEY:-}" ]] || { echo "Terraform inherited INPUT_API_KEY" >&2; exit 91; }
    ;;
esac
case "$1" in
  init) exit 0 ;;
  plan) for arg in "$@"; do [[ "$arg" == -out=* ]] && touch "\${arg#-out=}"; done ;;
  show) cat "$FAKE_PLAN" ;;
esac
`);
  await writeFile(curl, `#!/usr/bin/env bash
set -euo pipefail
output=""; body=""
while (($#)); do
  case "$1" in
    --output) output="$2"; shift 2 ;;
    --data-binary) body="\${2#@}"; shift 2 ;;
    *) shift ;;
  esac
done
cp "$body" "$CAPTURED_REQUEST"
printf '%s' '{"choices":[{"message":{"content":"Needs verification: review the Multi-AZ change."}}]}' > "$output"
`);
  await chmod(terraform, 0o755);
  await chmod(curl, 0o755);

  const result = await run("bash", [actionScript], {
    cwd: directory,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      INPUT_WORKING_DIRECTORY: ".",
      INPUT_API_URL: "https://api.openai.com/v1/chat/completions",
      INPUT_API_KEY: "secret-api-key-must-not-leak",
      INPUT_MODEL: "test-model",
      GITHUB_STEP_SUMMARY: stepSummary,
      FAKE_PLAN: sensitiveFixture,
      CAPTURED_REQUEST: capturedRequest,
    },
  });

  assert.equal(result.status, 0, result.stderr);
  const request = await readFile(capturedRequest, "utf8");
  const summary = await readFile(stepSummary, "utf8");
  assert.doesNotMatch(request, /old-rotated-secret|new-rotated-secret/);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}\n${summary}`, /secret-api-key-must-not-leak|old-rotated-secret|new-rotated-secret/);
  assert.match(summary, /PlanGuard AI explanation/);
  assert.match(summary, /Needs verification:/);
});
