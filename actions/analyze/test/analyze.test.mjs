import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { spawn } from "node:child_process";

const temporaryDirectories = [];
after(async () => Promise.all(temporaryDirectories.map((directory) => rm(directory, { recursive: true, force: true }))));

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args, { env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    process.stdout.on("data", (chunk) => (stdout += chunk));
    process.stderr.on("data", (chunk) => (stderr += chunk));
    process.on("error", reject);
    process.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function actionHarness(verdict, terraformJson = '{"format_version":"1.2","resource_changes":[]}') {
  const directory = await mkdtemp(join(tmpdir(), "planguard-action-"));
  temporaryDirectories.push(directory);
  const bin = join(directory, "bin");
  await mkdir(bin);
  const fakeTerraform = `#!/usr/bin/env bash\nset -euo pipefail\nif [[ " $* " == *" init "* ]]; then exit 0; fi\nif [[ " $* " == *" plan "* ]]; then touch "${directory}/plan.bin"; exit 0; fi\nif [[ " $* " == *" show "* ]]; then printf '%s' "$FAKE_TERRAFORM_JSON"; exit 0; fi\nexit 1\n`;
  const fakeCurl = `#!/usr/bin/env bash\nset -euo pipefail\nfor arg in "$@"; do\n  case "$arg" in\n    'Authorization: Bearer '*) printf '%s' "$arg" > "$CAPTURE_AUTHORIZATION" ;;\n    @*) cp "\${arg#@}" "$CAPTURE_BODY" ;;\n    https://*) printf '%s' "$arg" > "$CAPTURE_URL" ;;\n  esac\ndone\nprintf '%s' "$ACTION_RESPONSE"\n`;
  await writeFile(join(bin, "terraform"), fakeTerraform, { mode: 0o755 });
  await writeFile(join(bin, "curl"), fakeCurl, { mode: 0o755 });
  const output = join(directory, "output");
  const summary = join(directory, "summary");
  const authorization = join(directory, "authorization");
  const uploadedBody = join(directory, "uploaded-body");
  const uploadedUrl = join(directory, "uploaded-url");
  const result = await run("bash", ["actions/analyze/scripts/analyze.sh"], {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    INPUT_API_URL: "https://planguard.example.test",
    INPUT_API_TOKEN: "do-not-log-this-token",
    INPUT_WORKING_DIRECTORY: directory,
    GITHUB_OUTPUT: output,
    GITHUB_STEP_SUMMARY: summary,
    CAPTURE_AUTHORIZATION: authorization,
    CAPTURE_BODY: uploadedBody,
    CAPTURE_URL: uploadedUrl,
    ACTION_RESPONSE: JSON.stringify(verdict),
    FAKE_TERRAFORM_JSON: terraformJson,
  });
  return { authorization, output, summary, uploadedBody, uploadedUrl, result };
}

test("uploads a sanitized JSON plan without exposing the token and fails for a failed verdict", async () => {
  const rawPlan = JSON.stringify({
    format_version: "1.2",
    resource_changes: [{
      address: "aws_db_instance.production", mode: "managed", type: "aws_db_instance", name: "production", provider_name: "aws",
      change: { actions: ["update"], before: { password: "old-rotated-secret", multi_az: true }, after: { password: "new-rotated-secret", multi_az: false }, before_sensitive: { password: true }, after_sensitive: { password: true } },
    }],
  });
  const { authorization, output, summary, uploadedBody, uploadedUrl, result } = await actionHarness({
    risk: { score: 40, level: "High", conclusion: "failure" }, summary: "Risk score: 40/100",
  }, rawPlan);

  assert.equal(result.code, 1, result.stderr);
  assert.equal(await readFile(authorization, "utf8"), "Authorization: Bearer do-not-log-this-token");
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /do-not-log-this-token/);
  assert.doesNotMatch(await readFile(uploadedBody, "utf8"), /old-rotated-secret|new-rotated-secret/);
  assert.equal(await readFile(uploadedUrl, "utf8"), "https://planguard.example.test/analysis/terraform-plan");
  assert.match(await readFile(output, "utf8"), /conclusion=failure/);
  assert.match(await readFile(summary, "utf8"), /Risk score: 40\/100/);
});

test("writes outputs and succeeds for a successful deterministic verdict", async () => {
  const { output, summary, result } = await actionHarness({
    risk: { score: 0, level: "Low", conclusion: "success" }, summary: "Risk score: 0/100",
  });

  assert.equal(result.code, 0, result.stderr);
  assert.match(await readFile(output, "utf8"), /risk-level=Low/);
  assert.match(await readFile(output, "utf8"), /conclusion=success/);
  assert.match(await readFile(summary, "utf8"), /^## PlanGuard/m);
});
