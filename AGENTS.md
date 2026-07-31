# AGENTS.md

Instructions for AI coding agents (and humans) working in this repository.

## What this repo is

PlanGuard reviews Terraform pull requests and publishes GitHub Checks covering security,
availability, cost, and deployment risk. Full product spec: [docs/PRODUCT_PLAN.md](docs/PRODUCT_PLAN.md).

## The one rule that overrides everything else

**Risk scores, policy pass/fail, and cost numbers are computed by deterministic code, never by an LLM.**
LLMs may only summarize, explain, and connect findings that deterministic code already produced.
See [docs/PRODUCT_PLAN.md #3.1](docs/PRODUCT_PLAN.md#31-ai가-아닌-근거가-중심) before adding any
AI-generated value to a code path that affects the Check verdict.

Concretely, when adding a tool or agent under `.agents/`:
- A `@Tool()` method may only *read* and return data that was already computed elsewhere
  (parsed plan, Checkov output, rule-engine score, cost estimate). It must not itself decide
  severity, risk grade, or pass/fail.
- Any agent-generated claim that isn't a direct pass-through of a tool result must be labeled
  "Needs verification" in the output, per [docs/PRODUCT_PLAN.md #6.2](docs/PRODUCT_PLAN.md#62-security-review).

Three directories, three different jobs: `packages/*` is deterministic analysis code (the actual
source of risk scores and findings). `.agents/` is PlanGuard's own product AI code (the
type-chain agent that explains what `packages/*` already computed). `.claude/` is dev tooling for
AI coding agents working *on* this repo (hooks, subagents) — never runtime code, never shipped.

This is an npm workspace (`packages/*`). From the repo root: `npm run typecheck` and `npm run
test` build and check every workspace package before checking/testing the root harness. A single
package: `npm run test -w @planguard/terraform-parser`.

## Agent harness (`.agents/`)

This directory holds the [type-chain](https://github.com/Theorvane/type-chain)
(`@theorvane/type-chain`, a decorator-first authoring layer over LangChain JS) agent(s) used for
the one AI-reasoning node in the review pipeline (`generate_explanation` in
[docs/PRODUCT_PLAN.md #11](docs/PRODUCT_PLAN.md#11-type-chain-워크플로)). Everything upstream of
that node (plan parsing, Checkov, policy checks, risk scoring) is plain deterministic TypeScript
and does not belong in `.agents/`.

- `types.ts` — shared `ReviewContext` shape (resource changes + findings by category).
- `review-explanation-agent.ts` — the `@Agent()`-decorated class; each `@Tool()` method exposes
  one category of deterministic findings to the model.
- `harness.ts` — runnable entry point. Wires the agent, prints registered tool names, and (only
  if `PLANGUARD_MODEL` is set) invokes it live against `fixtures/review-fixture.json`.

Run it:

```bash
npm install
npm run typecheck
npm run harness
```

`npm run harness` always verifies tool wiring without any API key. To actually invoke the model,
copy `.env.example` to `.env`, set `PLANGUARD_MODEL` (a LangChain init-string like
`anthropic:claude-sonnet-5`) and the matching provider API key, then `export` them before running.

## Adding a new analysis category

1. Extend `ReviewContext` in `.agents/types.ts`.
2. Add a `@Tool()` method to `review-explanation-agent.ts` that returns the new field — do not
   compute anything inside the tool.
3. Update `fixtures/review-fixture.json` with a representative example.
4. Run `npm run typecheck && npm run harness` before committing.

## Claude Code harness (`.claude/`)

Dev-tooling only — guards the AI coding agent working on this repo, not PlanGuard's product code.

- `.claude/settings.json` — allow-lists the harness's own commands (`npm run harness`, `git
  status`, `gh pr *`, ...) and denies reading `.env`, `*.pem`, `*.tfstate`, `*.tfvars`, and
  `.aws/credentials` outright.
- `.claude/hooks/block-secrets.sh` — a `PreToolUse(Bash)` hook that tokenizes commands with
  `python3`/`shlex` (not raw regex, to resist `rm -r -f`/`git add .`-style bypasses) and blocks
  destructive `rm -r`, exposure (`cat`/`curl`/...) of `.env`/`*.pem`/`id_rsa*`/`*.tfstate`/
  `*.tfvars`/`.aws/credentials`, and `git add` that would actually stage one. This exists because
  PlanGuard's own product handles exactly this kind of sensitive data (see
  [docs/PRODUCT_PLAN.md #15](docs/PRODUCT_PLAN.md#15-보안-및-개인정보-보호)) — the repo enforces
  on itself what the product promises to enforce for users.
- `.claude/agents/risk-boundary-reviewer.md` — a review-only subagent for the rule above: run it
  after any change to `.agents/*.ts` to check no `@Tool()` method or prompt string computes a
  severity, score, or pass/fail itself.

## Git workflow

- No commits directly on `main`. Every change: open a GitHub issue first, branch off `main` as
  `<type>/<issue-number>-<short-slug>` (e.g. `feat/9-cost-estimator`), open a PR against `main`
  with `Closes #<issue-number>` in the body, and merge via `gh pr merge --merge --delete-branch`.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):
  `<type>: <subject>`, imperative mood, no period. Types used in this repo: `feat`, `fix`,
  `docs`, `chore`, `refactor`, `test`. Body explains *why* when it isn't obvious; footer carries
  `Closes #<issue-number>`.
- Merge, don't rebase/squash, once a PR is up — keeps `git log` matching the PR history 1:1.

## Conventions

- TypeScript, ESM (`"type": "module"`), standard (Stage 3) decorators —
  `experimentalDecorators` must stay `false` (type-chain requirement).
- Don't commit `dist/`, `node_modules/`, or `.env` (see `.gitignore`).
- Prefer editing existing files under `.agents/` over creating new top-level agent
  directories; the repo layout in [docs/PRODUCT_PLAN.md #22](docs/PRODUCT_PLAN.md#22-프로젝트-저장소-구성)
  is the target shape once this grows beyond one agent.
