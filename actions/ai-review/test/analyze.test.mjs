import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { test } from "node:test";

const repositoryRoot = path.resolve(new URL("../../../", import.meta.url).pathname);
const actionScript = path.join(repositoryRoot, "actions/ai-review/scripts/explain.sh");
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

test("reads a sanitized-plan artifact and writes an AI explanation without Terraform", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "planguard-ai-review-"));
  const bin = path.join(directory, "bin");
  const curl = path.join(bin, "curl");
  const capturedRequest = path.join(directory, "request.json");
  const capturedCurlArgs = path.join(directory, "curl-args.txt");
  const stepSummary = path.join(directory, "summary.md");
  await mkdir(bin);
  await writeFile(curl, `#!/usr/bin/env bash
set -euo pipefail
output=""; body=""
printf '%s\\n' "$@" > "$CAPTURED_CURL_ARGS"
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
  await chmod(curl, 0o755);

  const result = await run("bash", [actionScript], {
    cwd: directory,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      INPUT_API_URL: "https://api.openai.com/v1/chat/completions",
      INPUT_API_KEY: "secret-api-key-must-not-leak",
      INPUT_MODEL: "test-model",
      INPUT_PLAN_JSON_PATH: sensitiveFixture,
      GITHUB_STEP_SUMMARY: stepSummary,
      CAPTURED_REQUEST: capturedRequest,
      CAPTURED_CURL_ARGS: capturedCurlArgs,
    },
  });

  assert.equal(result.status, 0, result.stderr);
  const request = await readFile(capturedRequest, "utf8");
  const curlArgs = await readFile(capturedCurlArgs, "utf8");
  const summary = await readFile(stepSummary, "utf8");
  assert.doesNotMatch(request, /old-rotated-secret|new-rotated-secret/);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}\n${summary}`, /secret-api-key-must-not-leak|old-rotated-secret|new-rotated-secret/);
  assert.match(curlArgs, /^-q$/m);
  assert.match(curlArgs, /^--noproxy\n\*$/m);
  assert.match(curlArgs, /^--resolve\napi\.openai\.com:443:/m);
  assert.match(summary, /PlanGuard AI explanation/);
  assert.match(summary, /Needs verification:/);
});
