import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

const expectedRootReferences = [
  "./packages/schemas",
  "./packages/terraform-parser",
  "./packages/risk-engine",
  "./packages/github-client",
  "./apps/api",
];

const expectedPackageReferences = {
  "packages/terraform-parser/tsconfig.json": ["../schemas"],
  "packages/risk-engine/tsconfig.json": ["../schemas"],
  "packages/github-client/tsconfig.json": ["../schemas"],
  "apps/api/tsconfig.json": [
    "../../packages/github-client",
    "../../packages/risk-engine",
    "../../packages/schemas",
    "../../packages/terraform-parser",
  ],
};

async function readJson(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, `file://${root}/`), "utf8"));
}

test("the TypeScript build graph declares all internal workspace dependencies", async () => {
  const rootConfig = await readJson("tsconfig.json");
  assert.deepEqual(
    rootConfig.references?.map(({ path }) => path),
    expectedRootReferences,
    "root tsconfig must build workspaces in dependency order",
  );

  for (const [relativePath, expectedReferences] of Object.entries(expectedPackageReferences)) {
    const config = await readJson(relativePath);
    assert.deepEqual(
      config.references?.map(({ path }) => path),
      expectedReferences,
      `${relativePath} must declare its internal package dependencies`,
    );
  }
});
