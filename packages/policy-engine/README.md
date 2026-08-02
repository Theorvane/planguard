# packages/policy-engine

결정론적 PlanGuard 정책 엔진. 정규화된 Terraform `ResourceChange[]`을 받아 `Finding[]`을 반환하며,
LLM, 네트워크 호출, 외부 스캐너 실행, 비용 계산을 수행하지 않는다.

- 스펙: [docs/PRODUCT_PLAN.md #6.2 Security Review](../../docs/PRODUCT_PLAN.md#62-security-review), [#12.4 Policies](../../docs/PRODUCT_PLAN.md#124-policies)
- 구현 상태: Phase 1 MVP

## 현재 AWS 정책

| 정책 ID | 조건 | 결과 |
| --- | --- | --- |
| `PG-SEC-SSH-001` | managed security-group rule이 TCP 22를 `0.0.0.0/0`에 공개 | `security` / `high` |
| `PG-AVAIL-RDS-001` | `aws_db_instance`의 `multi_az`가 `true → false`로 변경 | `availability` / `critical` |

정책은 변경 필드와 parser가 민감정보를 마스킹하여 제공하는 post-change `after` 스냅샷만 읽는다.
모든 finding에는 안정적인 `planguard:<policy-id>` source를 포함한다.

```bash
npm run test -w @planguard/policy-engine
```
