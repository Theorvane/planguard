# PlanGuard

> Review Terraform changes safely in GitHub Actions, with an optional explanation from your own AI provider.

[![Release](https://img.shields.io/github/v/release/Theorvane/planguard?display_name=tag&sort=semver)](https://github.com/Theorvane/planguard/releases/latest)

PlanGuard is a GitHub Actions tool for reviewing Terraform plans. It runs in your repository's GitHub runner; it does not require a hosted PlanGuard service, Render deployment, or GitHub App. AI explanations are optional, and the provider API key is supplied only from your GitHub Actions secrets.

## What PlanGuard does

PlanGuard keeps two responsibilities separate. **Deterministic policy, risk, and pass/fail decisions** belong to code and must not be changed by an AI model. **AI explanation** is an optional assistant feature that turns a Terraform plan with sensitive values removed into a human-readable summary.

The default workflow maintains this boundary:

```text
Create a Terraform plan from the trusted default branch
  → remove Terraform-marked sensitive values
  → store a short-retention sanitized artifact
  → create an AI explanation on a fresh GitHub runner
```

The job that runs Terraform never receives the AI API key. The job that has the AI API key does not execute Terraform code or providers; it reads only the sanitized artifact.

## Quick start

### 1. Store your provider API key as a GitHub secret

In the Terraform repository that will use PlanGuard, open **Settings → Secrets and variables → Actions → New repository secret** and create:

```text
PLANGUARD_AI_API_KEY
```

Use an API key for OpenAI or an OpenAI-compatible provider. Never put the key directly in workflow YAML, Terraform variables, commits, issues, or logs.

### 2. Add a workflow

Create `.github/workflows/planguard-ai-review.yml` in the Terraform repository. Change `working-directory` to the directory containing your Terraform configuration. Add a cloud authentication step appropriate for your provider, using an environment-protected, short-lived OIDC identity with plan-only permissions.

```yaml
name: PlanGuard BYO-AI Terraform Review

# Secure default: run manually against reviewed and merged default-branch code, never PR code.
on:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  prepare-sanitized-plan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
        with:
          ref: ${{ github.event.repository.default_branch }}

      - uses: hashicorp/setup-terraform@b9cd54a3c349d3f38e8881555d616ced269862dd # v3.1.2

      # Add environment-protected, short-lived, plan-only cloud authentication here.
      # Do not add pull_request or pull_request_target triggers.
      - uses: Theorvane/planguard/actions/prepare-ai-review@v1
        with:
          working-directory: infrastructure # Change to your Terraform directory.
          output-path: planguard-sanitized-plan.json

      - uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2
        with:
          name: planguard-sanitized-plan
          path: planguard-sanitized-plan.json
          if-no-files-found: error
          retention-days: 1

  explain-plan:
    needs: prepare-sanitized-plan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093 # v4.3.0
        with:
          name: planguard-sanitized-plan
          path: plan-artifact

      - uses: Theorvane/planguard@v1
        with:
          api-key: ${{ secrets.PLANGUARD_AI_API_KEY }}
          model: gpt-4.1-mini
          plan-json-path: plan-artifact/planguard-sanitized-plan.json
          # Specify this for another OpenAI-compatible provider.
          # api-url: https://your-provider.example/v1/chat/completions
```

The example pins `actions/checkout`, `hashicorp/setup-terraform`, and artifact Actions to immutable commit SHAs. PlanGuard offers the stable major tag `@v1`. For stricter supply-chain control, pin the immutable commit from the [v1.0.0 release](https://github.com/Theorvane/planguard/releases/tag/v1.0.0).

### 3. Run the workflow and read the result

Merge your Terraform change into the default branch. Then open the repository's **Actions** tab, choose **PlanGuard BYO-AI Terraform Review**, and select **Run workflow**. When the run completes, the AI explanation appears in the GitHub Step Summary for the `explain-plan` job.

PlanGuard does not send your Terraform binary plan or cloud credentials to the AI provider. It sends only JSON where values Terraform marked `sensitive` have been replaced with `[REDACTED]`. The sanitized artifact is limited to 512 KiB and retained for one day by default.

## Inputs

`Theorvane/planguard@v1` accepts the following inputs.

| Input | Required | Description |
| --- | --- | --- |
| `api-key` | Yes | OpenAI-compatible API key passed from a GitHub Actions secret. |
| `model` | Yes | A model identifier supported by your provider. |
| `plan-json-path` | Yes | Path to sanitized Terraform plan JSON created by a separate trusted job. |
| `api-url` | No | OpenAI-compatible chat completions URL. Defaults to the OpenAI endpoint. |

`api-url` must be an HTTPS hostname. URLs with a query string, fragment, embedded credential, or IP literal are rejected, as are private and local network addresses.

## Compatible AI providers

PlanGuard uses the OpenAI **Chat Completions** request and response format. Any provider that accepts this wire format and returns a normal chat-completion `choices[0].message.content` response can work. The provider endpoint must also meet PlanGuard's HTTPS and public-IPv4 hostname checks.

The following official public endpoints match that interface as of August 2026. Create the provider key in the same `PLANGUARD_AI_API_KEY` GitHub secret; change only `model` and, when shown, `api-url`.

| Provider | Example `model` | `api-url` setting |
| --- | --- | --- |
| OpenAI | `gpt-4.1-mini` | Omit it; this is the default `https://api.openai.com/v1/chat/completions`. |
| Google Gemini | A Gemini Chat Completions model ID enabled for your Google AI account, such as `gemini-2.5-flash` | `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions` |
| Claude (Anthropic) via OpenRouter | An available OpenRouter Claude model ID, such as `anthropic/claude-...` | `https://openrouter.ai/api/v1/chat/completions` |
| Gemini via OpenRouter | An available OpenRouter Gemini model ID, such as `google/gemini-...` | `https://openrouter.ai/api/v1/chat/completions` |
| xAI (Grok) | A Grok chat model ID enabled for your xAI account | `https://api.x.ai/v1/chat/completions` |
| OpenRouter | A routed model ID such as `openai/gpt-4.1-mini` | `https://openrouter.ai/api/v1/chat/completions` |
| Groq | A Groq chat model ID enabled for your account | `https://api.groq.com/openai/v1/chat/completions` |
| Together AI | A Together chat model ID enabled for your account | `https://api.together.xyz/v1/chat/completions` |
| Mistral AI | A Mistral chat model ID enabled for your account | `https://api.mistral.ai/v1/chat/completions` |
| DeepSeek | A DeepSeek chat model ID enabled for your account | `https://api.deepseek.com/chat/completions` |

For Google Gemini, use its first-party OpenAI compatibility endpoint:

```yaml
      - uses: Theorvane/planguard@v1
        with:
          api-key: ${{ secrets.PLANGUARD_AI_API_KEY }} # Google AI API key
          model: gemini-2.5-flash
          plan-json-path: plan-artifact/planguard-sanitized-plan.json
          api-url: https://generativelanguage.googleapis.com/v1beta/openai/chat/completions
```

Anthropic's first-party API uses the Anthropic Messages format rather than the OpenAI Chat Completions format PlanGuard sends. Use Claude through an OpenAI-compatible gateway such as OpenRouter instead, with an OpenRouter key stored in `PLANGUARD_AI_API_KEY` and a Claude model ID available in that account:

```yaml
      - uses: Theorvane/planguard@v1
        with:
          api-key: ${{ secrets.PLANGUARD_AI_API_KEY }} # OpenRouter key
          model: anthropic/claude-your-enabled-model-id
          plan-json-path: plan-artifact/planguard-sanitized-plan.json
          api-url: https://openrouter.ai/api/v1/chat/completions
```

For example, to use xAI, replace the explanation Action inputs with:

```yaml
      - uses: Theorvane/planguard@v1
        with:
          api-key: ${{ secrets.PLANGUARD_AI_API_KEY }}
          model: your-enabled-grok-model-id
          plan-json-path: plan-artifact/planguard-sanitized-plan.json
          api-url: https://api.x.ai/v1/chat/completions
```

Provider model catalogs, account access, quotas, regional availability, and pricing are controlled by the provider and can change independently of PlanGuard. This table documents API-shape compatibility, not a guarantee that every model offered by a provider is available to every account. Use a non-production plan first when onboarding a new provider.

Official provider references: [OpenAI Chat Completions](https://developers.openai.com/api/reference/chat-completions/overview), [Google Gemini OpenAI compatibility](https://ai.google.dev/gemini-api/docs/openai), [Anthropic API getting started](https://docs.anthropic.com/api/getting-started), [OpenRouter models](https://openrouter.ai/docs/guides/overview/models), [xAI Chat API](https://docs.x.ai/developers/rest-api-reference/inference/chat.md), [OpenRouter Chat Completions](https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion), [Groq OpenAI compatibility](https://console.groq.com/docs/openai), [Together AI compatibility](https://docs.together.ai/docs/inference/openai-compatibility), [Mistral Chat Completions](https://docs.mistral.ai/studio-api/conversations/chat-completion), and [DeepSeek API compatibility](https://api-docs.deepseek.com/).

## Security model and limitations

The supplied workflow uses `workflow_dispatch` only and explicitly checks out the default branch. Do not change it to run modified PR Terraform beside cloud credentials or an AI secret. In particular, adding `pull_request_target` is unsafe because it can expose secrets to unreviewed code.

The PlanGuard AI explanation **does not decide approval, deployment, risk score, or policy verdict**. Keep High/Critical blocking decisions in deterministic code and separate CI gates. Terraform values that Terraform does not mark as `sensitive` can remain in a plan, so review the data you send to an AI provider against your organization's security policy.

OpenAI-compatible endpoints currently require a public IPv4 DNS answer for an HTTPS hostname. IPv6-only endpoints are not supported.

## References

- [Release: v1.0.0](https://github.com/Theorvane/planguard/releases/tag/v1.0.0)
- [Complete workflow example](examples/workflows/ai-terraform-review.yml)
- [Marketplace publishing and release operations](docs/marketplace/README.md)
- [Product plan](docs/PRODUCT_PLAN.md) (Korean)
- [Developer and agent guidance](AGENTS.md)

## Development verification

```bash
npm ci
npm run typecheck
npm run test
npm run harness
```
