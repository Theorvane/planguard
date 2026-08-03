# Security policy

## Supported versions

Security fixes are applied to the current `main` release line. When reporting a problem, identify the release tag or commit you tested.

## Reporting a vulnerability

**Do not open a public GitHub issue for a suspected vulnerability.** Do not include API keys, private keys, Terraform state, raw sensitive plan data, private endpoints, customer data, or exploit details in public issues, pull requests, workflow logs, or discussions.

Private vulnerability reporting is not configured for this repository yet. Until Theorvane enables GitHub's **Report a vulnerability** control or publishes a monitored private contact, there is no supported channel for sensitive disclosure. Do not disclose sensitive details publicly.

## Scope

This policy covers PlanGuard source code, GitHub Actions, published Action releases, CI workflows, and documented release or supply-chain paths. Infrastructure outside this repository and credentials committed by another project may be out of scope, but maintainers will triage reports in good faith once a private channel is available.

## Security design boundary

- Deterministic code owns policy, risk, cost, and pass/fail outcomes.
- The optional AI provider produces explanation only and cannot change a deterministic verdict.
- The public BYO-AI workflow separates Terraform preparation from the secret-bearing explanation job.
- Only a redacted plan artifact may cross that job boundary.

Please preserve these boundaries in all contributions.
