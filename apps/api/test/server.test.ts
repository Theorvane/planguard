import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { sign } from "@octokit/webhooks-methods";
import type { RequestClient } from "@planguard/github-client";
import { createInMemoryDeliveryLog } from "../src/delivery-log.js";
import { createApiServer } from "../src/server.js";

const SECRET = "planguard-test-secret";
const calls: Array<{ route: string }> = [];

const client: RequestClient = {
  request: async (route) => {
    calls.push({ route });
    return { data: { id: 1 } };
  },
};

const UPLOAD_TOKEN = "plan-upload-test-token";

const EMPTY_PLAN = { format_version: "1.2", resource_changes: [] };

const server = createApiServer({
  webhookSecret: SECRET,
  planUploadToken: UPLOAD_TOKEN,
  deliveryLog: createInMemoryDeliveryLog(),
  clientForInstallation: async () => client,
});

let baseUrl = "";

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

test("GET /healthz reports ok", async () => {
  const response = await fetch(`${baseUrl}/healthz`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
});

test("unknown routes return 404", async () => {
  assert.equal((await fetch(`${baseUrl}/nope`)).status, 404);
});

test("rejects missing or invalid bearer authentication for plan upload", async () => {
  for (const authorization of [undefined, "Bearer wrong", "Basic anything"]) {
    const response = await fetch(`${baseUrl}/analysis/terraform-plan`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(authorization === undefined ? {} : { authorization }),
      },
      body: JSON.stringify(EMPTY_PLAN),
    });

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { message: "Unauthorized." });
  }
});

test("analyzes an authenticated Terraform plan without making a GitHub request", async () => {
  const beforeCalls = calls.length;
  const response = await fetch(`${baseUrl}/analysis/terraform-plan`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${UPLOAD_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(EMPTY_PLAN),
  });

  assert.equal(response.status, 200);
  const body = (await response.json()) as { risk: unknown; summary: unknown };
  assert.deepEqual(body.risk, { score: 0, level: "Low", conclusion: "success" });
  const summary = body.summary;
  assert.equal(typeof summary, "string");
  if (typeof summary !== "string") throw new Error("Expected string summary.");
  assert.match(summary, /Risk score: 0\/100/);
  assert.equal(calls.length, beforeCalls);
});

test("rejects malformed and oversized authenticated plan uploads", async () => {
  const headers = { authorization: `Bearer ${UPLOAD_TOKEN}`, "content-type": "application/json" };
  const malformed = await fetch(`${baseUrl}/analysis/terraform-plan`, {
    method: "POST",
    headers,
    body: JSON.stringify({ resource_changes: [] }),
  });
  assert.equal(malformed.status, 400);

  const malformedNested = await fetch(`${baseUrl}/analysis/terraform-plan`, {
    method: "POST",
    headers,
    body: JSON.stringify({ format_version: "1.2", resource_changes: [{}] }),
  });
  assert.equal(malformedNested.status, 400);

  const validNestedMarkers = await fetch(`${baseUrl}/analysis/terraform-plan`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      format_version: "1.2",
      resource_changes: [{
        address: "aws_instance.example",
        mode: "managed",
        type: "aws_instance",
        name: "example",
        provider_name: "registry.terraform.io/hashicorp/aws",
        change: {
          actions: ["update"],
          before: { items: [{ secret: "before" }] },
          after: { items: [{ secret: "after" }] },
          before_sensitive: { items: [{ secret: true }] },
          after_sensitive: { items: [{ secret: true }] },
          after_unknown: { items: [{ secret: false }] },
        },
      }],
    }),
  });
  assert.equal(validNestedMarkers.status, 200);

  const oversized = await fetch(`${baseUrl}/analysis/terraform-plan`, {
    method: "POST",
    headers,
    body: "x".repeat(5 * 1024 * 1024 + 1),
  });
  assert.equal(oversized.status, 413);
});

test("a signed pull_request delivery reaches the handler over HTTP", async () => {
  const body = JSON.stringify({
    action: "opened",
    number: 1,
    pull_request: { head: { sha: "abc123", ref: "r" }, base: { ref: "main" } },
    repository: { name: "api-infra", owner: { login: "acme" } },
    installation: { id: 7 },
  });

  const response = await fetch(`${baseUrl}/webhooks/github`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-github-event": "pull_request",
      "x-github-delivery": "http-test-1",
      "x-hub-signature-256": await sign(SECRET, body),
    },
    body,
  });

  assert.equal(response.status, 202);
  assert.equal(calls.length, 1);
});

test("an unsigned delivery is rejected over HTTP", async () => {
  const response = await fetch(`${baseUrl}/webhooks/github`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-github-event": "pull_request",
      "x-github-delivery": "http-test-2",
    },
    body: "{}",
  });

  assert.equal(response.status, 401);
});
