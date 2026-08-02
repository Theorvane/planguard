import assert from "node:assert/strict";
import { test } from "node:test";
import { loadConfig } from "../src/config.js";

const VALID = {
  PLANGUARD_GITHUB_APP_ID: "12345",
  PLANGUARD_GITHUB_PRIVATE_KEY: "-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----",
  PLANGUARD_GITHUB_WEBHOOK_SECRET: "s3cret",
  PLANGUARD_API_TOKEN: "upload-token",
};

test("loads a complete configuration", () => {
  const config = loadConfig({ ...VALID, PORT: "8080" });
  assert.equal(config.appId, "12345");
  assert.equal(config.webhookSecret, "s3cret");
  assert.equal(config.port, 8080);
});

test("a missing webhook secret is a startup error, never a skipped check", () => {
  assert.throws(
    () => loadConfig({ ...VALID, PLANGUARD_GITHUB_WEBHOOK_SECRET: "" }),
    /PLANGUARD_GITHUB_WEBHOOK_SECRET/,
  );
});

test("a missing upload token is a startup error", () => {
  assert.throws(() => loadConfig({ ...VALID, PLANGUARD_API_TOKEN: "" }), /PLANGUARD_API_TOKEN/);
});

test("reports every missing variable at once", () => {
  assert.throws(
    () => loadConfig({}),
    (error: Error) =>
      /PLANGUARD_GITHUB_APP_ID/.test(error.message) &&
      /PLANGUARD_GITHUB_PRIVATE_KEY/.test(error.message) &&
      /PLANGUARD_GITHUB_WEBHOOK_SECRET/.test(error.message),
  );
});

test("restores newlines in a private key stored with escaped \\n", () => {
  const config = loadConfig({
    ...VALID,
    PLANGUARD_GITHUB_PRIVATE_KEY: "-----BEGIN RSA PRIVATE KEY-----\\nabc\\n-----END RSA PRIVATE KEY-----",
  });
  assert.ok(config.privateKey.includes("\n"));
  assert.doesNotMatch(config.privateKey, /\\n/);
});

test("rejects an invalid port", () => {
  assert.throws(() => loadConfig({ ...VALID, PORT: "not-a-port" }), /PORT/);
  assert.throws(() => loadConfig({ ...VALID, PORT: "70000" }), /PORT/);
});
