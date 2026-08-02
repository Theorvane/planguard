import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import { relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

async function readJson(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, `file://${root}/`), "utf8"));
}

test("derives project references from each workspace manifest", () => {
  const workspaceDirectories = new Map([
    ["@planguard/schemas", "packages/schemas"],
    ["@planguard/api", "apps/api"],
  ]);

  assert.deepEqual(
    expectedReferences(
      "apps/api",
      { "@planguard/schemas": "*", "not-an-internal-package": "^1.0.0" },
      workspaceDirectories,
    ),
    ["../../packages/schemas"],
  );
});

test("the TypeScript build graph declares all internal workspace dependencies", async () => {
  const rootManifest = await readJson("package.json");
  const workspaces = await discoverWorkspaces(rootManifest.workspaces);
  const directoriesByPackageName = new Map(workspaces.map(({ manifest, directory }) => [manifest.name, directory]));

  const rootConfig = await readJson("tsconfig.json");
  assert.deepEqual(
    referencePaths(rootConfig).sort(),
    workspaces.map(({ directory }) => `./${directory}`).sort(),
    "root tsconfig must build every configured workspace",
  );

  for (const { directory, manifest } of workspaces) {
    const config = await readJson(`${directory}/tsconfig.json`);
    assert.deepEqual(
      referencePaths(config).sort(),
      expectedReferences(directory, manifest.dependencies, directoriesByPackageName),
      `${directory}/tsconfig.json must declare every internal runtime dependency`,
    );
  }
});

function referencePaths(config) {
  return (config.references ?? []).map(({ path }) => path);
}

function expectedReferences(workspaceDirectory, dependencies = {}, directoriesByPackageName) {
  return Object.keys(dependencies)
    .filter((packageName) => directoriesByPackageName.has(packageName))
    .map((packageName) => {
      const targetDirectory = directoriesByPackageName.get(packageName);
      return relative(workspaceDirectory, targetDirectory);
    })
    .sort();
}

async function discoverWorkspaces(patterns) {
  const directories = [];
  for (const pattern of patterns) {
    assert.match(pattern, /^[^*]+\/\*$/, `unsupported workspace pattern: ${pattern}`);
    const parent = pattern.slice(0, -2);
    for (const entry of await readdir(new URL(`${parent}/`, `file://${root}/`), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const directory = `${parent}/${entry.name}`;
      try {
        await access(new URL(`${directory}/tsconfig.json`, `file://${root}/`));
        directories.push(directory);
      } catch {
        // A workspace without TypeScript project configuration is not part of this build graph.
      }
    }
  }

  return Promise.all(
    directories.map(async (directory) => ({ directory, manifest: await readJson(`${directory}/package.json`) })),
  );
}
