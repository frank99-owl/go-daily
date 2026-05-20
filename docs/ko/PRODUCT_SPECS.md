# 제품 사양 및 기능 로직 (PRODUCT_SPECS)

이 문서는 go-daily 핵심 기능의 동작 로직을 정의하며, 현재 권한 엔진 및 구독 엔진의 구현 상태와 동기화되어 있습니다.

## 1. 권한 엔진 (`lib/entitlements.ts`)

go-daily는 분산된 불리언(boolean) 체크 대신 중앙 집중식 **조회 테이블(Lookup Table)**을 사용하여 권한을 관리합니다. 이를 통해 "평생 회원"과 같은 새로운 등급 추가 시 단일 상수만 업데이트하면 됩니다.

| 기능                | 게스트 (미로그인)  | 무료 플랜            | Pro 플랜               |
| ------------------- | ------------------ | -------------------- | ---------------------- |
| **AI 코치 할당량**  | 3회 / 일, 5회 / 월 | 10회 / 일, 30회 / 월 | **일 50+ · 월 1,000+** |
| **기기 제한**       | —                  | 1대                  | 3대                    |
| **클라우드 동기화** | 없음               | 싱글 디바이스        | 멀티 디바이스          |
| **광고**            | 있음               | 있음                 | 없음                   |

문서상 **Pro** 는 일 **50+**·월 **1,000+** 로 표기하며, 실제 카운터는 `lib/entitlements.ts`에만 정의되어 있습니다.

표의 기기별 할당량 외에, 게스트 코치 요청에는 서버에서 **IP당 UTC 일 단위** 추가 일일 상한이 있습니다(`GUEST_IP_DAILY_LIMIT`, 현재 IP당 일 **20**회 — `guestCoachUsage.ts`). `UPSTASH_*`가 있으면 IP 카운트는 **Upstash**에, 없으면 프로세스 내 `Map`(최대 1만 키, 일 경과 후 삽입 순으로 가장 오래된 키 제거)에 저장합니다. 표의 기기별 카운트와는 별도 레이어입니다.

로그인한 브라우저는 `POST /api/auth/device`를 통해 자신의 `user_devices` 행을 등록하거나 갱신합니다. 이 엔드포인트는 Stripe 구독 상태와 `manual_grants`를 합친 뒤 Free / Pro 기기 제한을 적용합니다.

Stripe 상태가 `past_due`인 구독은 Pro를 무기한 유지하지 않습니다. `lib/entitlements.ts`는 `current_period_end + 7일`의 유예 기간 내에만 `past_due`를 Pro로 처리합니다. 기간 만료 데이터가 누락되었거나 이 기간을 초과하면 유효한 `manual_grants`가 적용되지 않는 한 Free 플랜으로 대체됩니다. `/admin` Operations Snapshot에는 추적용 유예 기간 내 및 만료된 `past_due` 수가 보고됩니다.

### 캐시 전략 (Next.js 16)

우리는 `'use cache'` 지시어와 `cacheTag`를 활용합니다. Stripe 웹훅이 구독 정보를 업데이트하면 `revalidateTag('entitlements:' + userId)`를 호출하여 UI에 즉시 변경 사항이 반영되도록 합니다.

### 수동 Pro 부여(`manual_grants` / `lib/entitlementsServer.ts`)

Stripe 없이 이메일로 Pro를 부여할 때는 `manual_grants` 테이블과 `/api/admin/grants`를 사용합니다. `lib/entitlementsServer.ts`의 `resolveViewerPlan()`은 먼저 `getViewerPlan()`(Stripe 구독 상태)으로 기본 플랜을 정하고, 아직 Pro가 아닐 때만 유효한 `expires_at`의 수동 부여로 Pro로 승격합니다. `/api/admin/grants`는 세션 사용자 UUID가 `ADMIN_USER_IDS`에 있어야 합니다(관리 UI 이메일 허용 목록·PIN과 별개 — `API_REFERENCE` 참고).

## 2. 간격 반복 (SRS) 로직 (`lib/puzzle/srs.ts`)

우리는 개선된 SuperMemo-2 (SM-2) 알고리즘을 구현했습니다.

