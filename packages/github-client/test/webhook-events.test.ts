import assert from "node:assert/strict";
import { test } from "node:test";
import { CHECK_NAME } from "../src/check-run.js";
import type {
  CheckRunWebhookPayload,
  PullRequestWebhookPayload,
} from "../src/webhook-events.js";
import { shouldAnalyzePullRequest, shouldReanalyze } from "../src/webhook-events.js";

function pullRequestEvent(action: string): PullRequestWebhookPayload {
  return {
    action,
    number: 52,
    pull_request: { head: { sha: "abc123", ref: "feat/rds" }, base: { ref: "main" } },
    repository: { name: "api-infra", owner: { login: "planguard" } },
    installation: { id: 1 },
  };
}

function checkRunEvent(action: string, name: string): CheckRunWebhookPayload {
  return {
    action,
    check_run: { id: 99, name, head_sha: "abc123" },
    repository: { name: "api-infra", owner: { login: "planguard" } },
    installation: { id: 1 },
  };
}

test("analyzes on PR opened, synchronize, and reopened", () => {
  for (const action of ["opened", "synchronize", "reopened"]) {
    assert.equal(shouldAnalyzePullRequest(pullRequestEvent(action)), true, action);
  }
});

test("ignores PR actions that do not change the diff", () => {
  for (const action of ["closed", "labeled", "assigned", "edited"]) {
    assert.equal(shouldAnalyzePullRequest(pullRequestEvent(action)), false, action);
  }
});

test("re-analyzes only on rerequested for PlanGuard's own check", () => {
  assert.equal(shouldReanalyze(checkRunEvent("rerequested", CHECK_NAME)), true);
});

test("ignores rerequested for another app's check run", () => {
  assert.equal(shouldReanalyze(checkRunEvent("rerequested", "CodeQL / analyze")), false);
});

test("ignores non-rerequested check_run actions", () => {
  for (const action of ["created", "completed", "requested_action"]) {
    assert.equal(shouldReanalyze(checkRunEvent(action, CHECK_NAME)), false, action);
  }
});
