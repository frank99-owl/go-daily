# 기술 아키텍처 및 핵심 모듈 (ARCHITECTURE)

이 문서는 go-daily의 내부 구조, `lib/` 디렉토리의 "9개 도메인 분리" 리팩토링 및 루트 `proxy.ts`(Next.js 16 앱 루트 프록시)에 모인 요청 처리 로직에 대해 설명합니다.

## 개요

- **엣지·라우팅:** 페이지 트래픽은 루트 `proxy.ts`에서 세션 갱신·인증 리다이렉트·로케일 협상(`/{locale}/...`)을 처리한다. `app/api/` 라우트는 전역 프록시를 우회하고 Cookie·Stripe 서명·`parseMutationBody` 등을 직접 검증한다.
- **모듈형 코어:** 비즈니스 로직은 `lib/<domain>/`에 두며 공유 계약은 `types/schemas.ts`에서 정의한다.
- **이 문서:** 요청 생명주기, 도메인 맵, 보안 경계.

## 1. 글로벌 요청 생명주기 (`proxy.ts`)

모든 사용자 대상 요청은 루트 `proxy.ts`(Next.js 16 앱 루트 프록시)를 통과합니다. 이 프록시는 단일 패스로 다음과 같은 네 가지 핵심 작업을 처리합니다:

1.  **매니페스트 특수 처리 (Manifest Special-Case)**: PWA 매니페스트 요청을 가로채어 적절한 버전을 반환합니다.
2.  **면제 경로 통과 (Exempt Path Passthrough)**: 특정 경로(정적 자산, API 웹훅 등)가 모든 프록시 로직을 우회하도록 허용합니다.
3.  **세션 갱신 및 인증 리다이렉트 (Auth Refresh & Redirect)**: `@supabase/ssr`을 사용하여 페이지 이동 시마다 세션 쿠키를 갱신함으로써, 서버 컴포넌트(RSC)가 항상 최신 사용자 상태를 유지하도록 합니다. 접두사가 붙은 경로(`/en/account` 등)는 여기서 보호되며, 인증되지 않은 사용자가 `/account`에 접근하면 `/login?next=...`로 리다이렉트되고, 인증된 사용자가 `/login`에 접근하면 `/account`로 리다이렉트됩니다.
4.  **로케일 협상 (Locale Negotiation)**: 접두사가 없는 경로에 대해 모든 경로에 언어 접두사(`/{zh|en|ja|ko}/...`)가 포함되도록 308(영구) 리다이렉트 매트릭스를 처리합니다.

**Next.js 16 범위**: 전역 요청 처리는 프로젝트 루트의 `proxy.ts`에 있습니다(`proxy` 및 `config.matcher` 내보내기, Node.js 런타임). `config.matcher`는 `/api/*`와 `/auth/*`를 제외하므로, API와 Supabase 인증 콜백은 각 라우트에서 세션·Stripe 서명·`parseMutationBody` 등을 검증합니다. 로케일 협상과 쿠키 갱신은 주로 **페이지** 내비게이션용입니다.

## 2. 핵심 도메인 모듈 (`lib/`)

### `lib/env.ts` (환경 변수 검증)

Zod 기반 중앙 집중식 환경 변수 검증기. 각 도메인(Coach, Stripe, Supabase, Reveal)에 고유한 스키마와 지연 검증 싱글턴 접근자(`getCoachEnv()`, `getStripeEnv()` 등)를 보유한다. 누락된 변수는 라우트 핸들러 깊숙이 조용한 500 에러를 발생시키는 대신, 첫 사용 시 명확한 시작 스타일 오류로 표면화된다. 브라우저용 `client.ts`와 세션 갱신 헬퍼(`lib/supabase/middleware.ts`)는 `lib/env.ts`가 서버 전용이므로 각자의 인라인 검증을 유지한다.

### `lib/auth/` & `lib/supabase/`

- **이중 클라이언트 전략**: 브라우저 환경을 위한 `client.ts`와 App Router의 비동기 서버 컴포넌트를 위한 `server.ts`를 별도로 운용합니다.
- **권한 서비스 계층**: `service.ts`는 `service_role` 키를 사용하여 RLS(행 수준 보안)를 우회하며, Stripe 웹훅이나 Cron 이메일 등 백그라운드 작업을 처리합니다.

