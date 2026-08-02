# PlanGuard public deployment and GitHub App registration

This runbook takes PlanGuard from this public repository to an installable GitHub App. It intentionally
uses a **health-only bootstrap deployment** first, so no fabricated GitHub App credentials are deployed.

## Security boundary

- Bootstrap mode serves only `GET /healthz`; it returns `503` for webhooks and plan uploads.
- Active mode requires all four secrets below; startup fails if any are missing.
- Store values in Render's encrypted environment settings only. Do not commit a `.pem`, `.env`,
  webhook secret, or upload token.
- GitHub webhook SSL verification remains enabled.

## 1. Deploy the bootstrap service in Render

1. Sign in at [Render](https://dashboard.render.com/) using the `sjungwon03` GitHub account.
2. Select **New → Blueprint**, choose `sjungwon03/planguard`, branch `main`, and approve `render.yaml`.
3. Wait for the `planguard-api` service to become live. Record its generated HTTPS URL, called `API_URL`
   below. Verify in a browser or terminal:

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

## 3. Activate PlanGuard in Render

In **Render → planguard-api → Environment**, replace the bootstrap setting and add these secrets:

| Key | Value |
| --- | --- |
| `PLANGUARD_BOOTSTRAP_MODE` | `false` (or remove it) |
| `PLANGUARD_GITHUB_APP_ID` | App ID from GitHub |
| `PLANGUARD_GITHUB_PRIVATE_KEY` | full PEM contents; Render may use real newlines or `\\n` escapes |
| `PLANGUARD_GITHUB_WEBHOOK_SECRET` | secret created in GitHub |
| `PLANGUARD_API_TOKEN` | a fresh high-entropy token generated locally |

Generate the upload token without putting it in shell history:

```bash
openssl rand -base64 48
```

Save the configuration. Render redeploys automatically. Then verify:

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

- Render health failure: inspect Render logs, restore `PLANGUARD_BOOTSTRAP_MODE=true`, and redeploy. This
  closes analysis endpoints while keeping the public health URL stable.
- Suspected secret exposure: rotate the GitHub App private key, webhook secret, and `PLANGUARD_API_TOKEN`;
  update Render and all affected GitHub Actions secrets together.
- Do not disable webhook signature verification. A missing secret is deliberately a startup error in active mode.
