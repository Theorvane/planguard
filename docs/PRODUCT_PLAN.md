# PlanGuard 제품 기획안

## 1. 제품 개요

### 제품명

**PlanGuard**

### 슬로건

> **Understand infrastructure changes before they reach production.**

### 한 줄 소개

> Terraform Pull Request의 변경사항을 분석하여 보안, 가용성, 비용, 운영 위험을 검토하고 GitHub Check로 승인 판단을 제공하는 AI 인프라 리뷰 앱

### 제품 형태

* GitHub App
* GitHub Marketplace 배포
* SaaS 웹 대시보드
* Terraform 분석용 GitHub Action
* LangGraph 기반 AI 리뷰 워크플로

GitHub 밖에서 장시간 분석을 수행하고 저장소별 권한과 웹훅을 사용해야 하므로, PlanGuard는 단순 GitHub Action보다 GitHub App이 중심이 되는 구조가 적합하다. GitHub 역시 주된 기능이 GitHub 외부에서 실행되거나 더 긴 실행 시간과 세밀한 권한이 필요한 서비스에는 GitHub App을 권장한다.

---

# 2. 해결하려는 문제

Terraform PR을 검토하는 팀은 다음 문제를 겪는다.

1. `terraform plan` 출력이 길고 사람이 읽기 어렵다.
2. 리소스 변경이 실제 서비스에 미치는 영향을 알기 어렵다.
3. Checkov 같은 도구는 정책 위반을 찾지만 운영 영향을 충분히 설명하지 않는다.
4. 비용 절감 변경이 가용성 저하로 이어지는지 한눈에 판단하기 어렵다.
5. 인프라 경험이 적은 개발자는 어떤 항목을 확인해야 하는지 모른다.
6. 팀마다 다른 운영 정책과 승인 기준을 일관되게 적용하기 어렵다.
7. 인프라 리뷰 결과가 PR 코멘트에 흩어져 조직의 지식으로 축적되지 않는다.

PlanGuard는 이를 다음 흐름으로 해결한다.

```text
Terraform PR
→ 변경 사실 추출
→ 정책 및 보안 검사
→ 가용성·비용·운영 영향 분석
→ 위험도 계산
→ GitHub Check 게시
→ 승인 또는 수정 요청
→ 변경 이력 축적
```

---

# 3. 핵심 제품 원칙

## 3.1 AI가 아닌 근거가 중심

PlanGuard는 LLM이 임의로 위험도를 결정하지 않는다.

### 결정론적 분석

* 생성·수정·삭제 리소스 분류
* 변경 전후 값 비교
* 리소스 교체 여부
* Checkov 결과
* 정책 위반 여부
* 비용 증감
* 위험 점수
* 승인 정책

### AI 분석

* 여러 변경의 연관 관계 설명
* 예상 운영 영향 요약
* 배포 전 확인사항 생성
* 롤백 계획 생성
* 비전문가가 이해할 수 있는 설명 생성

### 인간이 결정하는 항목

* 최종 위험 수용
* 배포 승인
* 예외 승인
* PR 병합

## 3.2 읽기 전용으로 시작

초기 PlanGuard는 다음 작업을 하지 않는다.

* `terraform apply`
* 리소스 생성·수정·삭제
* PR 자동 병합
* Terraform 코드 자동 커밋

제품의 핵심은 **자동 실행이 아니라 안전한 변경 판단**이다.

## 3.3 GitHub 안에서 결과 확인

사용자가 대시보드에 들어가지 않아도 PR 화면에서 핵심 결과를 확인할 수 있어야 한다.

* GitHub Check
* PR Summary
* Inline Annotation
* 재분석 버튼
* 상세 대시보드 링크

Check Run을 생성하려면 GitHub App의 `Checks: write` 권한이 필요하며, GitHub App은 Check Run 재실행 이벤트도 받을 수 있다.

---

# 4. 목표 사용자

## 1차 타깃

### 소규모 개발팀

* 개발자 3~20명
* Terraform을 사용하지만 전담 보안팀은 없음
* 인프라 리뷰가 특정 한 사람에게 집중됨
* GitHub Actions로 CI/CD 운영

