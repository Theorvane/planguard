import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  buildChatCompletionRequest,
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

test("accepts a non-empty chat-completion text but rejects an invalid response", () => {
  assert.equal(
    parseChatCompletionResponse({ choices: [{ message: { content: "## AI review\nCheck Multi-AZ." } }] }),
    "## AI review\nCheck Multi-AZ.",
  );
  assert.throws(() => parseChatCompletionResponse({ choices: [] }), /invalid/i);
  assert.throws(() => parseChatCompletionResponse({ choices: [{ message: { content: "" } }] }), /invalid/i);
});
