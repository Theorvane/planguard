# fixtures/terraform-plans

`terraform show -json` 출력 샘플(plan JSON)을 리소스 타입별로 모아 `packages/terraform-parser`와
`packages/risk-engine` 테스트에 사용한다.

- 완료 기준: [Phase 1](../../docs/PRODUCT_PLAN.md#phase-1-분석-엔진) — 대표 AWS 리소스 12종 커버
- MVP 대상 리소스: [docs/PRODUCT_PLAN.md #19 MVP 지원 리소스](../../docs/PRODUCT_PLAN.md#mvp-지원-리소스)
- 상태: 비어 있음. `../review-fixture.json`은 별개로, `.agents/` 하네스가 쓰는 사후-분석 결과(findings) 픽스처다.
