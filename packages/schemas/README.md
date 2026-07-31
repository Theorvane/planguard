# packages/schemas

Installation, Repository, Review, ResourceChange, Finding, Exception, Subscription 등 핵심 엔터티의 공유 타입/스키마.
`apps/*`와 `.agents/types.ts`가 이 패키지를 참조하게 된다.

- 스펙: [docs/PRODUCT_PLAN.md #14 데이터 모델](../../docs/PRODUCT_PLAN.md#14-데이터-모델)
- 상태: `ResourceChange`/`ChangedField`/`Finding`/`HistoricalRiskMatch`/`ReviewContext` 구현됨.
  `.agents/types.ts`는 이제 이 패키지를 재수출만 한다. `packages/terraform-parser`가 첫 소비자.
  Installation/Repository/Review/Exception/Subscription 엔터티는 아직 없음 — Phase 2(GitHub App)에서 추가.