### 초기 스타트업

* AWS 기반 서비스
* Terraform 코드 리뷰 기준이 정립되지 않음
* 비용과 안정성을 동시에 관리해야 함
* DevOps 또는 플랫폼 엔지니어가 1~2명뿐임

### 오픈소스 프로젝트

* Terraform 예제 또는 인프라 모듈 운영
* 외부 기여자의 변경 검증 필요
* 무료 공개 저장소 플랜을 통한 초기 설치 확보

## 2차 타깃

* 플랫폼 엔지니어링 팀
* 클라우드 MSP
* 내부 개발자 플랫폼 운영 조직
* 규정 준수가 필요한 중견기업

## 초기 비타에서는 제외

* 대기업 전사 도입
* 온프레미스 GitHub Enterprise Server
* Azure·GCP 멀티클라우드
* Kubernetes 전체 지원
* Terraform 자동 적용

---

# 5. 사용자 시나리오

## 시나리오 A: 최초 설치

```text
GitHub Marketplace에서 PlanGuard 선택
→ 개인 또는 Organization에 설치
→ 분석할 저장소 선택
→ PlanGuard 웹 대시보드로 이동
→ Terraform 경로 선택
→ 환경과 기본 정책 설정
→ 테스트 PR 분석
```

GitHub App 설치 시 사용자는 앱이 접근할 계정과 저장소를 선택할 수 있다. 따라서 PlanGuard는 조직 전체 권한을 요구하지 않고 선택된 저장소에만 접근하도록 설계한다.

## 시나리오 B: Terraform PR 검토

```text
개발자가 Terraform PR 생성
→ PlanGuard GitHub Check가 queued 상태로 생성
→ Terraform plan JSON 수집
→ 보안·가용성·비용 분석
→ Check 결과 업데이트
→ 개발자가 문제 수정
→ 새 커밋 push
→ 자동 재분석
```

## 시나리오 C: 고위험 변경

```text
RDS Multi-AZ 비활성화 감지
→ High Availability 위험 판정
→ PlanGuard Check 실패
→ PR에 위험 근거와 권고 표시
→ 인프라 담당자가 수정 요청
→ 설정 복구 후 재분석
→ Check 통과
```

## 시나리오 D: 위험 예외 승인

```text
PlanGuard High 판정
→ 담당자가 대시보드에서 예외 사유 입력
→ 승인자 지정
→ 승인자가 예외 승인
→ GitHub Check는 neutral 또는 success 처리
→ 승인자·사유·시각 기록
```

---

# 6. 핵심 기능

## 6.1 Terraform Change Review

Terraform plan JSON을 읽어 리소스 변경을 구조화한다.

### 지원 변경 유형

* Create
* Update
* Delete
* Replace
* Read
* No-op

### 변경별 표시 항목

```json
{
  "resource": "aws_db_instance.production",
  "action": "update",
  "changedFields": [
    {
      "field": "multi_az",
      "before": true,
      "after": false
    }
  ],
  "replacementRequired": false
}
```

### 위험 변화 자동 강조

* 인터넷 공개 범위 확대
* 암호화 해제
* 백업 비활성화
* 삭제 방지 해제
* IAM 권한 확대
* 가용 영역 축소
* 복제본 감소
* 인스턴스 사양 축소
* 로깅 비활성화
* 리소스 삭제 또는 교체

---

## 6.2 Security Review

Checkov와 PlanGuard 자체 정책을 결합한다.

### 출력 예시

```text
HIGH · SSH access exposed to the internet
Resource
aws_security_group.bastion
Change
10.0.0.0/8 → 0.0.0.0/0
Evidence
TCP port 22 is reachable from all IPv4 addresses.
Recommendation
Restrict access to a VPN or trusted administrative CIDR.
```

### 정책 출처 표시

모든 결과에는 다음 중 하나를 표시한다.

* Checkov 정책 ID
* PlanGuard 기본 정책 ID
* 사용자 정의 정책 ID
* 조직 과거 변경 이력
* AI 추론

