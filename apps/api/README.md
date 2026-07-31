# apps/api

PlanGuard Core API. GitHub 웹훅을 받아 분석을 실행하고 Check Run을 갱신한다.
지금까지의 패키지는 전부 라이브러리였고, **이 앱이 저장소에서 처음으로 실제 실행되는 서비스**다.

- 스펙: [docs/PRODUCT_PLAN.md #8 시스템 구성](../../docs/PRODUCT_PLAN.md#8-시스템-구성), [#10 GitHub App 권한](../../docs/PRODUCT_PLAN.md#10-github-app-권한)
- 스택: `node:http`. 기획안은 NestJS를 권장하지만, 서명 검증에 raw body 접근이 필수라 프레임워크의
  자동 body 파싱이 오히려 방해가 된다. 핸들러를 순수 함수로 분리해뒀으므로 나중에 NestJS로 감싸도 된다.

## 엔드포인트

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/healthz` | 헬스 체크 |
| POST | `/webhooks/github` | 서명 검증 → 이벤트 라우팅 → queued Check Run 생성 |

## 실행

```bash
npm start -w @planguard/api
```

필요한 환경변수는 [docs/installation](../../docs/installation/README.md) 참고.
**하나라도 없으면 기동 자체가 실패한다** — webhook secret이 없을 때 검증을 건너뛰는 fallback은 없다.
그런 fallback이 있으면 누구나 웹훅을 위조해 임의 저장소의 Check를 조작할 수 있다.

## 설계 메모

**서명 검증은 파싱보다 먼저 한다.** `handleWebhook`은 raw body로 서명을 확인한 뒤에야 JSON을
파싱한다. 순서가 바뀌면 공격자가 통제하는 JSON을 먼저 신뢰하게 된다. 위조 서명일 때 GitHub API
호출이 0건인지 검증하는 테스트로 이 순서를 고정했다.

**핸들러는 순수 함수다.** `handleWebhook(request, deps)`는 HTTP 서버 없이 호출 가능하고,
`clientForInstallation`이 주입식이라 네트워크 없이 라우팅 전체를 테스트한다. `server.ts`는 얇은 래퍼다.

**중복 delivery 방지는 현재 in-memory다.** GitHub이 재전송하면 같은 커밋에 Check Run이 두 번
생기므로 `DeliveryLog`로 막는다. 다만 프로세스 메모리라 재시작하면 잊고, 인스턴스가 2개면 공유되지
않는다. 복제 전에 Redis(기획안이 이미 예정한 저장소)로 교체해야 한다.

## 알려진 한계

**policy-engine이 없어 점수가 구조적 위험만 반영한다.** Security·Availability 축이 가중치의 60%인데
findings를 만들 주체가 아직 없다. 따라서 현재 모든 분석은 실제보다 낮은 점수를 낸다.
숨기지 않고 Check summary에 경고(`NO_POLICY_ENGINE_NOTICE`)를 넣는다 — 통과했다고 보안 검토를
통과한 게 아니다.

**아직 없는 것**: plan JSON 업로드 엔드포인트(`POST /v1/analyses`), 영속 저장소, 설치 상태 관리,
`.planguard.yml` 로딩. `runAnalysis()`는 구현·테스트되어 있으나 호출할 업로드 경로가 없어
웹훅은 queued Check Run 생성까지만 한다.

```bash
npm run test -w @planguard/api
```
