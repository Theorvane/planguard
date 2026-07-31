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

const server = createApiServer({
  webhookSecret: SECRET,
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