AI 추론은 반드시 **Needs verification** 라벨을 붙인다.

---

## 6.3 Availability Review

보안 스캐너와 가장 차별화되는 기능이다.

### 주요 분석 항목

#### RDS

* Multi-AZ 비활성화
* 백업 보존기간 감소
* 삭제 방지 해제
* 인스턴스 크기 축소
* 스토리지 유형 변경
* 복제본 제거

#### EC2·Auto Scaling

* 최소 인스턴스 수 감소
* Launch Template 교체
* 인스턴스 타입 축소
* 헬스 체크 유예기간 변경

#### Load Balancer

* Listener 삭제
* Target Group 변경
* 헬스 체크 경로 변경
* 내부·외부 공개 설정 변경

#### Network

* NAT Gateway 삭제
* Route Table 목적지 변경
* Subnet 연결 변경
* Security Group 연결 해제

---

## 6.4 Cost Impact

초기에는 추정 가능한 리소스만 지원한다.

### MVP 지원

* EC2
* RDS
* EBS
* NAT Gateway
* Application Load Balancer
* Elastic IP
* ECS Fargate

### 출력 예시

```text
Estimated monthly change: +$34.20
EC2
t3.medium → m7g.large
Considerations
- Instance architecture may change from x86_64 to arm64.
- Verify container image compatibility.
- Data transfer and discount plans are not included.
```

### 정확도 표시

* High: 고정 단가 중심
* Medium: 사용량 가정 포함
* Low: 요청량·전송량 정보 부족
* Unknown: 추정 불가

비용을 계산할 수 없을 때 임의의 숫자를 생성하지 않는다.

---

## 6.5 Deployment Plan

분석 결과를 바탕으로 배포 체크리스트를 생성한다.

```text
Before deployment
[ ] Verify current RDS snapshot
[ ] Confirm maintenance window
[ ] Confirm application connection retry policy
[ ] Notify service owner

During deployment
[ ] Monitor database connection count
[ ] Monitor application error rate
[ ] Confirm new instance is healthy

Rollback conditions
- Error rate exceeds 5% for 5 minutes
- Database connection failures exceed baseline
- Health check remains unhealthy for 3 minutes

Rollback action
Restore the previous Terraform configuration and re-run the pipeline.
```

실제 명령 실행은 하지 않고 계획만 제공한다.

---

## 6.6 Risk Score

LLM이 아닌 규칙 엔진이 계산한다.

```text
Overall risk =
Security × 30%
+ Availability × 30%
+ Destructiveness × 20%
+ Blast radius × 15%
+ Cost impact × 5%
```

### 등급

|     점수 | 등급       | 기본 Check 결과          |
| -----: | -------- | -------------------- |
|   0–19 | Low      | Success              |
|  20–39 | Moderate | Success with warning |
|  40–69 | High     | Failure               |
| 70–100 | Critical | Failure               |

저장소별로 임계값을 조정할 수 있게 한다.

---

## 6.7 GitHub Check

Check 이름:

```text
PlanGuard / Infrastructure Review
```

### Check Summary

```text
Overall risk: High
12 resources changed
4 created · 6 updated · 2 deleted
Security findings: 2
Availability findings: 3
Estimated monthly change: -$121

Decision
Changes requested
```

### Annotation

가능한 경우 Terraform 파일의 관련 라인에 annotation을 표시한다.

```text
main.tf:24
RDS Multi-AZ is being disabled.
Production databases should retain automatic failover capability.
```

### 사용자 액션

* Re-run analysis
* View full report
* Request exception
* Mark false positive

---

# 7. 제품 차별점

## 경쟁 제품과의 포지셔닝

PlanGuard는 다음 영역 사이에 위치한다.

```text
terraform plan 요약
        ↓
정적 보안 분석
        ↓
PlanGuard
        ↓
인프라 변경 관리·승인
```

## 핵심 차별점

### 1. 코드 품질보다 변경 영향 중심

“이 코드가 올바른가?”가 아니라 다음을 답한다.

> 이 변경을 운영 환경에 적용해도 되는가?