### `lib/storage/` (영속성 엔진)

시스템은 3상태 동기화 모델을 채택하고 있습니다:

1.  **`anon` (LocalStorage 전용)**: 비로그인 사용자를 위한 1차 저장소입니다. 네트워크 호출이 발생하지 않습니다.
2.  **`logged-in-online` (LocalStorage + IndexedDB 큐 + Supabase)**: 인증된 사용자가 활성 연결을 유지하는 경우입니다. 쓰기 작업은 즉각적인 피드백을 위해 LocalStorage에 기록되고, 영구 버퍼 역할을 하는 IndexedDB에 큐잉되며, `syncStorage.ts`를 통해 즉시 Supabase로 배치 플러시됩니다.
3.  **`logged-in-offline` (LocalStorage + IndexedDB 큐)**: 인증된 사용자가 연결을 상실한 경우입니다. 쓰기 작업은 여전히 LocalStorage와 IndexedDB에 기록되지만, Supabase 플러시는 연기됩니다. 재시도 메커니즘이 `online` 이벤트 발생 시 또는 다음 페이지 로드 시 동기화를 트리거합니다.

### `lib/coach/` (AI 지능)

- **프롬프트 관리**: `coachPrompt.ts`에 집중하여 모든 문제에 동일한 코칭 계약(해설·분기 정보를 근거로 삼음, 페르소나 톤, 로케일별 스타일 블록)을 적용합니다.
- **할당량·날짜 창**: `coachQuota.ts`는 사용자 타임존 기준 날짜 서식 및 자연월/청구 앵커 월 창(`formatDateInTimeZone`, `getNaturalMonthWindow`, `getBillingAnchoredMonthWindow`)을 제공합니다. 메시지 횟수 상한은 `lib/entitlements.ts`에 정의되며 `getCoachState` 등에서 적용됩니다.
- **사용 카운터**: 로그인·게스트 코치 메시지 수는 Postgres에 저장되며, 동시 접속 시 RPC(`increment_coach_usage`, `increment_guest_coach_usage`)로 원자적 upsert 증분합니다.

### `lib/i18n/` (글로벌 존재감)

- **경로 우선**: 검색 엔진이 로컬라이즈된 전체 표면을 크롤링할 수 있도록 URL을 선호합니다. 현재 `sitemap.xml`에는 **12,000개 이상**의 로케일별 URL(정적·목록·문제 상세 × 4개 언어)이 포함되며 `content/data/puzzleIndex.json`에 따라 늘어납니다.
- **정확성 검증**: `scripts/validateMessages.ts`를 통해 `zh`, `en`, `ja`, `ko` 사이의 번역 키가 빌드 시점에 항상 동기화되도록 보장합니다.

### `lib/board/` (바둑판 로직)

- **핵심 엔진**: 돌 배치, 규칙 적용(호흡점, 사석, 코), 바둑판 렌더링을 `board.ts`, `goRules.ts`, `judge.ts`, `sgf.ts` 네 모듈로 구현합니다.
- **SGF 파싱**: 기보 기록 및 문제 정의를 위한 완전한 SGF(Smart Game Format) 가져오기/내보내기 지원.

### `lib/puzzle/` (문제 엔진)

- **SRS 및 로딩**: 간격 반복(`srs.ts`, `reviewSrs.ts`), 일일 선택, 컬렉션, 리빌 토큰, 스냅샷, 상태 유틸 — `lib/puzzle/`에 구현 모듈 8개와 동일 디렉터리의 `puzzleOfTheDay.test.ts`.

### `lib/entitlements.ts` & `lib/entitlementsServer.ts` (플랜)

- **티어 표**: `entitlements.ts`가 게스트/무료/Pro 코치 한도, 기기 수, 광고, 동기화 정책을 클라이언트 안전하게 정의합니다.
- **서버 병합**: `entitlementsServer.ts`가 Stripe + `manual_grants`(`resolveViewerPlan`)로 실효 플랜을 해석합니다.

### `lib/stripe/` (결제)

- **서버 SDK 래퍼**: 서버 사이드 결제, 구독 관리, 웹훅 검증을 위한 Stripe Node SDK를 래핑하는 단일 `server.ts` 파일.

