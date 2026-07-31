# docs/installation

설치 가이드 (GitHub Marketplace 설치, 저장소 선택, Terraform 경로/환경/정책 설정, 테스트 PR 분석).

- 스펙: [docs/PRODUCT_PLAN.md #5 시나리오 A: 최초 설치](../PRODUCT_PLAN.md#시나리오-a-최초-설치)
- 준비물 목록: [docs/PRODUCT_PLAN.md #17 3단계: Marketplace Free Listing](../PRODUCT_PLAN.md#3단계-marketplace-free-listing)
- 상태: 최종 사용자용 설치 문서는 미작성 (Phase 5). 아래는 개발자가 GitHub App을 직접 등록하기 위한 안내.

## GitHub App 등록 (개발자용)

`app-manifest.json`은 [docs/PRODUCT_PLAN.md #10](../PRODUCT_PLAN.md#10-github-app-권한)의 최소 권한
설계를 그대로 담고 있다. `Issues: write`는 초기 설치 장벽을 낮추기 위해 의도적으로 제외했다 —
결과는 GitHub Check로만 전달한다.

앱 등록은 브라우저에서 사람이 직접 해야 한다:

1. https://github.com/settings/apps/new 에서 새 App을 만들고 `app-manifest.json`의 권한·이벤트를 그대로 설정한다.
   (또는 [App manifest flow](https://docs.github.com/apps/sharing-github-apps/registering-a-github-app-from-a-manifest)로 이 파일을 그대로 POST한다.)
2. Webhook URL을 PlanGuard API의 `/webhooks/github`로 지정하고 **Webhook secret**을 생성한다.
3. 생성 후 **App ID**와 **private key(.pem)** 를 발급받는다.
4. 이 값들을 `.env`에 넣는다 — `.pem`과 `.env`는 절대 커밋하지 않는다
   (`.gitignore`와 `.claude/hooks/block-secrets.sh`가 막는다).

```bash
PLANGUARD_GITHUB_APP_ID=
PLANGUARD_GITHUB_PRIVATE_KEY=
PLANGUARD_GITHUB_WEBHOOK_SECRET=
```

권한을 나중에 확대하면 기존 설치 사용자가 모두 재승인해야 하므로, 등록 전에
[#10 권한 설계](../PRODUCT_PLAN.md#10-github-app-권한)를 다시 확인한다.
