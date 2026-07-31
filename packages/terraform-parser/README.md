# packages/terraform-parser

Terraform plan JSON(`terraform show -json`)을 읽어 리소스 변경(create/update/delete/replace/read/no-op)과
필드 단위 diff, 교체 여부를 구조화한다.

- 스펙: [docs/PRODUCT_PLAN.md #6.1 Terraform Change Review](../../docs/PRODUCT_PLAN.md#61-terraform-change-review)
- 완료 기준: [Phase 1](../../docs/PRODUCT_PLAN.md#phase-1-분석-엔진) — 대표 AWS 리소스 12종, 변경 분석 정확도 95% 이상
- 상태: 미구현 (Phase 1 — 가장 먼저 구현할 패키지)
