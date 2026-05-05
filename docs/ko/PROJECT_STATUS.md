# go-daily 프로젝트 상태 및 향후 로드맵

**생성일**: 2026-05-06
**저장소 HEAD**: `8103dd7`
**상태**: v2.7 코드베이스 최적화 에디션

---

## 1. 2단계 완료 요약

모든 구독 관련 로직(Stripe, 권한 엔진, 멀티 디바이스 동기화)의 구현 및 감사가 완료되었습니다. 법적 프레임워크는 이제 Stripe 검증을 통과하기 위해 10개 이상의 글로벌 관할 구역을 지원합니다.

## 2. 아키텍처 감사

- **일관성**: `lib/` 아래의 모든 로직(SRS, Auth, Coach)이 이제 문서와 100% 일치합니다.
- **경로 수정**: 전역 **푸터(Footer)** 및 다중 관할권 법적 라우트를 구현하여 404 오류 가능성을 제거했습니다.
- **UI 로직**: 수직 여백(`pb-24`) 최적화를 통해 `Today` 및 `Random` 페이지의 레이아웃 가림 현상을 수정했습니다.

## 3. 최근 진행 (v2.8)

- **Upstash Redis 속도 제한**: 프로덕션에서는 Upstash Redis로 인스턴스 간 속도 제한을 적용한다. `NODE_ENV === "production"`인데 `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`이 없으면 `createRateLimiter()`가 스텁을 반환하고 첫 `isLimited` 호출에서 오류를 던진다(개발에서는 둘 다 생략하고 `MemoryRateLimiter` 사용).
- **PWA 아이콘**: Android/Chrome 설치 프롬프트용 192×192, 512×512 PNG 아이콘 추가.
- **OG 이미지 로컬라이제이션**: 소셜 공유 이미지가 사용자 로케일(zh/en/ja/ko)에 따라 렌더링.
- **ja.json 번역 수정**: 3개의 일본어 UI 문자열에 혼입된 한국어/중국어 문자 제거.
- **환경 변수 중앙 검증**: `lib/env.ts` — Zod 기반 지연 싱글턴이 분산된 `process.env` 읽기를 대체.
- **오류 페이지 다국어화**: 모든 오류 바운더리(`error.tsx`, `global-error.tsx`, `not-found.tsx`)가 4개 언어를 지원.
- **테마 색상 중앙화**: 53곳의 하드코딩된 `#00f2ff`를 `var(--color-accent)` CSS 변수로 대체.
- **코드 분할**: `CoachDialogue`, `ShareCard`, `BoardShowcase`를 `next/dynamic`으로 지연 로딩.
- **SEO hreflang**: `buildHreflangAlternates()` 헬퍼가 모든 페이지 라우트에 `alternates.languages`를 추가.
- **접근성**: Heatmap ARIA 시맨틱(`role="grid"`, `aria-label`), UserMenu 키보드 내비게이션(방향키, Home/End).
- **라우트 바운더리**: today, result, review, puzzles 라우트에 `loading.tsx` + `error.tsx` 추가.
- **테스트 스위트**: 82개 테스트 파일, 657개 테스트 케이스.
- **게스트 코치 영속화**: Supabase `guest_coach_usage`가 기기/일 단위 익명 코치 사용량을 저장(`service_role` 전용). IP 제한은 남용 방지용으로 인메모리 유지.
- **바둑판 모듈**: 핵심 로직을 네 모듈(`board.ts`, `goRules.ts`, `judge.ts`, `sgf.ts`)로 정리하고 레거시 `boardDisplay.ts` 제거.
- **문서 동기화**: API 레퍼런스에 `/api/health`, `/api/admin/*`, `/api/auth/device` 반영 및 **`POST /api/coach`의 SSE(Server-Sent Events)**·Postgres **RPC** 사용량 처리 명시；DB 문서에 권한 기반 `user_devices`, `manual_grants`, `guest_coach_usage`, **`0007_atomic_coach_usage_increment.sql`** 포함；다국어 **`CONCEPT.md`의 Pro 설명은 실제 할당량과 일치**(「무제한」 코치 아님 — **`PRODUCT_SPECS`** 참고)；README·색인은 9개 도메인 레이아웃에 맞춤.

## 3b. 최근 개선 사항 (v1.1 하드닝)

- **메모리 안전 속도 제한**: `MemoryRateLimiter`(5만 항목 상한)와 게스트 IP 카운터(1만 항목 상한)가 만료된 항목을 제거하여 서버리스 인스턴스의 무제한 메모리 증가를 방지합니다.
- **공통 요청 본문 파싱**: 모든 변형 API 라우트가 `lib/apiHeaders.ts`의 `parseMutationBody()`를 사용 —— CSRF, Content-Type, 크기 제한, JSON 검증의 단일 진실 공급원.
- **Unicode 프롬프트 인젝션 방어**: `promptGuard.ts`가 패턴 매칭 전에 NFKC 정규화를 적용하여 전각 문자 및 동형 문자를 접습니다.
- **Coach UX 개선**: 일반 오류 시 재시도 버튼, 사고 중 애니메이션 표시, 멘터 전환 시 스켈레톤 로딩.
- **Stripe Webhook 하드닝**: 본문 읽기 전에 1MB 페이로드 크기 제한(HTTP 413) 검증.
- **GoBoard 비활성 상태**: 상호작용 불가 시 판을 50% 투명도로 렌더링.

---

전략적 깊이에 대해서는 [docs/ko/CONCEPT.md](docs/ko/CONCEPT.md)를 참조하십시오.