- **초기 상태**: Ease Factor 2.5, Interval 0.
- **품질 매핑**:
  - 오답 -> 2 (즉시 재대기 트리거)
  - 정답 -> 5 (Ease Factor에 따라 다음 간격 계산)
- **스케줄링**: 문제는 `due_date` 오름차순으로 정렬됩니다. Pro 사용자는 백로그를 정리하여 오답 관리의 "인박스 제로(Inbox Zero)"를 달성할 수 있습니다.

## 3. 구독 관리 (`lib/stripe/`)

- **결제**: Stripe Adaptive Pricing을 사용하여 사용자 IP에 따라 $4.9 USD를 한국 원화(KRW) 등 적절한 현지 통화로 자동 변환합니다.
- **웹훅 멱등성**: 모든 Stripe 이벤트는 처리 전 `stripe_events` 테이블에 기록됩니다. 이벤트가 중복 전달되면 시스템은 이를 감지하고 처리를 건너뜁니다.
- **무료 체험**: 모든 Pro 구독에 대해 3일간의 무료 체험을 필수화했습니다. 결제 수단 사전 등록(`payment_method_collection: 'always'`)을 요구하여 유료 전환율을 극대화했습니다.

## 4. 퍼즐 컬렉션 및 필터 (`lib/puzzle/puzzleCollections.ts`)

태그와 난이도 기반 탐색을 지원합니다.

- **태그**: `life-death`, `tesuji`, `endgame`, `opening`(`PuzzleTagSchema`에 정의).
- **난이도**: 1–5 척도. 각 퍼즐은 단일 난이도.
- **컬렉션 페이지**: `/puzzles/tags/{tag}` 및 `/puzzles/difficulty/{level}`에서 `PuzzleListClient`로 필터 뷰를 렌더링합니다.

## 5. 콘텐츠 품질 등급화 (Content Quality Tiers)

퍼즐의 품질이나 AI 코칭 적합성은 단순히 '정답이 있는지 여부'만으로 판단할 수 없습니다. 공유 구조는 `types/schemas.ts`에서 정의합니다: `correct`와 `solutionNote`는 기본 필드이며, `solutionSequence`와 `wrongBranches`는 선택적 심화 학습용 필드입니다.

제품 차원에서는 퍼즐 품질을 다음과 같은 4개 등급으로 관리합니다:

| 등급              | 판정 기준                                                                      | 제품에서의 용도                                              |
| ----------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| `basic-explained` | 정답 및 4개 언어 해설이 제공되나, 운영 허용 목록에 없음                        | 일일 퍼즐, 결과 페이지 정적 해설, 기초 복습                  |
| `coach-eligible`  | `checkCoachEligibility()` 기본 품질 관문을 통과하였으며 운영 대기열 후보       | 제한된 AI 기초 해설, 초기 퍼즐 풀, 콘텐츠 보강 후보          |
| `coach-ready`     | 정답, 해설, `solutionSequence`, `wrongBranches`가 포함되고 승인됨              | 완전한 AI 코치 기능, 변화도에 대한 추가 질문 가능            |
| `variation-ready` | 중복 그룹 또는 동형 문제가 명확한 변화 관계 형태로 정리되고 차이 설명이 포함됨 | 테마별 훈련, 취약점 분석, 다음 문제 추천, 고도화된 복습 경로 |

구현상 `lib/coach/coachEligibility.ts`는 `qualityTier`와 `hasVariationSupport`를 반환합니다. `content/data/coachBasicEligibleIds.json`은 기초 설명 대상, `content/data/coachReadyIds.json`은 전체 코치 승인 대상, `content/data/variationGroups.json`은 정리된 변화도 그룹을 나타내며 `getCoachAccess()`가 데이터 레이어와 런타임 품질 관문을 모두 검증합니다. 퍼즐이 완전한 AI 코치 기능을 제공하는 것은 `coach-ready`에 도달하고 `coachReadyIds.json`에 포함된 경우로 제한됩니다. `variation-ready` 등급은 추가로 검토된 변화도 그룹에 포함되어야 합니다. `basic-explained` 및 `coach-eligible` 등급에서는 정적 해설이나 제한된 Q&A만 제공되며, 완전한 변화도 대화는 보장되지 않습니다.

