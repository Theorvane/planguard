# apps/worker

Analysis Worker. Terraform Plan Parser, Checkov Runner, Cost Estimator, Dependency Analyzer, 그리고 AI 리뷰 에이전트를 실행한다.

- 스펙: [docs/PRODUCT_PLAN.md #8 시스템 구성](../../docs/PRODUCT_PLAN.md#8-시스템-구성), [#11 type-chain 워크플로](../../docs/PRODUCT_PLAN.md#11-type-chain-워크플로)
- 권장 스택: Node.js + TypeScript, type-chain (LangChain JS 기반)
- 상태: AI 리뷰 에이전트 프로토타입은 현재 저장소 루트의 [`.agents/`](../../.agents/) 하네스에 있다.
  이 앱이 결정론적 분석 단계(파서·정책·비용·위험 점수)까지 갖추게 되면 `.agents/`를 이 아래로
  옮긴다. 자세한 경계 규칙은 [AGENTS.md](../../AGENTS.md) 참고.
