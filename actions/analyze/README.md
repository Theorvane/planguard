# PlanGuard Terraform Analysis Action

A composite GitHub Action that creates a Terraform plan **inside your CI runner**, removes Terraform-marked
sensitive values, sends only the sanitized `terraform show -json` representation to PlanGuard, and turns the deterministic risk verdict into a job result.

PlanGuard never receives Terraform state, the binary plan file, or provider credentials. Terraform still
uses the runner's configured backend and cloud authentication.

## Inputs and outputs

| Input | Required | Description |
|---|---:|---|
| `api-url` | yes | PlanGuard API base URL, such as `https://planguard.example.com` |
| `api-token` | yes | Repository secret matching the server's `PLANGUARD_API_TOKEN` |
| `working-directory` | no | Terraform configuration directory; defaults to `.` |

| Output | Description |
|---|---|
| `risk-level` | Deterministic `Low`, `Moderate`, `High`, or `Critical` result |
| `conclusion` | Deterministic `success` or `failure` result |

## Example workflow

Install Terraform and configure the cloud credentials in the calling workflow. Pass the secret explicitly:

```yaml
name: PlanGuard
on:
  pull_request:
    paths: ["infra/**"]

permissions:
  contents: read

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3
      # Configure the cloud identity here (for example, OIDC). Do not send it to PlanGuard.
      - uses: sjungwon03/planguard/actions/analyze@main
        with:
          api-url: https://planguard.example.com
          api-token: ${{ secrets.PLANGUARD_API_TOKEN }}
          working-directory: infra
```

The Action runs fixed Terraform commands:

```text
terraform init -input=false
terraform plan -input=false -out=<temporary binary plan>
terraform show -json <temporary binary plan>
```

It sends the resulting JSON to `POST /analysis/terraform-plan` using `Authorization: Bearer …`.
The API response is written to the GitHub step summary. A deterministic `failure` conclusion makes the
Action fail; `success` lets it pass.

## Server contract

The PlanGuard API requires `PLANGUARD_API_TOKEN` at startup. It accepts plan upload bodies up to 5 MiB,
rejects absent or invalid bearer authentication with `401`, malformed plans with `400`, and oversized
bodies with `413`. It runs the local parser, policy engine, and risk engine only; this endpoint does not
call the GitHub API or use an LLM.

- Product boundary: [docs/PRODUCT_PLAN.md #9](../../docs/PRODUCT_PLAN.md#9-분석-데이터-전달-방식)
- Composite-action reference: [GitHub Docs](https://docs.github.com/en/actions/sharing-automations/creating-actions/creating-a-composite-action)
- Explicit secret inputs: [GitHub Docs](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions)
