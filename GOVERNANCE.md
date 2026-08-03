# Governance

## Maintainers

The Theorvane organization maintains PlanGuard. Repository administrators manage access, release tags, security settings, and branch rules.

## Decision model

- **Issues** establish scope, acceptance criteria, and non-goals.
- **Pull requests** are the unit of review and delivery.
- **`dev`** is the protected integration branch.
- **`main`** is release-only and accepts reviewed promotions from the repository-owned `dev` branch.

## Merge requirements

Maintainers require a focused linked issue, passing required checks, a review approval, and resolved review threads before merging. Deterministic-risk, authentication, artifact-boundary, workflow, or release changes receive security-focused review.

## Release authority

Only maintainers may move stable Action tags (including `v1`) and publish GitHub releases. Releases must be made from reviewed `dev` → `main` promotions. The immutable release commit is the recommended supply-chain pin; `@v1` is a maintainer-controlled convenience tag.

## Changes to this document

Changes to governance, branch protection, or release policy require a reviewed pull request and must preserve a working contribution path.
