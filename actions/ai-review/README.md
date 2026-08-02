# PlanGuard BYO-AI Terraform Review Action

Use the paired composite Actions when you do **not** want to run the PlanGuard API or GitHub App.
`prepare-ai-review` executes Terraform and creates a sensitive-value-redacted plan artifact in a job with **no
AI API key**. `ai-review` runs in a separate fresh job, downloads only that artifact, and asks an
**OpenAI-compatible** chat-completions API that you choose to explain it.

The API key is supplied by your repository's GitHub Actions secret. PlanGuard does not receive the key,
the plan, Terraform state, the binary plan, or your provider credentials.

> This Action produces an AI explanation only. It never turns an LLM response into a risk score, policy
> verdict, check conclusion, or Terraform approval. Treat model recommendations as **Needs verification**.

## Inputs

| Input | Required | Description |
|---|---:|---|
| `api-key` | yes | GitHub Actions secret for your model provider. Never print this value. |
| `model` | yes | OpenAI-compatible chat model identifier, for example `gpt-4.1-mini`. |
| `plan-json-path` | yes | Downloaded, already-sanitized Terraform plan artifact path. |
| `api-url` | no | HTTPS chat-completions endpoint. Defaults to `https://api.openai.com/v1/chat/completions`. |

The endpoint must be HTTPS and resolve to public **IPv4** addresses. IPv6-only model endpoints are intentionally
unsupported in this version. URLs with embedded credentials, query parameters, or fragments are rejected; private,
loopback, and link-local endpoints are not supported because
an untrusted pull request must not be able to direct the API key at runner-local services. The Action resolves
an approved hostname once and pins `curl` to that verified address, preventing a later DNS rebinding response
from changing the connection target.

## Add it to a repository

1. Add an Actions secret named `PLANGUARD_AI_API_KEY` in **Settings → Secrets and variables → Actions**.
2. Copy [`../../examples/workflows/ai-terraform-review.yml`](../../examples/workflows/ai-terraform-review.yml)
   to the repository that owns the Terraform configuration, at `.github/workflows/ai-terraform-review.yml`.
   The example pins every action to an immutable commit SHA. Keep these pins; update them only after reviewing
   the upstream release and commit SHA (Dependabot can propose the change).
3. Configure an **environment-protected, short-lived, plan-only** cloud identity in the prepare job. The
   supplied workflow deliberately checks out only the trusted default branch and is started manually; do **not**
   add `pull_request` or `pull_request_target` to run unreviewed Terraform with a cloud identity.
4. Start **PlanGuard BYO-AI Terraform Review** from the Actions tab after merging/reviewing configuration changes,
   then read the **PlanGuard AI explanation** in the step summary.

## Trusted-run safety

The supplied workflow is intentionally `workflow_dispatch` only and explicitly checks out the repository default
branch. It does not run Terraform on pull-request code. A workflow that runs unreviewed Terraform alongside cloud
credentials can leak or misuse that identity even if it has no AI API key. For pull-request feedback, use a
credential-free sandbox/mock backend or require a maintainer-approved trusted workflow that checks out a reviewed,
pinned commit.

## Artifact and size limits

The raw Terraform JSON plan is rejected before parsing above **5 MiB**. The sanitized artifact is capped at
**512 KiB** before upload and is retained for one day. The explanation job also rejects an artifact above 512 KiB
before parsing. These limits fail closed without printing plan data.

## Secret safety

The model API key is supplied only to the separate explanation job. Do not change the supplied workflow to
`pull_request_target`, and do not expose repository secrets to workflows that check out untrusted pull-request
code. Use a protected environment to require maintainer approval before cloud credentials are issued.

## Data sent to the model provider

Only the sanitized `terraform show -json` representation is sent to **the provider URL you configure**.
Terraform-marked `before_sensitive` and `after_sensitive` values are recursively redacted before the request.
Do not use this Action if provider policy or your organization's data policy prohibits sending the remaining
plan metadata to that model provider.

The plan request is capped at 512 KiB after sanitization. State files and binary plans stay in the runner's
private temporary directory and are deleted when the Action step exits.

## Related documentation

- [Using secrets in GitHub Actions](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions)
- [Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use)
- [Terraform plan JSON](https://developer.hashicorp.com/terraform/internals/json-format)
