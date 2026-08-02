# TypeScript Workspace Build Chain Implementation Plan

> **For Hermes:** Execute the tasks in this document with a test-first verification cycle.

**Goal:** Restore deterministic root-level TypeScript build, typecheck, test, and agent-harness commands for the PlanGuard npm workspace.

**Architecture:** Make each implementation workspace a composite TypeScript project and declare only its real internal package dependencies using TypeScript project references. Root `tsc --build` becomes the graph-aware build entry point. Node runtime typings are a root development dependency, inherited by workspace TypeScript configurations.

**Tech Stack:** Node.js 20+, npm workspaces, TypeScript 5.9, Node test runner.

---

### Task 1: Capture the broken root contract

**Objective:** Add a test that asserts every implementation workspace has a TypeScript project configuration and that the root build command succeeds after dependencies are installed.

**Files:**
- Create: `test/build-chain.test.mjs`
- Modify: `package.json`

**Steps:**
1. Add a Node test that reads the workspace package manifests and asserts their declared TypeScript build configuration can participate in the root project graph.
2. Run `node --test test/build-chain.test.mjs`; expect failure before configuration changes.
3. Add a root `test:build-chain` script and retain it as a regression guard.

### Task 2: Define the TypeScript dependency graph

**Objective:** Ensure `tsc --build` compiles workspaces in dependency order and emits declarations for package consumers.

**Files:**
- Modify: `tsconfig.base.json`
- Modify: `tsconfig.json`
- Modify: `packages/schemas/tsconfig.json`
- Modify: `packages/terraform-parser/tsconfig.json`
- Modify: `packages/risk-engine/tsconfig.json`
- Modify: `packages/github-client/tsconfig.json`
- Modify: `apps/api/tsconfig.json`

**Steps:**
1. Enable `composite` and declaration output in the shared configuration.
2. Add package references that match runtime dependencies.
3. Change the root configuration to reference buildable workspaces and the root agent harness.
4. Run `npm run typecheck`; expect successful graph-aware compilation.

### Task 3: Supply Node runtime types

**Objective:** Give TypeScript the Node modules and globals used by source code and tests.

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

**Steps:**
1. Add `@types/node` as a root development dependency using npm.
2. Re-run `npm run typecheck`; confirm that Node test imports and server globals are typed.

### Task 4: Verify runtime commands

**Objective:** Confirm the package tests and no-credential agent harness run from a clean dependency install.

**Files:**
- No additional source files expected.

**Steps:**
1. Run `npm ci`.
2. Run `npm run typecheck`, `npm run test`, `npm run harness`, and `git diff --check`.
3. Confirm `git status --short` contains only intended tracked source/configuration files.

### Task 5: Deliver through review

**Objective:** Make the verified repair durable and reviewable.

**Steps:**
1. Commit the design document and implementation separately using Conventional Commits.
2. Push `fix/28-build-toolchain`.
3. Open a PR against `main` with `Closes #28` and the actual verification evidence.
4. Obtain independent exact-HEAD review before merge.