### 2. 보안·비용·가용성 통합

각 도구 결과를 따로 보여주지 않고 하나의 변경 판단으로 합친다.

### 3. 근거가 있는 AI 리뷰

AI 출력마다 분석 근거를 연결한다.

### 4. 조직별 위험 정책

같은 변경이라도 환경에 따라 다르게 처리한다.

```text
Development RDS Multi-AZ disabled
→ Moderate

Production RDS Multi-AZ disabled
→ Critical
```

### 5. Risk Memory

과거 PR과 장애 이력을 활용한다.

```text
A similar capacity reduction in PR #184 caused CPU saturation.
```

---

# 8. 시스템 구성

```text
GitHub
 ├─ GitHub App
 ├─ Pull Request Webhook
 ├─ Check Run
 └─ GitHub Action
          │
          ▼
PlanGuard API
 ├─ Installation Service
 ├─ Repository Service
 ├─ Review Service
 ├─ Policy Engine
 ├─ Billing Service
 └─ GitHub Integration
          │
          ▼
Analysis Worker
 ├─ Terraform Plan Parser
 ├─ Checkov Runner
 ├─ Cost Estimator
 ├─ Dependency Analyzer
 └─ LangGraph Agent
          │
          ▼
Storage
 ├─ PostgreSQL
 ├─ pgvector
 ├─ Redis
 └─ Encrypted Object Storage
```

## 역할 분리

### GitHub App

* 설치 관리
* 웹훅 수신
* GitHub API 인증
* Check Run 생성
* PR 코멘트 작성

### GitHub Action

* 사용자 저장소 환경에서 `terraform plan` 실행
* plan JSON 생성
* PlanGuard에 분석 데이터 전달

### PlanGuard SaaS

* 분석 워크플로 실행
* 정책 관리
* 결과 저장
* 대시보드 제공
* 요금제 사용량 관리

---

# 9. 분석 데이터 전달 방식

## 권장 방식: 사용자 CI에서 Plan 생성

PlanGuard 서버가 사용자의 클라우드 자격 증명을 직접 보관하지 않는다.

```text
GitHub-hosted 또는 self-hosted runner
→ terraform init
→ terraform plan
→ terraform show -json
→ PlanGuard API 업로드
```

### 장점

* AWS 키를 PlanGuard에 제공할 필요 없음
* 기존 Terraform Backend 사용 가능
* Private Module 접근 문제 감소
* 사용자 네트워크 안에서 실행 가능
* SaaS의 보안 부담 감소

## GitHub App 단독 분석

plan artifact가 없는 경우 제한적인 정적 분석만 제공한다.

```text
Analysis mode: Source only
Unavailable
- Resolved variable values
- Exact replacement actions
- Full cost estimation
- Provider-computed values
```

---

# 10. GitHub App 권한

최소 권한 원칙으로 설계한다.

## 필수 저장소 권한

| 권한            | 수준             | 용도                                 |
| ------------- | -------------- | ---------------------------------- |
| Metadata      | Read           | 저장소 기본 정보                          |
| Contents      | Read           | Terraform 파일 조회                    |
| Pull requests | Read           | PR과 변경 파일 조회                       |
| Checks        | Read and write | Check 생성·업데이트                      |
| Actions       | Read           | PlanGuard workflow와 artifact 상태 확인 |

## 선택 권한

| 권한              | 수준    | 용도                    |
| --------------- | ----- | --------------------- |
| Issues          | Write | PR 코멘트 또는 이슈 작성 기능    |
| Commit statuses | Write | Checks를 지원하지 않는 흐름 보완 |
| Members         | Read  | 조직 역할 기반 승인자 확인       |

PR 코멘트가 필수가 아니라면 초기 버전에서는 `Issues: write`를 제외하고 GitHub Check만 사용하는 편이 설치 장벽이 낮다.

GitHub App은 기본적으로 권한이 없으며 필요한 권한만 명시적으로 요청한다. 권한을 나중에 확대하면 기존 설치 사용자가 변경된 권한을 검토하고 승인해야 하므로, 초기 권한 설계가 중요하다.

