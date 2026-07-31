# packages/terraform-parser

Terraform plan JSON(`terraform show -json`)을 읽어 리소스 변경(create/update/delete/replace/read/no-op)과
필드 단위 diff, 교체 여부를 구조화한다.

- 스펙: [docs/PRODUCT_PLAN.md #6.1 Terraform Change Review](../../docs/PRODUCT_PLAN.md#61-terraform-change-review)
- 완료 기준: [Phase 1](../../docs/PRODUCT_PLAN.md#phase-1-분석-엔진) — 대표 AWS 리소스 12종, 변경 분석 정확도 95% 이상

## 상태

`parseTerraformPlan()` 구현됨: managed 리소스만 남기고(`mode: "data"` 필터링), action을 create/update/delete/replace/read/no-op으로 매핑하고, update·replace에 한해 필드 diff를 계산한다. `before_sensitive`/`after_sensitive`로 표시된 필드는 값 대신 `(sensitive value hidden)`으로 치환한다(`docs/PRODUCT_PLAN.md #15`). `after_unknown`이 `true`인 필드는 apply 전까지 값을 알 수 없으므로 diff에서 제외한다.

아직 대표 리소스 12종 중 일부(RDS, Security Group, S3, EC2)만 픽스처로 커버됨 — 나머지 MVP 리소스는 `fixtures/terraform-plans/`에 추가하며 확장한다.

```bash
npm run test -w @planguard/terraform-parser
```
