# packages/github-client

GitHub App 인증(Installation Token), 웹훅 처리, Check Run 생성/업데이트, PR 조회를 담당하는 공용 클라이언트.

- 스펙: [docs/PRODUCT_PLAN.md #10 GitHub App 권한](../../docs/PRODUCT_PLAN.md#10-github-app-권한), [#6.7 GitHub Check](../../docs/PRODUCT_PLAN.md#67-github-check)
- 완료 기준: [Phase 2](../../docs/PRODUCT_PLAN.md#phase-2-github-app) — 설치 후 첫 PR 분석까지 5분 이내, 앱 삭제 시 모든 후속 요청 차단

## 상태

구현됨:

- `verifyWebhookSignature()` — `X-Hub-Signature-256` 검증. **페이로드를 파싱하기 전에 반드시 호출한다.**
  위조된 웹훅이 분석이나 Check Run 업데이트를 트리거하는 것을 막는 유일한 방어선이다.
- `getInstallationToken()` — App private key로 단기 installation token을 발급한다
  ([#15](../../docs/PRODUCT_PLAN.md#15-보안-및-개인정보-보호)). 캐싱하지 말고 필요할 때마다 다시 발급받는다.
- `shouldAnalyzePullRequest()` / `shouldReanalyze()` — `opened`/`synchronize`/`reopened`에서만 분석하고,
  재분석은 PlanGuard 자신의 Check Run에 대한 `rerequested`에만 반응한다(다른 앱의 Check는 무시).
- `createQueuedCheckRun()` / `completeCheckRun()` / `buildCheckRunSummary()` — [#6.7](../../docs/PRODUCT_PLAN.md#67-github-check) 형식의 Check Run 생성·완료.

아직 없음: 설치/제거 웹훅 처리, PR 변경 파일 조회, Actions artifact 조회, 중복 이벤트 방지.

GitHub App 실제 등록 방법은 [docs/installation](../../docs/installation/README.md) 참고.

```bash
npm run test -w @planguard/github-client
```