## 웹훅 이벤트

* `installation`
* `installation_repositories`
* `pull_request`
* `push`
* `check_run`
* `marketplace_purchase`

`pull_request` 이벤트로 PR 생성·수정·재오픈을 감지하고, `check_run`의 `rerequested` 또는 요청 액션을 통해 재분석을 수행한다. GitHub App 웹훅은 저장소의 PR 생성이나 push 같은 이벤트를 실시간으로 받을 수 있다.

---

# 11. LangGraph 워크플로

```text
START
  ↓
validate_event
  ↓
load_repository_config
  ↓
create_check_run
  ↓
collect_analysis_input
  ↓
parse_terraform_plan
  ↓
┌──────────────────────────────┐
│ security_analysis            │
│ availability_analysis        │
│ cost_analysis                │
│ dependency_analysis          │
│ historical_risk_search       │
└──────────────────────────────┘
  ↓
aggregate_findings
  ↓
calculate_deterministic_score
  ↓
generate_explanation
  ↓
validate_output
  ↓
update_check_run
  ↓
┌──────────────────────────────┐
│ Success                      │
│ Warning                      │
│ Failure                      │
│ Exception approval required  │
└──────────────────────────────┘
  ↓
END
```

## Human-in-the-loop 사용 지점

* 예외 승인
* AI 리뷰 게시
* 정책 예외 등록
* False positive 확정
* 조직 정책 변경

일반적인 PR 분석 자체는 자동으로 완료하고, 사람이 반드시 필요한 결정에서만 실행을 중단한다.

---

# 12. 웹 대시보드

## 12.1 Overview

```text
Repositories: 8
Reviews this month: 143
High-risk changes blocked: 17
Estimated monthly cost prevented: $1,240
Average review time: 42 seconds
```

## 12.2 Reviews

| PR                       | Repository | Risk     |  Cost | Status              |
| ------------------------ | ---------- | -------- | ----: | -------------------- |
| #52 Disable RDS Multi-AZ | api-infra  | Critical | -$121 | Blocked              |
| #81 Add S3 log bucket    | platform   | Low      |   +$4 | Passed               |
| #34 Resize ECS service   | backend    | High     |  -$78 | Exception requested  |

## 12.3 Review Detail

* Summary
* Resource changes
* Security
* Availability
* Cost
* Deployment plan
* Dependency graph
* Evidence
* Agent trace
* Exception history

## 12.4 Policies

```yaml
id: PG-CUSTOM-001
name: Production RDS requires Multi-AZ
scope:
  environments:
    - production
match:
  resource_types:
    - aws_db_instance
require:
  multi_az: true
severity: critical
```

## 12.5 Settings

* Terraform 경로
* 환경 판별 규칙
* 위험 임계값
* 기본 브랜치
* Check 차단 여부
* LLM 데이터 처리 설정
* 데이터 보존 기간

---

# 13. 저장소 설정 파일

대시보드 설정과 함께 코드 기반 설정을 지원한다.

파일명:

```text
.planguard.yml
```

예시:

```yaml
version: 1
terraform:
  directories:
    - infra/production
    - infra/shared
environments:
  production:
    paths:
      - infra/production/**
  staging:
    paths:
      - infra/staging/**
review:
  fail_on:
    - high
    - critical
cost:
  enabled: true
  currency: USD
  monthly_hours: 730
policies:
  checkov: true
  custom:
    - policies/production.yml
ai:
  deployment_plan: true
  historical_context: true
privacy:
  retain_plan_days: 7
  retain_source_code: false
```

코드 기반 설정은 PR로 리뷰할 수 있고 저장소마다 다른 정책을 적용하기 쉽다.

---

# 14. 데이터 모델

## 핵심 엔터티

### Installation

* GitHub installation ID
* account ID
* account type
* Marketplace plan
* status

### Repository

* repository ID
* installation ID
* full name
* default branch
* active status
* configuration

### Review

* repository
* PR number
* commit SHA
* environment
* status
* risk score
* risk level
* started at
* completed at

