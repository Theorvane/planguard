# Deterministic AWS Policy Engine MVP Implementation Plan

> **For Hermes:** Implement this issue through test-first slices on its issue-numbered feature branch.

**Goal:** Add the first deterministic AWS policy findings and connect them to PlanGuard API analysis.

**Architecture:** `@planguard/policy-engine` consumes normalized `ResourceChange[]` from the Terraform parser and returns immutable `Finding[]`; it has no network, LLM, or mutable state. `apps/api` calls the policy engine after parsing and passes its category-partitioned output to the existing deterministic risk engine.

**Tech Stack:** Node.js 20+, npm workspaces, TypeScript 5.9 project references, Node test runner.

---

### Task 1: Bootstrap the policy-engine workspace

**Objective:** Create a buildable internal package with the schema project as its sole internal dependency.

**Files:**
- Create: `packages/policy-engine/package.json`
- Create: `packages/policy-engine/tsconfig.json`
- Create: `packages/policy-engine/src/index.ts`
- Modify: `tsconfig.json`
- Modify: `apps/api/package.json`
- Modify: `apps/api/tsconfig.json`
- Test: `test/build-chain.test.mjs`

**Steps:**
1. Add a failing build-graph test expectation through the manifest-derived guard by declaring the workspace package.
2. Confirm `npm run test:build-chain` fails because the TypeScript root/project graph does not include the new workspace.
3. Add a composite policy-engine project referencing `@planguard/schemas`; add the root and API references required by their manifest dependencies.
4. Run `npm run typecheck` to verify graph-order compilation.

### Task 2: Implement the open-SSH policy with tests

**Objective:** Detect only a managed AWS security-group rule that exposes TCP port 22 to the public IPv4 CIDR.

**Files:**
- Create: `packages/policy-engine/src/aws.ts`
- Create: `packages/policy-engine/test/aws.test.ts`
- Modify: `packages/policy-engine/src/index.ts`

**Steps:**
1. Write a failing fixture-derived test for `aws_security_group_rule` with `from_port: 22`, `to_port: 22`, and `cidr_blocks` changed to `0.0.0.0/0`.
2. Run `npm run test -w @planguard/policy-engine`; expect failure because the analyzer does not exist.
3. Implement `PG-SEC-SSH-001`, emitting `category: security`, `severity: high`, and deterministic evidence/recommendation/source text.
4. Add no-finding cases: a non-SSH port, private CIDR, no-op/read action, and no public CIDR.
5. Re-run the workspace test.

### Task 3: Implement the RDS Multi-AZ policy with tests

**Objective:** Emit a critical availability finding only for `multi_az: true → false` on a managed RDS update/replace.

**Files:**
- Modify: `packages/policy-engine/src/aws.ts`
- Modify: `packages/policy-engine/test/aws.test.ts`

**Steps:**
1. Write a failing fixture-derived Multi-AZ-disable test.
2. Run the focused workspace test and confirm the intended failure.
3. Implement `PG-AVAIL-RDS-001` with `category: availability`, `severity: critical`, stable source/evidence/recommendation.
4. Add no-finding cases for false-to-false, false-to-true, and unrelated resource types.
5. Re-run the workspace test.

### Task 4: Connect deterministic policies to the API

**Objective:** Make `runAnalysis` derive and score policy findings instead of requiring callers to supply them.

**Files:**
- Modify: `apps/api/src/analysis.ts`
- Modify: `apps/api/test/analysis.test.ts`
- Modify: `apps/api/package.json`
- Modify: `apps/api/tsconfig.json`

**Steps:**
1. Add a failing API test proving the RDS fixture produces a critical failed Check without caller-supplied availability findings.
2. Run `npm run test -w @planguard/api`; expect failure because the current API only scores passed-in findings.
3. Call `analyzePolicies(resourceChanges)`; partition output by category; merge normalized external findings only if kept as an explicit input boundary.
4. Remove the stale `NO_POLICY_ENGINE_NOTICE` path and update its tests.
5. Run API tests and root typecheck.

### Task 5: Verify and deliver

**Objective:** Produce a reviewable feature with evidence.

**Steps:**
1. Run `npm ci`, `npm run typecheck`, `npm run test`, `npm run harness`, and `git diff --check`.
2. Conduct exact-head independent review, including the deterministic-risk boundary.
3. Commit/push each coherent slice, open a `main` PR containing `Closes #30`, resolve review findings, and verify CI/merge state.
4. Merge via merge commit only after the exact current head is approved and checks pass; pull `main` and re-run root verification.
