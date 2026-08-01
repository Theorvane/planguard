# PlanGuard

> Understand infrastructure changes before they reach production.

Terraform Pull Request의 변경사항을 분석하여 보안, 가용성, 비용, 운영 위험을 검토하고 GitHub Check로 승인 판단을 제공하는 AI 인프라 리뷰 앱.

## 문서

* [제품 기획안](docs/PRODUCT_PLAN.md)
* [AGENTS.md](AGENTS.md) — 이 저장소에서 작업하는 AI 코딩 에이전트용 가이드

## 저장소 구조

[섹션 22](docs/PRODUCT_PLAN.md#22-프로젝트-저장소-구성) 기준 스켈레톤. 각 폴더의 `README.md`에 스펙 링크와 구현 상태가 있다.

```text
apps/            web · api · worker (모두 미구현 — worker 프로토타입은 .agents/ 참고)
packages/        terraform-parser · policy-engine · risk-engine · github-client · schemas
actions/analyze  사용자 CI에서 terraform plan을 생성해 업로드하는 GitHub Action
policies/aws     PlanGuard 기본 AWS 정책
fixtures/        terraform-plans (예정) · review-fixture.json (.agents/ 하네스용)
docs/            installation · security · marketplace
infrastructure/  PlanGuard 자체 서비스 배포용 Terraform
.agents/         제품 AI 리뷰 하네스와 개발용 안전 하네스 (npm run harness 실행 가능)
```

## 제품 경계

```text
PlanGuard는 Terraform을 대신 적용하지 않는다.
PlanGuard는 사람이 안전하게 승인하도록 돕는다.
```

## 현재 상태

기획 단계. 저장소 구조와 구현은 [개발 단계](docs/PRODUCT_PLAN.md#20-개발-단계)를 따라 진행 예정.