### ResourceChange

* Terraform address
* resource type
* provider
* action
* before
* after
* replacement required

### Finding

* category
* severity
* title
* evidence
* source
* recommendation
* policy ID

### Exception

* finding
* requested by
* approved by
* reason
* expiration
* status

### Subscription

* Marketplace account
* plan ID
* billing cycle
* status
* effective date

---

# 15. 보안 및 개인정보 보호

## 기본 정책

* 설치별 데이터 격리
* GitHub Installation Token 단기 사용
* Private key 암호화 저장
* Webhook signature 검증
* 업로드 데이터 암호화
* 데이터 보존 기간 설정
* 로그에서 Terraform 민감값 제거
* Prompt에 secret 전달 금지
* 조직별 데이터 삭제 지원
* 앱 제거 시 토큰과 작업 취소
* LLM 제공자에게 학습 데이터로 사용하지 않는 API 사용

GitHub Marketplace 등록 전에는 앱 유형에 맞는 보안 모범 사례를 따라야 하며, Marketplace 검토 과정에서도 보안과 사용자 데이터 처리 방식이 중요하다.

## 민감정보 필터링

Terraform plan에는 다음 정보가 포함될 수 있다.

* 데이터베이스 연결 설정
* 환경 변수
* 사용자 데이터
* 리소스 식별자
* 정책 문서
* 일부 secret 값

업로드 전에 다음 필드를 제거하거나 마스킹한다.

```text
sensitive_values
after_sensitive
before_sensitive
provider_config
environment variables
known secret patterns
```

## 보존 정책 예시

| 플랜          |         기본 보존 |
| ----------- | ------------: |
| Open Source |            1일 |
| Free        |            3일 |
| Team        |           30일 |
| Business    | 90일 또는 사용자 설정 |

---

# 16. 요금제

Marketplace 초기 등록은 무료 플랜부터 시작하는 것이 현실적이다.

## Open Source

**$0**

* Public repositories
* 월 100회 분석
* Terraform AWS 지원
* 보안·가용성 분석
* GitHub Check
* 분석 결과 1일 보존
* 커뮤니티 지원

## Free

**$0**

* Private repository 1개
* 월 30회 분석
* 기본 위험 정책
* GitHub Check
* 3일 보존

## Team

**월 $19 / 연 $190**

* Private repository 5개
* 월 300회 분석
* 비용 분석
* 배포·롤백 계획
* 사용자 정책
* 30일 보존
* 이메일 지원

## Business

**월 $49 / 연 $490**

* Private repository 20개
* 월 1,500회 분석
* Risk Memory
* 승인 및 예외 워크플로
* 조직 대시보드
* 90일 보존
* 우선 지원

Marketplace의 각 유료 플랜은 월간 가격과 연간 가격을 모두 설정해야 하며, 하나의 앱에 최대 10개의 가격 플랜을 제공할 수 있다.

## 초기 권장 전략

```text
Beta
→ Open Source + Free만 운영

100 installations 달성
→ Marketplace 정식 등록 신청

정식 등록 이후
→ Team 출시

유료 전환 검증 이후
→ Business 출시
```

유료 앱은 구매, 업그레이드, 다운그레이드, 취소와 무료 체험에 대한 Marketplace 이벤트를 처리해야 한다. 고객의 플랜이나 결제 주기가 변경될 때 `marketplace_purchase` 이벤트가 발생한다.

---

# 17. GitHub Marketplace 출시 전략

## 중요한 현실적 조건

현재 GitHub Marketplace 앱 등록 요건상 GitHub App은 최소 **100 installations**가 필요하다. 따라서 처음부터 Marketplace 검색 결과에 공개하는 것이 아니라, 공개 GitHub App으로 베타를 운영하며 설치 수를 먼저 확보해야 한다.

## 1단계: Private Alpha

목표:

* 본인 저장소
* Theorvane 조직
* YouthPick 등 테스트 조직
* 지인 개발팀 3~5곳

검증:

* 설치·삭제 흐름
* 웹훅 중복 처리
* Private repository 분석
* Check Run 안정성
* Terraform plan 보안
* 오탐 비율

