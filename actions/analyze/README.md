# actions/analyze

사용자 저장소의 GitHub-hosted 또는 self-hosted runner에서 `terraform init && terraform plan && terraform show -json`을
실행하고 결과를 PlanGuard API에 업로드하는 GitHub Action. AWS 자격 증명은 PlanGuard 서버로 전달되지 않는다.

- 스펙: [docs/PRODUCT_PLAN.md #9 분석 데이터 전달 방식](../../docs/PRODUCT_PLAN.md#9-분석-데이터-전달-방식)
- 상태: 미구현 (Phase 2)
