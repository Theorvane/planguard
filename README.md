# PlanGuard

> Understand infrastructure changes before they reach production.

An AI infrastructure review app that analyzes Terraform pull request changes for security,
availability, cost, and operational risk, then publishes a GitHub Check to support approval decisions.

## Documentation

* [Product plan](docs/PRODUCT_PLAN.md) (Korean)
* [AGENTS.md](AGENTS.md) — guidance for AI coding agents working in this repository

## Repository layout

This skeleton follows the repository layout defined in the [product plan](docs/PRODUCT_PLAN.md).
Each directory's `README.md` links to the relevant specification and implementation status.

```text
apps/            web · api · worker (not yet implemented; see .agents/ for the worker prototype)
packages/        terraform-parser · policy-engine · risk-engine · github-client · schemas
actions/analyze  GitHub Action that creates and uploads a Terraform plan from user CI
policies/aws     Default PlanGuard AWS policies
fixtures/        terraform plans (planned) · review-fixture.json (for the .agents/ harness)
docs/            installation · security · marketplace
infrastructure/  Terraform for deploying PlanGuard itself
.agents/         Product AI review harness and development safeguards (npm run harness is available)
```

## Product boundary

```text
PlanGuard does not apply Terraform on your behalf.
PlanGuard helps people approve infrastructure changes safely.
```

## Current status

Phase 1 foundation is implemented: Terraform plan normalization, deterministic AWS policy findings,
risk scoring, GitHub App webhook/Check Run primitives, and a no-credential type-chain harness.
The GitHub Action, worker, web dashboard, external policy scanners, cost estimation, persistence, and
Marketplace workflow remain planned.
