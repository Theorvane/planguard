# packages/schemas

Installation, Repository, Review, ResourceChange, Finding, Exception, Subscription 등 핵심 엔터티의 공유 타입/스키마.
`apps/*`와 `.agents/types.ts`가 이 패키지를 참조하게 된다.

- 스펙: [docs/PRODUCT_PLAN.md #14 데이터 모델](../../docs/PRODUCT_PLAN.md#14-데이터-모델)
- 상태: 미구현. 현재는 `.agents/types.ts`에 임시로 `ReviewContext` 타입이 로컬 정의되어 있음 — 이 패키지가
  생기면 그쪽으로 옮긴다.
