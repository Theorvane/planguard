# Contributing to PlanGuard

Thanks for contributing to PlanGuard. This project is released under the [MIT License](LICENSE). By submitting a contribution, you agree to license it under that license and to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Project boundary

PlanGuard reviews Terraform change data. **Risk scores, policy pass/fail decisions, and cost numbers are computed by deterministic code, never by an LLM.** AI may summarize or explain deterministic output only. Read [AGENTS.md](AGENTS.md) before changing analysis, Actions, or agent code.

Do not commit credentials, Terraform state, raw sensitive plans, private endpoints, or production data.

## Development setup

- Node.js 22 or later
- npm (the lockfile is authoritative)

```bash
npm ci
npm run typecheck
npm run test
npm run harness
```

`npm run harness` verifies tool wiring without a model key. A live model invocation is optional and requires locally configured credentials; never place those credentials in a commit, issue, or pull request.

## Contribution flow

After the repository baseline is in place, PlanGuard uses `dev` as its integration branch and `main` for reviewed release promotion.

1. Search existing issues, then open one focused issue with acceptance criteria.
2. Branch from updated `dev` as `<type>/<issue-number>-<description>`; for example, `fix/123-redaction-boundary`.
3. Add or update focused tests before changing behavior.
4. Use conventional commits such as `fix: preserve nested sensitive redaction`.
5. Open a pull request targeting `dev`, with `Closes #<issue-number>` in its body.
6. Run the relevant checks and record the commands/results in the PR.
7. Resolve review feedback. Maintainers merge only reviewed, green PRs.
8. Promote `dev` to release-only `main` through a separate reviewed PR.

## Pull request expectations

- Keep each PR focused and explain the user-facing or security impact.
- Update documentation and tests with behavior changes.
- Preserve the two-job security boundary in the BYO-AI workflow: Terraform preparation has no model key; the fresh explanation job runs no Terraform and reads only the sanitized artifact.
- Do not add `pull_request_target` to the public workflow or run unreviewed Terraform beside secrets or cloud credentials.
- Keep third-party Actions pinned to immutable commit SHAs in public examples.

For suspected vulnerabilities, follow [SECURITY.md](SECURITY.md) instead of filing a public issue.