## 6. 학습 루프 (The Learning Loop)

목표 사용자 경로는 `onboarding → first puzzle → result → coach → review → next recommendation`입니다:

| 단계                | 사용자 피드백                                                   | 시스템 판단 기준                                |
| ------------------- | --------------------------------------------------------------- | ----------------------------------------------- |
| Onboarding          | 최적의 훈련 강도, 테마별 진입점, 오늘의 목표                    | 훈련 레벨 선호도, 로케일, 로그인 상태           |
| First puzzle        | 명확한 테마, 난이도, 순서, 즉각적인 착수 피드백                 | 퍼즐 인덱스, 일일 선택, 바둑판 규칙             |
| Result              | 정오 판정, 정답 수순, 모양 해설, 복습 대기열 등록 여부          | `correct`, `solutionNote`, 도전 기록            |
| Coach               | 질문 가능 영역 제어; 승인된 문제에서만 수순 및 실패도 대화 제공 | `qualityTier`, 할당량, 승인 목록, 페르소나 설정 |
| Review              | 이전 오답 원인, 복습 목표, 다음 SRS 일정                        | 도전 이력, `reviewSrs.ts`                       |
| Next recommendation | 단순 무작위가 아닌 최적의 다음 문제                             | 난이도, 태그, SRS만료, 최근 오답, 품질 등급     |

이 루프의 핵심 지표는 첫 번째 문제의 완료율, 결과 페이지로부터의 지속률, 코치 이용 후 익일 재방문율, 오답 복습 완료율, 그리고 Pro 유료 전환 시점의 품질입니다.

## 7. AI 보안 및 비용 경계 (AI Security & Cost Boundaries)

코칭 요청 보안 및 비용 제어는 `/api/coach`, `lib/promptGuard.ts`, `lib/coach/*`, `lib/rateLimit.ts` 및 관찰 가능성 래퍼가 공동으로 부담합니다:

- **프롬프트 주입 방어**: 사용자 메시지는 먼저 `guardUserMessage()`를 통과합니다. 감지 로직에는 NFKC 정규화, Cyrillic/Greek 동형 문자 접기, 제로 폭 공백 제거, 압축 문자열 매칭, 키워드 밀도 검사 등이 포함됩니다. 주입 시도가 감지된 요청은 문제 조회, 할당량 차감, 모델 호출 전에 거부됩니다.
- **요청 및 컨텍스트 버짓**: 코치 POST 요청 본문은 최대 8 KB로 제한됩니다. 대화 이력은 최대 6회 왕복까지 유지되고, 총 글자 수 버짓은 6,000자(메시지당 2,000자 절삭)이며, 업스트림 모델의 `max_tokens`는 400으로 고정되고 25초 타임아웃이 적용됩니다.
- **할당량 및 속도 제한**: 전역 IP 속도 제한은 `createRateLimiter()`가 수행하며, 프로덕션에서 Upstash가 없는 경우 첫 검사 시 503 에러를 던집니다. 게스트 사용자는 기기당 일일/월간 제한 및 IP 일일 제한이 적용됩니다. 로그인 사용자는 동시 요청을 통한 우회를 방지하기 위해 Postgres RPC를 거쳐 일일/월간 할당량을 원자적으로 확인하고 인크리먼트합니다.
- **할당량 차감 및 롤백**: 사용자가 연결을 강제로 끊어 횟수 집계를 우회하는 것을 막기 위해, 할당량은 모델 응답이 스트리밍되기 전에 먼저 차감됩니다. 업스트림 에러나 스트림 실패 시에는 차감이 롤백됩니다. 잘못된 요청, 프롬프트 가드 감지, 비지원 문제, 할당량 부족 등의 상황에서는 모델을 호출하지 않습니다.
- **비용 관찰 가능성**: 서버 측 PostHog에는 모델명, 공급자, 소요 시간, 토큰 수만 기록되며, 사용자의 입력, AI 응답, SGF 기보, 또는 내부 ID는 전송되지 않습니다. 공급자로부터 사용량이 반환되지 않는 경우 `usageAvailable=false`로 기록됩니다.

