import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  buildChatCompletionRequest,
  isPublicAddress,
  parseChatCompletionResponse,
  validateChatCompletionEndpoint,
} from "../scripts/review.mjs";

const sensitivePlan = JSON.parse(
  await readFile(new URL("../../../fixtures/terraform-plans/rds-multi-az-disable.json", import.meta.url), "utf8"),
);

test("builds an OpenAI-compatible explanation request from a sanitized Terraform plan", () => {
  const request = buildChatCompletionRequest(sensitivePlan, "gpt-4.1-mini");
  const serialized = JSON.stringify(request);

  assert.equal(request.model, "gpt-4.1-mini");
  assert.equal(request.temperature, 0);
  assert.doesNotMatch(serialized, /old-rotated-secret|new-rotated-secret/);
  assert.match(serialized, /multi_az/);
  assert.match(request.messages[0].content, /must not determine a pass\/fail verdict/i);
});

test("accepts only a safe HTTPS OpenAI-compatible endpoint", async () => {
  assert.equal(
    await validateChatCompletionEndpoint("https://api.openai.com/v1/chat/completions"),
    "https://api.openai.com/v1/chat/completions",
  );
  for (const value of [
    "http://api.openai.com/v1/chat/completions",
    "https://key@example.com/v1/chat/completions",
    "https://api.openai.com/v1/chat/completions?api_key=leak",
  ]) {
    await assert.rejects(() => validateChatCompletionEndpoint(value), /public HTTPS endpoint|public HTTPS addresses/i);
  }
});

test("rejects non-public endpoints even when they use HTTPS", async () => {
  for (const value of [
    "https://127.0.0.1/v1/chat/completions",
    "https://[::1]/v1/chat/completions",
    "https://169.254.169.254/v1/chat/completions",
  ]) {
    await assert.rejects(() => validateChatCompletionEndpoint(value), /public HTTPS endpoint|public HTTPS addresses/i);
  }
});

test("accepts only public-unicast address ranges for provider endpoints", () => {
  for (const value of ["8.8.8.8", "2606:4700:4700::1111"]) assert.equal(isPublicAddress(value), true, value);
  for (const value of [
    "0.0.0.0", "10.0.0.1", "100.64.0.1", "127.0.0.1", "169.254.169.254", "172.16.0.1",
    "192.0.0.1", "192.0.2.1", "192.168.0.1", "198.18.0.1", "198.51.100.1", "203.0.113.1",
    "224.0.0.1", "::", "::1", "::ffff:127.0.0.1", "fc00::1", "fe90::1", "ff02::1", "2001:db8::1",
  ]) assert.equal(isPublicAddress(value), false, value);
});

test("accepts a non-empty chat-completion text but rejects an invalid response", () => {
  assert.equal(
    parseChatCompletionResponse({ choices: [{ message: { content: "## AI review\nCheck Multi-AZ." } }] }),
    "## AI review\nCheck Multi-AZ.",
  );
  assert.throws(() => parseChatCompletionResponse({ choices: [] }), /invalid/i);
  assert.throws(() => parseChatCompletionResponse({ choices: [{ message: { content: "" } }] }), /invalid/i);
});
