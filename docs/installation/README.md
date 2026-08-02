# PlanGuard public hosting and GitHub App registration

This runbook takes PlanGuard from this public repository to an installable GitHub App without
prescribing a hosting provider. The chosen provider must run the repository's production
`Dockerfile`, expose a public HTTPS URL, and provide encrypted environment variables.

## Hosting requirements

Choose a provider that meets all of these requirements:

- Public HTTPS endpoint with a stable URL, used as `API_URL` below.
- Docker build from the repository root (`Dockerfile`) and the platform-provided `PORT` environment variable.
- Encrypted configuration for secrets; never commit an `.env`, private-key PEM, webhook secret, or upload token.
- An always-on or reliably wakeable web service. If a free tier sleeps, test GitHub webhook retry and cold-start
  behavior before making the App publicly installable.

## Security boundary

- Bootstrap mode serves only `GET /healthz`; it returns `503` for webhooks and plan uploads.
- Active mode requires all four secrets below; startup fails if any are missing.
- GitHub webhook SSL verification remains enabled.

## 1. Deploy the bootstrap service

1. Create a web service from `sjungwon03/planguard` using the repository `Dockerfile`.
2. Configure these non-secret environment variables:

   | Key | Value |
   | --- | --- |
   | `PLANGUARD_BOOTSTRAP_MODE` | `true` |
   | `NODE_ENV` | `production` |

3. Deploy it and record its generated public HTTPS URL as `API_URL`. Verify:

   ```bash
   curl --fail "$API_URL/healthz"
   # {"status":"bootstrap"}
   ```

The public URL is needed before the GitHub App can have a valid webhook destination.

## 2. Register the GitHub App

1. Open `https://github.com/settings/apps/new` while logged in as `sjungwon03`.
2. Set the App name to **PlanGuard** (or an available unique variant), Homepage URL to
   `https://github.com/sjungwon03/planguard`, and webhook URL to:

   ```text
   API_URL/webhooks/github
   ```

3. Enable **Active** webhooks and keep SSL verification enabled.
4. Copy the repository permissions and events from `app-manifest.json` exactly:
   Metadata read, Contents read, Pull requests read, Checks write, Actions read; and the
   `installation`, `installation_repositories`, `pull_request`, `push`, `check_run` events.
5. Generate a webhook secret, then create the app. On the app settings page, generate and download a
   private key. Record its App ID.

## 3. Activate PlanGuard at the hosting provider

In the provider's encrypted service environment, replace the bootstrap setting and add these secrets:

| Key | Value |
| --- | --- |
| `PLANGUARD_BOOTSTRAP_MODE` | `false` (or remove it) |
| `PLANGUARD_GITHUB_APP_ID` | App ID from GitHub |
| `PLANGUARD_GITHUB_PRIVATE_KEY` | full PEM contents; escaped `\n` is also supported |
| `PLANGUARD_GITHUB_WEBHOOK_SECRET` | secret created in GitHub |
| `PLANGUARD_API_TOKEN` | a fresh high-entropy token generated locally |

Generate the upload token without putting it in shell history:

```bash
openssl rand -base64 48
```

Redeploy, then verify:

```bash
curl --fail "$API_URL/healthz"
# {"status":"ok"}
```

## 4. Install and verify the App

1. In the GitHub App settings page choose **Public page → Make public** when the App is ready for general
   installation. Until then, install it only on selected test repositories.
2. Install the App and select only repositories that need PlanGuard.
3. On an installed Terraform repository, add the action. Save `PLANGUARD_API_TOKEN` as a repository or
   organization Actions secret; never put it in YAML:

   ```yaml
   - uses: sjungwon03/planguard/actions/analyze@main
     with:
       api-url: API_URL
       api-token: ${{ secrets.PLANGUARD_API_TOKEN }}
       working-directory: infrastructure
   ```

4. Open a test pull request and confirm GitHub shows a queued/completed **PlanGuard / Infrastructure Review**
   check. In the GitHub App's Advanced page, inspect webhook deliveries; a valid delivery returns `2xx`.

## Operational checks and rollback

- Hosting health failure: restore `PLANGUARD_BOOTSTRAP_MODE=true` and redeploy. This closes analysis endpoints
  while keeping the public health URL stable.
- Suspected secret exposure: rotate the GitHub App private key, webhook secret, and `PLANGUARD_API_TOKEN`;
  update the hosting provider and all affected GitHub Actions secrets together.
- Do not disable webhook signature verification. A missing secret is deliberately a startup error in active mode.