### `lib/posthog/` (애널리틱스)

- **서버 사이드 트래킹**: 서버에서 PostHog 이벤트를 추적하며, 타입이 지정된 이벤트 정의로 애널리틱스 일관성을 보장.
- **PII 안전성**: 이벤트는 서버를 떠나기 전 `beforeSend` 훅을 통해 필터링되어 민감한 사용자 데이터를 제거.

## 3. 데이터 흐름: 연습 기록의 생명주기

1.  **이벤트**: 사용자가 바둑판(`GoBoard.tsx`)에서 수를 두고 문제를 해결합니다.
2.  **로컬 쓰기**: `saveAttempt`가 LocalStorage에 즉시 기록하여 빠른 피드백을 제공합니다.
3.  **큐 추가**: 로그인 상태인 경우 연습 기록이 IndexedDB 큐에 추가됩니다.
4.  **동기화**: `syncStorage`가 Supabase의 `attempts` 테이블에 일괄 삽입(Batch Insert)을 시도합니다.
5.  **권한 갱신**: 동기화 성공 후 사용자의 연승 기록(Streak) 및 SRS 일정 재계산이 트리거됩니다.

## 4. 법적 준수 도메인 (Legal & Compliance)

법적 요구 사항은 하드코딩된 로직이 아닌 **콘텐츠 자산 (Content Assets)**으로 취급되어 관할 구역에 따른 신속한 조정이 가능합니다.

- **신뢰할 수 있는 단일 소스 (SSOT)**: `app/[locale]/legal/_content.ts`에서 다국어 법적 텍스트를 통합 관리합니다.
- **동적 공시**: 사용자의 로케일 및 통합된 지주 구조에 기반하여 컴포넌트를 렌더링하는 아키텍처를 채택했습니다.
- **지역적 통합**: 특정 지역의 요구 사항(일본의 특상법 또는 한국의 PIPA 등)은 3대 지주 내의 통합된 콘텐츠 블록으로 포함되었습니다.

- **데이터 거주 전략**: 국외 데이터 이전 관련 법률(PIPA/GDPR)을 충족하기 위해 데이터가 싱가포르(Supabase) 및 미국(Vercel)으로 흐르는 경로를 명문화했습니다.

## 5. 보안 및 인프라

- **행 수준 보안 (RLS)**: 모든 Postgres 테이블에서 `auth.uid() = user_id` 정책을 강제하여 데이터베이스 계층에서의 데이터 유출을 원천 차단합니다.
- **PII 마스킹**: Sentry 및 PostHog는 `beforeSend` 필터로 구성되어 있으며, AI 코치와의 대화 내용이 클라이언트를 떠나기 전에 개인정보를 비식별화합니다.
- **NFKC 정규화**: 사용자 입력 텍스트는 처리 전 NFKC 정규화를 적용하여 동형 문자 공격 및 Unicode 정규화 취약점을 방지합니다.
- **라우트 계층 인증**: `proxy.ts`는 Supabase 세션 쿠키를 갱신하고 로케일이 붙은 **페이지**(예: `/account`, `/login`)를 보호합니다. `/api/*`는 프록시 matcher 밖이므로 Stripe·코치·관리·퍼즐 라우트가 세션·서명 등을 각자 검증합니다.
- **속도 제한**: `lib/rateLimit.ts` — `UPSTASH_REDIS_REST_URL`과 `UPSTASH_REDIS_REST_TOKEN`이 모두 있으면 `UpstashRateLimiter`, 비프로덕션에서는 `MemoryRateLimiter`。**`NODE_ENV === "production"`**에서 Upstash가 없으면 `createRateLimiter()`가 예외를 던집니다(프로덕션에서는 분산 제한 필수). `MemoryRateLimiter`는 키 상한 5만 개, 초과 시 가장 오래된 키를 제거하고 주기적으로 유휴 키를 정리합니다.

---

**관련 문서**:

- [API 레퍼런스](API_REFERENCE.md) — 전체 API 라우트 카탈로그.
- [데이터베이스 스키마](DATABASE_SCHEMA.md) — Supabase 테이블 정의, 인덱스, RLS 정책.