## 8. 퍼널 및 이벤트 (Funnel & Events)

PostHog 이벤트는 활성화, 리텐션, 코치, 유료 전환 4개 카테고리로 분류되며 신뢰할 수 있는 단일 소스는 `lib/posthog/eventTypes.ts`에 정의되어 있습니다. 클라이언트는 `track()`, 서버는 `captureServerEvent()`를 통해 이벤트를 전송합니다. 테스트 환경에서는 모크 래퍼를 사용하여 실제 네트워크 전송을 방지합니다.

| 분류       | 이벤트                                                                                                              | 저민감도 속성 경계                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Activation | `onboarding_started`, `first_move_played`, `first_puzzle_completed`, `result_viewed`, `next_recommendation_clicked` | `locale`, `source`, `level`, `tag`, `difficulty`, `contentTier`, `result`, `recommendationType` |
| Retention  | `review_page_viewed`, `review_item_opened`, `stats_page_viewed`, `review_recommendation_viewed`                     | `locale`, `source`, `plan`, `tag`, `difficulty`, `result`, `recommendationType`                 |
| Coach      | `coach_opened`, `coach_prompt_clicked`, `coach_response_completed`, `coach_error_shown`, `coach_quota_state_seen`   | `locale`, `source`, `contentTier`, `result`, `promptKey`                                        |
| Conversion | `pricing_viewed`, `checkout_click`, `upsell_viewed`, `upsell_cta_clicked`                                           | `locale`, `source`, `plan`, `interval`                                                          |

개인정보 경계: 이벤트 속성에는 원본 SGF 기보, 사용자의 자유 입력 텍스트, AI와의 대화 내용, 이메일, 사용자 ID, Stripe 고객/구독 ID, 기기 ID, 또는 리빌 토큰을 전송하지 않습니다. 서버 측 PostHog의 `distinctId`는 SHA-256 파생 값을 사용하여 데이터베이스나 결제 시스템 ID 노출을 방지합니다. `captureServerEvent()`는 전송 전 민감한 키나 값을 검사하고 감지 시 이벤트를 차단하고 저민감도 경고 메시지만 로그에 기록합니다.

## 9. 법적 준수 표시 로직

시스템은 Apple 스타일의 '통합된 지주' 법적 제공 메커니즘을 채택하고 있습니다.

- **동적 법적 푸터**: 푸터는 3가지 핵심 지주로 연결됩니다: `/legal/privacy` (개인정보), `/legal/terms` (약관), `/legal/refund` (환불).
- **통합된 공시 사항**:
  - **일본 특정상거래법**: 서비스 이용약관에 직접 통합되었습니다.
  - **대만 소비자 보호법**: 서비스 이용약관에 직접 통합되었습니다.
  - **영국/유럽 DMCCA**: 환불 정책에 통합되었습니다.
- **콘텐츠 제공**: 모든 법적 텍스트는 `app/[locale]/legal/_content.ts`에 의해 구동됩니다.

## 10. 접근성 및 라우트 바운더리

- **Heatmap ARIA**: 활동 히트맵은 컨테이너에 `role="grid"`와 `aria-label`, 각 날짜 셀에 `role="gridcell"`과 설명적 `aria-label`을 사용.
- **UserMenu 키보드 내비게이션**: 드롭다운 메뉴는 ArrowUp/Down으로 항목 순환, Home/End로 처음/마지막 이동, Escape로 닫기, 열 때 첫 번째 항목에 자동 포커스.
- **라우트 로딩/오류 상태**: 주요 라우트(today, result, review, puzzles)에 `loading.tsx`(스켈레톤 UI)와 `error.tsx`(현지화된 오류 바운더리+재시도) 배치. 공유 컴포넌트: `PageSkeleton`과 `PageError`.
- **CSS 변수 테마**: 모든 강조 색상이 하드코딩된 16진수 값 대신 `var(--color-accent)`(`globals.css`에서 정의)를 참조하여 향후 테마 사용자 정의 가능.