## 2단계: Public Beta

목표:

* 무료 공개 GitHub App
* 오픈소스 Terraform 프로젝트 대상
* 100 installations 확보

유입 전략:

* Public repository 무료 무제한 또는 넉넉한 한도
* Terraform 예제 저장소 제공
* Checkov 사용자 대상 비교 콘텐츠
* Reddit, Hacker News, Dev.to, HashiCorp Discuss
* GitHub Topics: `terraform`, `github-app`, `devops`, `infrastructure-as-code`

## 3단계: Marketplace Free Listing

무료 플랜으로 정식 등록한다.

준비물:

* 앱 설명
* 로고
* 스크린샷
* 개인정보 처리방침
* 이용약관
* 지원 문서
* 설치 안내
* 보안 문서
* 앱 검증
* 100 installations

GitHub Marketplace listing에는 제품 설명과 가이드에 맞는 이미지가 필요하며, 요건을 충족한 뒤 listing verification과 publication 심사를 요청해야 한다.

## 4단계: Paid Listing

* Financial onboarding
* Team 플랜 추가
* Marketplace billing webhook 적용
* 결제 상태와 서비스 권한 동기화
* 취소·다운그레이드 grace period 구현

유료 플랜을 게시하려면 조직과 앱의 요건을 충족하고 별도의 financial onboarding을 진행해야 한다.

---

# 18. Marketplace 페이지 문안

## Marketplace 이름

**PlanGuard**

## 짧은 설명

> AI-powered Terraform change reviews for security, availability, cost, and deployment risk.

## 상세 소개

> PlanGuard reviews Terraform pull requests before infrastructure changes reach production.
>
> It combines deterministic plan analysis, security policies, cost estimation, and AI-assisted operational reasoning to explain what is changing, what can go wrong, and how to deploy or roll back safely.
>
> Install PlanGuard, connect your Terraform workflow, and receive actionable GitHub Checks directly on every pull request.

## 주요 기능

* Terraform plan analysis
* Security policy checks
* Availability impact review
* Cost change estimation
* Deployment and rollback plans
* Custom organization policies
* Human-reviewed exceptions
* GitHub Checks integration

---

# 19. MVP 범위

## 반드시 구현

1. GitHub App 설치
2. 설치·저장소 웹훅 처리
3. PR 이벤트 처리
4. GitHub Check 생성
5. GitHub Action을 통한 plan JSON 전달
6. Terraform resource change 파싱
7. AWS 주요 리소스 분석
8. Checkov 실행
9. 규칙 기반 위험 점수
10. AI 요약
11. Check 결과 업데이트
12. `.planguard.yml`
13. SaaS 대시보드
14. 데이터 삭제·보존 설정
15. 앱 제거 처리

## MVP 지원 리소스

* `aws_instance`
* `aws_autoscaling_group`
* `aws_db_instance`
* `aws_security_group`
* `aws_security_group_rule`
* `aws_iam_role`
* `aws_iam_policy`
* `aws_s3_bucket`
* `aws_lb`
* `aws_lb_listener`
* `aws_lb_target_group`
* `aws_nat_gateway`

## MVP에서 제외

* Kubernetes
* Azure·GCP
* Terraform apply
* 자동 코드 수정
* 자동 PR 병합
* Slack
* Jira
* OPA/Rego
* Self-hosted SaaS
* Enterprise SSO

---

# 20. 개발 단계

## Phase 1: 분석 엔진

* plan JSON fixture 수집
* Terraform 변경 정규화
* 위험 규칙 엔진
* Checkov 결과 정규화
* 테스트 시나리오 작성

완료 기준:

```text
대표 AWS 리소스 12종
변경 분석 정확도 95% 이상
핵심 위험 시나리오 재현 가능
```

## Phase 2: GitHub App

* GitHub App 등록
* Installation webhook
* Pull Request webhook
* Installation token 관리
* Check Run 생성·업데이트
* 중복 이벤트 방지

완료 기준:

