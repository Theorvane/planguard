# Publishing PlanGuard on GitHub Marketplace

PlanGuard publishes **PlanGuard BYO-AI Explanation** as a GitHub Marketplace Action. It is a composite wrapper
for `actions/ai-review`, so consumers can use the repository root reference:

```yaml
- uses: Theorvane/planguard@v1
  with:
    api-key: ${{ secrets.PLANGUARD_AI_API_KEY }}
    model: gpt-4.1-mini
    plan-json-path: plan-artifact/planguard-sanitized-plan.json
```

The Action accepts only a Terraform-sensitive-value-redacted plan artifact. It does not execute Terraform,
calculate a policy/risk verdict, approve a deployment, or expose an API key to a Terraform process.

## First publication

1. Ensure `main` contains the release commit and all required checks have passed.
2. Open [`action.yml`](../../action.yml) in the GitHub repository. GitHub shows the **Publish this Action to the
   GitHub Marketplace** banner for an eligible public repository.
3. Select **Draft a release** and create `v1.0.0` from the reviewed commit.
4. On the release page, select **Publish this Action to the GitHub Marketplace**.
5. Provide the Marketplace category **Code quality** and use the Action metadata/branding from `action.yml`.
6. Publish the release. GitHub validates the Marketplace metadata before listing it.
7. After publication, create the moving major tag `v1` at the same reviewed release commit. Consumers should use
   `@v1`; security-sensitive consumers may instead pin the full commit SHA.

GitHub publishes Marketplace Actions through a release; do not claim the Action is listed until the release page
confirms publication.

## Release checklist

- [ ] `npm ci`
- [ ] `npm run typecheck`
- [ ] `npm run test`
- [ ] `npm run harness`
- [ ] `git diff --check`
- [ ] Verify `action.yml` is at repository root, has `name`, `description`, `runs`, and valid `branding`.
- [ ] Verify the example workflow still separates trusted Terraform preparation from the secret-bearing AI job.
- [ ] Create an immutable semver release tag, then update the `v1` major tag only after review.
- [ ] Publish from GitHub's release UI; the publisher must confirm GitHub's Marketplace terms.

## Consumer safety

Use the supplied [BYO-AI workflow example](../../examples/workflows/ai-terraform-review.yml) as the secure
default. It follows the same two-job boundary as the Marketplace Action: trusted Terraform preparation produces a
sanitized artifact, and a separate secret-bearing job sends only that artifact to the AI provider. The example
pins a full commit SHA for maximum supply-chain control; after publication, consumers can replace only its
explanation step with `Theorvane/planguard@v1`. Do not add `pull_request_target`, do not execute unreviewed
Terraform beside cloud credentials, and keep the AI API key in an Actions secret.

Authoritative GitHub documentation: <https://docs.github.com/en/actions/how-tos/create-and-publish-actions/publish-in-github-marketplace>
