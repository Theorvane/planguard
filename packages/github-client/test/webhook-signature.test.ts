import assert from "node:assert/strict";
import { test } from "node:test";
import { sign } from "@octokit/webhooks-methods";
import { verifyWebhookSignature } from "../src/webhook-signature.js";

const SECRET = "planguard-test-secret";
const BODY = JSON.stringify({ action: "opened", number: 52 });

test("accepts a signature produced with the shared secret", async () => {
  const signature = await sign(SECRET, BODY);
  assert.equal(await verifyWebhookSignature(SECRET, BODY, signature), true);
});

test("rejects a signature made with a different secret", async () => {
  const signature = await sign("wrong-secret", BODY);
  assert.equal(await verifyWebhookSignature(SECRET, BODY, signature), false);
});

test("rejects when the body was tampered with after signing", async () => {
  const signature = await sign(SECRET, BODY);
  const tampered = JSON.stringify({ action: "opened", number: 999 });
  assert.equal(await verifyWebhookSignature(SECRET, tampered, signature), false);
});

test("rejects a missing signature header", async () => {
  assert.equal(await verifyWebhookSignature(SECRET, BODY, undefined), false);
  assert.equal(await verifyWebhookSignature(SECRET, BODY, null), false);
});
