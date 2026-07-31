# packages/risk-engine

규칙 기반으로 Overall Risk Score(Security 30% + Availability 30% + Destructiveness 20% + Blast radius 15% + Cost impact 5%)를
계산하고 등급(Low/Moderate/High/Critical)과 기본 Check 결과를 결정한다. LLM은 이 계산에 관여하지 않는다.

- 스펙: [docs/PRODUCT_PLAN.md #6.6 Risk Score](../../docs/PRODUCT_PLAN.md#66-risk-score)
- 원칙: [docs/PRODUCT_PLAN.md #3.1](../../docs/PRODUCT_PLAN.md#31-ai가-아닌-근거가-중심), [AGENTS.md](../../AGENTS.md)
- 상태: 미구현 (Phase 1)
