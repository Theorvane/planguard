import assert from "node:assert/strict";
import { mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { test } from "node:test";

const repositoryRoot = path.resolve(new URL("../../../", import.meta.url).pathname);
const reviewScript = path.join(repositoryRoot, "actions/ai-review/scripts/review.mjs");

function run(...args) {
  return new Promise((resolve, reject) => {
    const child = spawn(...args);
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stderr }));
  });
}

test("rejects an oversized sanitized plan before parsing or writing a request", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "planguard-size-limit-"));
  const oversizedPlan = path.join(directory, "oversized.json");
  const request = path.join(directory, "request.json");
  await writeFile(oversizedPlan, " ".repeat(512 * 1024 + 1));

  const result = await run("node", [reviewScript, "request", oversizedPlan, "model", request]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Sanitized Terraform plan exceeds the 512 KiB limit/);
  await assert.rejects(() => stat(request));
});

test("rejects an oversized model response before parsing or writing a summary", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "planguard-response-limit-"));
  const response = path.join(directory, "response.json");
  const summary = path.join(directory, "summary.md");
  await writeFile(response, " ".repeat(512 * 1024 + 1));

  const result = await run("node", [reviewScript, "summary", response, summary]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /AI provider response exceeds the 512 KiB limit/);
  await assert.rejects(() => stat(summary));
});
