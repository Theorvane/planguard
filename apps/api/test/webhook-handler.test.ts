import assert from "node:assert/strict";
import { test } from "node:test";
import { sign } from "@octokit/webhooks-methods";
import { CHECK_NAME, type RequestClient } from "@planguard/github-client";
import { createInMemoryDeliveryLog } from "../src/delivery-log.js";
import { type WebhookDeps, handleWebhook } from "../src/webhook-handler.js";

const SECRET = "planguard-test-secret";

function recordingClient() {
  const calls: Array<{ route: string; options: Record<string, unknown> }> = [];
  const client: RequestClient = {
    request: async (route, options = {}) => {
      calls.push({ route, options });
      return { data: { id: 99 } };
    },
  };
  return { calls, client };
}

function deps(overrides: Partial<WebhookDeps> = {}) {
  const { calls, client } = recordingClient();
  return {
    calls,
    deps: {
      webhookSecret: SECRET,
      deliveryLog: createInMemoryDeliveryLog(),
      clientForInstallation: async () => client,
      ...overrides,
    } satisfies WebhookDeps,
  };
}

function pullRequestBody(action: string) {
  return JSON.stringify({
    action,
    number: 52,
    pull_request: { head: { sha: "abc123", ref: "feat/x" }, base: { ref: "main" } },
    repository: { name: "api-infra", owner: { login: "acme" } },
    installation: { id: 7 },
  });
}

async function deliver(
  body: string,
  event: string,
  d: WebhookDeps,
  options: { deliveryId?: string; signature?: string } = {},
) {
  return handleWebhook(
    {
      rawBody: body,
      event,
      signature: options.signature ?? (await sign(SECRET, body)),
      deliveryId: options.deliveryId ?? `delivery-${Math.random()}`,
    },
    d,
  );
}

test("rejects a forged signature without touching GitHub", async () => {
  const { calls, deps: d } = deps();
  const body = pullRequestBody("opened");

  const result = await handleWebhook(
    {
      rawBody: body,
      event: "pull_request",
      signature: await sign("attacker-secret", body),
      deliveryId: "d1",
    },
    d,
  );

  assert.equal(result.status, 401);
  assert.equal(calls.length, 0, "a forged delivery must never reach the GitHub API");
});

test("rejects a body tampered with after signing", async () => {
  const { calls, deps: d } = deps();
  const signature = await sign(SECRET, pullRequestBody("opened"));

  const result = await handleWebhook(
    {
      rawBody: pullRequestBody("closed"),
      event: "pull_request",
      signature,
      deliveryId: "d1",
    },
    d,
  );

  assert.equal(result.status, 401);
  assert.equal(calls.length, 0);
});

test("rejects a missing signature", async () => {
  const { deps: d } = deps();
  const result = await handleWebhook(
    { rawBody: pullRequestBody("opened"), event: "pull_request", signature: undefined, deliveryId: "d1" },
    d,
  );
  assert.equal(result.status, 401);
});

test("queues a check run for an opened pull request", async () => {
  const { calls, deps: d } = deps();
  const result = await deliver(pullRequestBody("opened"), "pull_request", d);

  assert.equal(result.status, 202);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.route, "POST /repos/{owner}/{repo}/check-runs");
  assert.equal(calls[0]?.options.owner, "acme");
  assert.equal(calls[0]?.options.repo, "api-infra");
  assert.equal(calls[0]?.options.head_sha, "abc123");
  assert.equal(calls[0]?.options.name, CHECK_NAME);
});

test("ignores pull request actions that do not change the diff", async () => {
  const { calls, deps: d } = deps();
  const result = await deliver(pullRequestBody("closed"), "pull_request", d);

  assert.equal(result.status, 200);
  assert.equal(calls.length, 0);
});

test("a retried delivery does not create a second check run", async () => {
  const { calls, deps: d } = deps();
  const body = pullRequestBody("opened");
  const signature = await sign(SECRET, body);

  const first = await handleWebhook(
    { rawBody: body, event: "pull_request", signature, deliveryId: "same-id" },
    d,
  );
  const retry = await handleWebhook(
    { rawBody: body, event: "pull_request", signature, deliveryId: "same-id" },
    d,
  );

  assert.equal(first.status, 202);
  assert.equal(retry.status, 200);
  assert.match(retry.body.message, /Duplicate/);
  assert.equal(calls.length, 1, "the retry must not create a second check run");
});

test("requires a delivery id so retries can be detected", async () => {
  const { deps: d } = deps();
  const body = pullRequestBody("opened");
  const result = await handleWebhook(
    { rawBody: body, event: "pull_request", signature: await sign(SECRET, body), deliveryId: undefined },
    d,
  );
  assert.equal(result.status, 400);
});

test("re-analyzes on rerequested for PlanGuard's own check only", async () => {
  const { calls, deps: d } = deps();

  const ours = JSON.stringify({
    action: "rerequested",
    check_run: { id: 1, name: CHECK_NAME, head_sha: "abc123" },
    repository: { name: "api-infra", owner: { login: "acme" } },
    installation: { id: 7 },
  });
  const theirs = JSON.stringify({
    action: "rerequested",
    check_run: { id: 2, name: "CodeQL / analyze", head_sha: "abc123" },
    repository: { name: "api-infra", owner: { login: "acme" } },
    installation: { id: 7 },
  });

  assert.equal((await deliver(ours, "check_run", d)).status, 202);
  assert.equal((await deliver(theirs, "check_run", d)).status, 200);
  assert.equal(calls.length, 1, "another app's check run must not trigger our analysis");
});

test("acknowledges installation events and ignores unknown ones", async () => {
  const { calls, deps: d } = deps();
  const body = JSON.stringify({ action: "created" });

  assert.equal((await deliver(body, "installation", d)).status, 200);
  assert.equal((await deliver(body, "star", d)).status, 200);
  assert.equal(calls.length, 0);
});

test("rejects malformed JSON that passed signature verification", async () => {
  const { deps: d } = deps();
  const result = await deliver("{not json", "pull_request", d);
  assert.equal(result.status, 400);
  assert.match(result.body.message, /valid JSON/);
});

test("rejects a payload with no installation id", async () => {
  const { calls, deps: d } = deps();
  const body = JSON.stringify({
    action: "opened",
    number: 1,
    pull_request: { head: { sha: "a", ref: "r" }, base: { ref: "main" } },
    repository: { name: "r", owner: { login: "o" } },
  });

  const result = await deliver(body, "pull_request", d);
  assert.equal(result.status, 400);
  assert.equal(calls.length, 0);
});
