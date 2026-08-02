import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
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

async function actionHarness(verdict) {
  const directory = await mkdtemp(join(tmpdir(), "planguard-action-"));
  temporaryDirectories.push(directory);
  const bin = join(directory, "bin");
  await mkdir(bin);
  const fakeTerraform = `#!/usr/bin/env bash\nset -euo pipefail\nif [[ " $* " == *" init "* ]]; then exit 0; fi\nif [[ " $* " == *" plan "* ]]; then touch "${directory}/plan.bin"; exit 0; fi\nif [[ " $* " == *" show "* ]]; then printf '{"format_version":"1.2","resource_changes":[]}'; exit 0; fi\nexit 1\n`;
  await writeFile(join(bin, "terraform"), fakeTerraform, { mode: 0o755 });
  let authorization = "";
  const server = createServer(async (request, response) => {
    authorization = request.headers.authorization ?? "";
    for await (const _chunk of request) { /* consume */ }
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(verdict));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const output = join(directory, "output");
  const summary = join(directory, "summary");
  const result = await run("bash", ["actions/analyze/scripts/analyze.sh"], {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    INPUT_API_URL: `http://127.0.0.1:${port}`,
    INPUT_API_TOKEN: "do-not-log-this-token",
    INPUT_WORKING_DIRECTORY: directory,
    GITHUB_OUTPUT: output,
    GITHUB_STEP_SUMMARY: summary,
  });
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return { authorization, output, summary, result };
}

test("uploads JSON plan without exposing the token and fails for a failed verdict", async () => {
  const { authorization, output, summary, result } = await actionHarness({
    risk: { score: 40, level: "High", conclusion: "failure" },
    summary: "Risk score: 40/100",
  });

  assert.equal(result.code, 1);
  assert.equal(authorization, "Bearer do-not-log-this-token");
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /do-not-log-this-token/);
  assert.match(await readFile(output, "utf8"), /conclusion=failure/);
  assert.match(await readFile(summary, "utf8"), /Risk score: 40\/100/);
});

test("writes outputs and succeeds for a successful deterministic verdict", async () => {
  const { output, summary, result } = await actionHarness({
    risk: { score: 0, level: "Low", conclusion: "success" },
    summary: "Risk score: 0/100",
  });

  assert.equal(result.code, 0);
  assert.match(await readFile(output, "utf8"), /risk-level=Low/);
  assert.match(await readFile(output, "utf8"), /conclusion=success/);
  assert.match(await readFile(summary, "utf8"), /^## PlanGuard/m);
});
