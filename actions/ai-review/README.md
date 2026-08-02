# PlanGuard BYO-AI Terraform Review Action

Use this composite Action when you do **not** want to run the PlanGuard API or GitHub App. It creates a
Terraform plan in your GitHub Actions runner, replaces values marked sensitive by Terraform with
`[REDACTED]`, then asks an **OpenAI-compatible** chat-completions API that you choose to explain the plan.

The API key is supplied by your repository's GitHub Actions secret. PlanGuard does not receive the key,
the plan, Terraform state, the binary plan, or your provider credentials.

> This Action produces an AI explanation only. It never turns an LLM response into a risk score, policy
> verdict, check conclusion, or Terraform approval. Treat model recommendations as **Needs verification**.

## Inputs

| Input | Required | Description |
|---|---:|---|
| `api-key` | yes | GitHub Actions secret for your model provider. Never print this value. |
| `model` | yes | OpenAI-compatible chat model identifier, for example `gpt-4.1-mini`. |
| `api-url` | no | HTTPS chat-completions endpoint. Defaults to `https://api.openai.com/v1/chat/completions`. |
| `working-directory` | no | Terraform configuration directory; defaults to `.`. |

The endpoint must be HTTPS and resolve only to public Internet addresses. URLs with embedded credentials, query
parameters, or fragments are rejected; private, loopback, and link-local endpoints are not supported because
an untrusted pull request must not be able to direct the API key at runner-local services. The Action resolves
an approved hostname once and pins `curl` to that verified address, preventing a later DNS rebinding response
from changing the connection target.

## Add it to a repository

1. Add an Actions secret named `PLANGUARD_AI_API_KEY` in **Settings → Secrets and variables → Actions**.
2. Copy [`../../examples/workflows/ai-terraform-review.yml`](../../examples/workflows/ai-terraform-review.yml)
   to the repository that owns the Terraform configuration, at `.github/workflows/ai-terraform-review.yml`.
   The example pins every action to an immutable commit SHA. Keep these pins; update them only after reviewing
   the upstream release and commit SHA (Dependabot can propose the change).
3. Configure cloud authentication in that workflow using short-lived credentials/OIDC. Terraform needs those
   credentials to create a plan. Keep cloud credentials scoped to the minimum permissions required by the
   Terraform configuration.
4. Open an internal pull request and read the **PlanGuard AI explanation** in the step summary.

## Fork and secret safety

The example intentionally skips pull requests from forks. GitHub does not provide repository secrets to
forked `pull_request` workflows; changing this to `pull_request_target` would expose your model API key to
untrusted pull-request code and is unsafe. Run the workflow after review/merge or use a separate trusted
workflow for external contributions.

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
