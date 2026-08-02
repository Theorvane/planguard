# PlanGuard

> GitHub Actions에서 Terraform 변경 내용을 안전하게 검토하고, 선택적으로 자신의 AI provider로 설명을 받으세요.

[![Release](https://img.shields.io/github/v/release/sjungwon03/planguard?display_name=tag&sort=semver)](https://github.com/sjungwon03/planguard/releases/latest)

PlanGuard는 Terraform plan을 분석해 변경 내용을 검토하기 위한 GitHub Actions 도구입니다. 호스팅된 PlanGuard 서버, Render, GitHub App 없이 각 저장소의 GitHub runner에서 실행됩니다. AI 설명은 선택 사항이며, API key는 사용자의 GitHub Actions Secret에서만 공급합니다.

## 무엇을 제공하나요?

PlanGuard는 두 가지를 분리합니다. **결정론적 정책·risk·pass/fail 판단**은 코드가 계산해야 하는 영역이며, AI가 결과를 바꾸지 않습니다. **AI 설명**은 민감 값이 제거된 Terraform plan을 사람이 읽기 쉬운 설명으로 바꾸는 보조 기능입니다.

기본 workflow는 다음 경계를 유지합니다.

```text
신뢰된 기본 브랜치에서 Terraform plan 생성
  → Terraform-sensitive 값 제거
  → 짧은 보존 기간의 sanitized artifact
  → 새 GitHub runner에서 AI 설명 생성
```

Terraform을 실행하는 job에는 AI API key가 전달되지 않습니다. AI key가 있는 job은 Terraform 코드나 provider를 실행하지 않고, sanitized artifact만 읽습니다.

## 빠른 시작

### 1. API key를 GitHub Secret에 저장

대상 repository에서 **Settings → Secrets and variables → Actions → New repository secret**을 열고 다음 secret을 만듭니다.

```text
PLANGUARD_AI_API_KEY
```

OpenAI 또는 OpenAI-compatible API provider의 key를 넣습니다. key를 workflow YAML, Terraform 변수, commit, issue, log에 직접 넣지 마세요.

### 2. workflow 파일 추가

대상 Terraform repository에 `.github/workflows/planguard-ai-review.yml`을 만듭니다. 아래 예제에서 `working-directory`를 Terraform 코드가 있는 경로로 바꾸고, cloud authentication step은 사용하는 provider의 최소 권한·짧은 수명 OIDC 방식으로 추가합니다.

```yaml
name: PlanGuard BYO-AI Terraform Review

# 보안 기본값: PR 코드가 아니라, 검토·병합된 기본 브랜치만 수동 실행합니다.
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

      # 여기에 environment-protected, short-lived, plan-only cloud authentication을 추가합니다.
      # pull_request 또는 pull_request_target trigger를 추가하지 마세요.
      - uses: sjungwon03/planguard/actions/prepare-ai-review@v1
        with:
          working-directory: infrastructure # Terraform 디렉터리로 변경
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

      - uses: sjungwon03/planguard@v1
        with:
          api-key: ${{ secrets.PLANGUARD_AI_API_KEY }}
          model: gpt-4.1-mini
          plan-json-path: plan-artifact/planguard-sanitized-plan.json
          # 다른 OpenAI-compatible provider라면 URL을 지정합니다.
          # api-url: https://your-provider.example/v1/chat/completions
```

`actions/checkout`, `hashicorp/setup-terraform`, artifact Actions는 예제처럼 immutable commit SHA로 고정했습니다. PlanGuard는 안정적인 major tag `@v1`을 제공합니다. 더 엄격한 공급망 통제가 필요하면 [v1.0.0 릴리스](https://github.com/sjungwon03/planguard/releases/tag/v1.0.0)의 immutable commit SHA를 사용하세요.

### 3. 실행 및 결과 확인

변경을 기본 브랜치에 병합한 뒤 repository의 **Actions** 탭에서 **PlanGuard BYO-AI Terraform Review** workflow를 선택하고 **Run workflow**를 누릅니다. 실행이 끝나면 `explain-plan` job의 GitHub Step Summary에 AI 설명이 표시됩니다.

Terraform plan 또는 cloud credential을 AI provider로 보내지 않습니다. AI provider에는 Terraform이 `sensitive`로 표시한 값을 `[REDACTED]`로 바꾼 JSON만 전달됩니다. sanitized artifact는 최대 512 KiB이며, 기본 보존 기간은 1일입니다.

## 입력값

`sjungwon03/planguard@v1`은 다음 입력을 받습니다.

| 입력 | 필수 | 설명 |
| --- | --- | --- |
| `api-key` | 예 | GitHub Actions Secret에서 전달하는 OpenAI-compatible API key |
| `model` | 예 | provider가 지원하는 모델 ID |
| `plan-json-path` | 예 | 별도 trusted job에서 생성한 sanitized Terraform plan JSON 경로 |
| `api-url` | 아니오 | OpenAI-compatible chat completions URL. 기본값은 OpenAI endpoint |

`api-url`은 HTTPS hostname만 허용합니다. URL의 query, fragment, embedded credential, IP literal은 거부하며, private/local address로의 연결도 허용하지 않습니다.

## 보안 모델과 제한사항

이 workflow는 `workflow_dispatch`만 사용하고 기본 브랜치를 명시적으로 checkout합니다. PR에서 변경된 Terraform을 cloud credential 또는 AI secret과 함께 실행하는 workflow로 바꾸지 마세요. 특히 `pull_request_target`을 추가하면 unreviewed code가 secret에 접근할 수 있어 안전하지 않습니다.

PlanGuard의 AI 설명은 **승인, 배포, risk score, policy verdict을 결정하지 않습니다**. High/Critical 차단 같은 정책 판단은 반드시 결정론적 코드와 별도 CI gate로 유지하세요. Terraform이 `sensitive`로 표시하지 않은 값은 plan에 남을 수 있으므로, AI provider로 보낼 데이터 범위를 조직의 보안 정책에 맞게 검토해야 합니다.

현재 OpenAI-compatible endpoint는 public IPv4 DNS 응답이 있는 HTTPS hostname만 지원합니다. IPv6-only endpoint는 지원하지 않습니다.

## 참고 자료

- [릴리스: v1.0.0](https://github.com/sjungwon03/planguard/releases/tag/v1.0.0)
- [전체 workflow 예제](examples/workflows/ai-terraform-review.yml)
- [Marketplace 게시 및 릴리스 운영 가이드](docs/marketplace/README.md)
- [제품 계획](docs/PRODUCT_PLAN.md) (Korean)
- [개발자/에이전트 가이드](AGENTS.md)

## 개발 검증

```bash
npm ci
npm run typecheck
npm run test
npm run harness
```
