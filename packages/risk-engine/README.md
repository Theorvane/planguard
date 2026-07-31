# packages/risk-engine

규칙 기반으로 Overall Risk Score(Security 30% + Availability 30% + Destructiveness 20% + Blast radius 15% + Cost impact 5%)를
계산하고 등급(Low/Moderate/High/Critical)과 기본 Check 결과를 결정한다. LLM은 이 계산에 관여하지 않는다.

- 스펙: [docs/PRODUCT_PLAN.md #6.6 Risk Score](../../docs/PRODUCT_PLAN.md#66-risk-score)
- 원칙: [docs/PRODUCT_PLAN.md #3.1](../../docs/PRODUCT_PLAN.md#31-ai가-아닌-근거가-중심), [AGENTS.md](../../AGENTS.md)

## 상태

`calculateRisk(input, config?)` 구현됨. 동일 입력 + 동일 config면 항상 동일 결과를 반환한다.

점수만이 아니라 축별 `breakdown`(점수 + 그 점수가 나온 이유 문장)을 함께 반환한다.
사용자에게 보여줄 모든 숫자는 규칙으로 역추적 가능해야 하기 때문이다([#3.1](../../docs/PRODUCT_PLAN.md#31-ai가-아닌-근거가-중심)).

### 구현 중 발견한 설계 보완 두 가지

기획안 #6.6의 가중합만으로는 표현할 수 없는 동작이 있어 규칙을 추가했다. 둘 다 테스트로 고정되어 있다.

**1. Severity floor (추가함)**

가중치상 Security·Availability는 각각 30%다. 즉 한 축이 만점(100)을 받아도 30점만 기여하는데
High 임계값은 40이다. **따라서 가중합만으로는 critical 하나짜리 변경을 절대 차단할 수 없다** —
시나리오 C("RDS Multi-AZ 비활성화 → Check 실패")와 정면으로 충돌한다.

그래서 `severityFloors`를 뒀다: `high` 발견은 최소 High, `critical` 발견은 최소 Critical 등급을
강제한다. 등급을 올리기만 하고 내리지는 않는다. 이때 `escalation` 필드에 어떤 발견이 등급을
올렸는지 기록해서, 사용자가 "점수는 37인데 왜 Critical인가"를 알 수 있게 한다.

환경별 차등(#7: dev는 Moderate, production은 Critical)은 이 floor를 끄는 방식이 아니라
**policy-engine이 환경에 따라 severity를 다르게 매기는 방식**으로 구현한다.

**2. Findings가 없으면 최고 등급에 도달하지 못함 (의도된 성질로 확정)**

발견이 하나도 없을 때 쓸 수 있는 축은 Destructiveness(20) + Blast radius(15) + Cost(5) = 최대 40점,
즉 정확히 High 하한이며 Critical에는 결코 닿지 않는다. 리소스 40개를 지워도 마찬가지다.
정책이 아무것도 지적하지 않은 변경은 의도된 것으로 보고 경고까지만 한다는 뜻이다.
삭제 자체를 더 무겁게 다루려면 `thresholds`를 낮추거나 policy-engine이 발견을 내야 한다.

```bash
npm run test -w @planguard/risk-engine
```