```text
앱 설치 후 첫 PR 분석까지 5분 이내
새 커밋 push 시 자동 재검토
앱 삭제 시 모든 후속 요청 차단
```

## Phase 3: Agent Workflow

* LangGraph 상태 모델
* 병렬 분석
* AI 구조화 출력
* 재시도·타임아웃
* 검증 실패 fallback
* 비용 및 토큰 제한

완료 기준:

```text
AI 실패 시에도 결정론적 결과 제공
동일 입력에서 핵심 판정 일관성 유지
모든 AI 주장에 evidence 연결
```

## Phase 4: SaaS Dashboard

* GitHub 로그인
* 설치·저장소 관리
* 리뷰 목록
* 상세 결과
* 정책 설정
* 사용량
* 데이터 삭제

## Phase 5: Public Beta

* 문서 사이트
* 샘플 저장소
* 개인정보 처리방침
* 이용약관
* 보안 정책
* 상태 페이지
* 사용자 피드백
* 100 installations 확보

## Phase 6: Marketplace

* Listing 초안
* 이미지·설명
* 검증 요청
* 무료 플랜 출시
* 이후 유료 과금 연동

GitHub는 개발용 앱과 운영 앱을 분리하고, 운영 사용자에게 영향을 주지 않는 draft Marketplace listing을 이용해 테스트하는 방식을 권장한다.

---

# 21. 성공 지표

## 제품 지표

* 설치 조직 수
* 활성 저장소 수
* 월간 분석 PR 수
* 설치 후 첫 분석 완료율
* Check 재실행률
* High-risk 변경 탐지 수
* 예외 승인 비율
* False positive 비율
* 분석 완료 시간
* 무료→유료 전환율

## 초기 목표

```text
Public Beta 3개월
100 installations
50 monthly active repositories
1,000 reviewed pull requests
분석 성공률 95% 이상
중앙 분석 시간 60초 이하
False positive 신고율 10% 이하
```

## 핵심 North Star Metric

> **PlanGuard가 검토한 활성 Terraform Pull Request 수**

설치 수만 높고 실제 PR 분석이 없다면 제품 가치가 검증된 것이 아니기 때문이다.

---

# 22. 프로젝트 저장소 구성

```text
planguard/
├── apps/
│   ├── web
│   ├── api
│   └── worker
├── packages/
│   ├── terraform-parser
│   ├── policy-engine
│   ├── risk-engine
│   ├── github-client
│   └── schemas
├── actions/
│   └── analyze
├── policies/
│   └── aws
├── fixtures/
│   └── terraform-plans
├── docs/
│   ├── installation
│   ├── security
│   └── marketplace
└── infrastructure/
    └── terraform
```

## 권장 기술 스택

```text
Web
Next.js + TypeScript

Core API
Spring Boot 또는 NestJS

Agent Worker
Python + FastAPI
LangChain + LangGraph

Database
PostgreSQL + pgvector

Queue
Redis

Policy
Checkov + 자체 Rule Engine

Authentication
GitHub App + GitHub OAuth

Observability
OpenTelemetry + LangSmith

Infrastructure
Docker + Terraform + AWS
```

빠른 출시가 목표라면 Core API까지 Python/FastAPI로 통합하고, 이후 서비스가 성장할 때 분리하는 편이 낫다.

---

# 23. 최종 제품 포지셔닝

PlanGuard를 다음처럼 설명하는 것이 가장 좋다.

> **PlanGuard is an AI-assisted infrastructure change review platform that turns Terraform plans into evidence-backed GitHub Checks for security, availability, cost, and deployment risk.**

한국어로는 다음과 같다.

> **PlanGuard는 Terraform 변경사항을 근거 기반으로 분석하여, 운영 반영 전에 보안·가용성·비용·배포 위험을 GitHub에서 검토할 수 있게 하는 AI 인프라 변경 관리 플랫폼이다.**

가장 중요한 제품 경계는 다음과 같다.

```text
PlanGuard는 Terraform을 대신 적용하지 않는다.
PlanGuard는 사람이 안전하게 승인하도록 돕는다.
```
