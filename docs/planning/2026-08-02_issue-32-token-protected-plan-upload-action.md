# Token-Protected Terraform Plan Upload Action Implementation Plan

> **For Hermes:** Implement task-by-task with test-first slices. Commit and push each independently verified slice.

**Goal:** Let a repository-owned composite GitHub Action generate a Terraform plan JSON locally and obtain a deterministic PlanGuard risk verdict from a bounded, bearer-token-protected API endpoint.

**Architecture:** The composite action owns local Terraform execution and sends only `terraform show -json` output to `POST /analysis/terraform-plan`. The API endpoint validates a fixed bearer token in constant time, bounds and parses the JSON body, invokes the existing deterministic parser → policy engine → risk engine pipeline through a pure analysis helper, and returns a risk DTO. It does not access GitHub App credentials or create a Check Run; the Action renders the response in the step summary and fails when the deterministic conclusion is `failure`.

**Tech Stack:** Composite GitHub Action YAML + POSIX shell, Node.js 20, TypeScript, built-in Node test runner, existing Terraform parser/policy/risk packages.

---

## Contract

### Action inputs and outputs

| Item | Contract |
|---|---|
| `api-url` | Required HTTPS API base URL or exact endpoint URL. The action appends `/analysis/terraform-plan` only to a base URL with no path. |
| `api-token` | Required secret, passed explicitly by caller from `secrets.PLANGUARD_API_TOKEN`; never printed. |
| `working-directory` | Optional, defaults to `.`; used as the Terraform command cwd. |
| `risk-level` output | `Low`, `Moderate`, `High`, or `Critical` returned by API. |
| `conclusion` output | `success` or `failure` returned by API. |

### Upload HTTP API: `POST /analysis/terraform-plan`

**Request headers**

```text
Authorization: Bearer PLANGUARD_API_TOKEN_VALUE
Content-Type: application/json
```

**Request body** — raw `terraform show -json` plan object only. The MVP deliberately does not accept user-controlled finding/score fields.

**Success (200)**

```json
{
  "risk": { "score": 70, "level": "Critical", "conclusion": "failure" },
  "summary": "... deterministic summary ..."
}
```

### A/E/X matrix

| Case | Expected API behavior | Expected Action behavior |
|---|---|---|
| Valid token and valid safe plan | 200 deterministic Low/Moderate DTO | writes summary and succeeds |
| Valid token and policy-failing plan | 200 deterministic High/Critical DTO | writes summary, exports outputs, exits non-zero |
| Missing, malformed, or mismatched bearer token | 401 generic error | `curl --fail` stops without leaking token/body |
| Body exceeds 5 MiB | 413 generic error | request fails; Action does not retry or upload artifacts |
| Invalid JSON / unsupported plan shape | 400 generic error | request fails cleanly |
| Terraform init/plan/show failure | no request | action command fails before upload |

## Tasks

### Task 1: Create a pure uploaded-plan analyzer

**Files:**
- Create: `apps/api/src/plan-upload.ts`
- Create test: `apps/api/test/plan-upload.test.ts`

1. Write failing tests for valid safe and RDS Multi-AZ plan responses.
2. Run `npm run test -w @planguard/api`; confirm failure because module is missing.
3. Add `analyzeUploadedPlan(plan)` that calls existing parser, `analyzePolicies`, and `calculateRisk` with no GitHub client.
4. Return only serializable `risk` and summary data; reuse/extract deterministic summary formatting rather than duplicating score logic.
5. Re-run focused API tests; commit `feat: add pure uploaded plan analysis`.

### Task 2: Add bounded bearer-authenticated HTTP endpoint

**Files:**
- Modify: `apps/api/src/config.ts`
- Modify: `apps/api/src/server.ts`
- Modify tests: `apps/api/test/config.test.ts`, `apps/api/test/server.test.ts`

1. Add failing tests for missing/bad bearer authentication (401), valid request (200), invalid JSON/shape (400), and oversized body (413).
2. Run focused tests and observe expected failures.
3. Extend config with required `PLANGUARD_API_TOKEN`; keep errors to variable names only.
4. Inject endpoint dependency into `createApiServer` so unit tests use a test token and deterministic analyzer.
5. Use `timingSafeEqual` only after equal-length buffers; respond with generic messages.
6. Enforce body size before parsing; parse only authenticated request bodies; reject plan objects without `format_version` string and `resource_changes` array when supplied.
7. Re-run focused API tests, typecheck, and `git diff --check`; commit `feat: add bounded plan upload endpoint`.

### Task 3: Implement a repository-safe composite action

**Files:**
- Create: `actions/analyze/action.yml`
- Create: `actions/analyze/scripts/analyze.sh`
- Modify: `actions/analyze/README.md`
- Create test: `actions/analyze/test/analyze.test.mjs`

1. Write failing contract tests that create a fake `terraform` executable and a local HTTP endpoint, then assert the request has a bearer header but no token in stdout/stderr, and verify success/failure output behavior.
2. Execute the test directly with Node and verify RED.
3. Add action metadata with explicit secret input, Node-independent shell execution, declared outputs, and bash shell.
4. Implement script using `mktemp` and `trap` cleanup. Invoke Terraform with fixed arguments: `init -input=false`, `plan -input=false -out`, then `show -json`. Never print JSON or token. Use `curl --fail --silent --show-error` with the token only via a header argument.
5. Parse the small response fields with Node (not ad-hoc shell JSON parsing), append summary to `$GITHUB_STEP_SUMMARY`, emit outputs through `$GITHUB_OUTPUT`, and fail only for returned `failure`.
6. Re-run action contract tests; commit `feat: add Terraform plan upload action`.

### Task 4: Document configuration and verify end-to-end contracts

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `actions/analyze/README.md`

1. Document server variable names and caller workflow snippet that explicitly passes `${{ secrets.PLANGUARD_API_TOKEN }}`; do not add example secret values.
2. Document that the Action sends JSON plan only and does not send state or provider credentials.
3. Run `npm ci`, `npm run typecheck`, `npm run test`, `npm run harness`, the action contract test, and `git diff --check`.
4. Create PR with `Closes #32`; request exact-HEAD review and merge only after green review/check state.
