# go-daily 프로젝트 상태 및 향후 로드맵

**생성일**: 2026-05-19
**저장소 HEAD**: `main` (프로덕션 구성 및 연기 테스트 결과를 본 문서에 기록)
**상태**: Phase 3 첫 패스 완료. 프로덕션 구성 및 출시 윈도우 연기 테스트 합격, GitHub 릴리스 및 공개 출시 승인 대기 중

---

## 일, 현재 기준 (Current Baseline)

go-daily는 일일 바둑 문제 데이터베이스, 4개 언어 현지화, DeepSeek 기반의 스트리밍 AI 코칭, SRS 복습, Supabase 상태 동기화, Stripe 구독 및 다중 관할권 법률 페이지를 갖추고 있습니다. 현재 단계의 중점은 단순히 기초 기능을 추가하는 것이 아니라, 사용자의 유지 및 전환을 유도하는 지속 가능한 학습 시스템으로 이러한 기능들을 조율하는 것입니다.

최근 검증 결과:

- **문제 검증**: `npm run validate:puzzles` 통과, 현재 **3033**개 문제.
- **i18n 검증**: `npm run validate:messages` 통과, **4개 언어 × 499개 키 경로** 정렬 완료.
- **P2-C 타겟 테스트**: `npm run test -- tests/api/health.test.ts tests/app/sitemap.test.ts tests/app/pwaShell.test.ts tests/api/report-error.test.ts tests/api/stripeWebhook.test.ts tests/api/stripeCheckoutPortal.test.ts tests/api/dailyEmailCron.test.ts tests/scripts/productionPreflight.test.ts tests/scripts/emailSmoketest.test.ts` 통과, **9개 테스트 파일, 66개 테스트 케이스**.
- **Lint 및 타입 검사**: `npm run lint` 및 `npx tsc --noEmit` 모두 통과.
- **P2-D 타겟 테스트**: `npm run test -- tests/lib/promptGuard.test.ts tests/api/coach.test.ts tests/lib/posthog/eventTypes.test.ts tests/lib/posthog/server.test.ts` 통과, **4개 테스트 파일, 66개 테스트 케이스**. 확장 스위트 `npm run test -- tests/lib/promptGuard.test.ts tests/api/coach.test.ts tests/lib/posthog/eventTypes.test.ts tests/lib/posthog/server.test.ts lib/sentryScrubber.test.ts` 통과, **5개 테스트 파일, 79개 테스트 케이스**. P2-D는 `32f98c4 security: harden coach guard and telemetry privacy`로 커밋됨.
- **프로덕션 라이브 예비 검사**: `npm run preflight:prod -- --check-remote --stripe-mode=live` 통과, **123건 합격 / 0건 경고 / 0건 실패**. 원격 Supabase 테이블/열, Stripe 라이브 가격 및 로컬 프로덕션 경계가 모두 일치함.
- **이메일 연기 테스트**: Resend 프로덕션 API 키가 로테이션되어 온라인 반영됨. `npm run email:smoketest -- --check-remote` 통과. `go-daily.app` 도메인, SPF 및 DKIM 원격 검증 완료, 실제 이메일 연기 테스트 송신 성공.
- **결제 연기 테스트**: Stripe 실제 $1 결제 테스트 성공 후 환불 성공. Stripe 이벤트 `pending_webhooks=0`.
- **프로덕션 배포**: Vercel 프로덕션이 성공적으로 재배포되었으며 `https://go-daily.app`이 새 배포본으로 에일리어싱됨. `/api/health`가 200을 반환하고 Supabase 검사 결과는 `ok`, `/ko/pricing`은 200을 반환함.
- **프로덕션 빌드**: `npm run build` 통과 (Next.js **16.2.6**), **131**개의 정적 페이지 생성.

## 이, 완료된 기능 (Completed Capabilities)

- **Upstash Redis 속도 제한**: 프로덕션에서는 Upstash Redis를 사용하여 인스턴스 간 속도 제한을 적용합니다. `NODE_ENV === "production"`이고 Upstash 자격 증명(`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`)이 누락된 경우, `createRateLimiter()`는 스텁을 반환하고 첫 `isLimited()` 호출에서 예외를 던집니다 (Upstash 인증 없이 `next build`를 완료할 수 있으며, 개발 환경에서는 둘 다 생략하고 `MemoryRateLimiter`를 사용함).
- **PWA 아이콘**: Android/Chrome 설치 프롬프트용 192×192, 512×512 PNG 아이콘 추가.
- **OG 이미지 로컬라이제이션**: 소셜 공유 이미지가 사용자 로케일(zh/en/ja/ko)에 따라 렌더링.
- **ja.json 번역 수정**: 3개의 일본어 UI 문자열에 혼입된 한국어/중국어 문자 제거.
- **환경 변수 중앙 검증**: `lib/env.ts` — Zod 기반 지연 싱글턴이 분산된 `process.env` 읽기를 대체.
- **오류 페이지 다국어화**: 모든 오류 바운더리(`error.tsx`, `global-error.tsx`, `not-found.tsx`)가 4개 언어를 지원.
- **테마 색상 중앙화**: 53곳의 하드코딩된 `#00f2ff`를 `var(--color-accent)` CSS 변수로 대체.
- **코드 분할**: `CoachDialogue`, `ShareCard`, `BoardShowcase`를 `next/dynamic`으로 지연 로딩.
- **P1 학습 루프 첫 패스**: 온보딩부터 첫 번째 문제로의 루프, 결과 페이지에서의 오답 이유 이해, 다음 추천 문제로의 라우팅, 복습/통계 인사이트 및 제한적인 CoachDialogue 업그레이드를 완료.
- **P2-A 상업용 카피 감사**: 첫 패스 완료. 제품, 가격, Coach, Review, Stats 및 공개 문서에서의 권한 표기를 감사하여 증명 불가능한 약속을 회피함.
- **P2-B 퍼널 및 이벤트**: 첫 패스 완료. 활성화, 유지, 유료 전환용 PostHog 이벤트 명명 및 트리거 포인트 설정 완료.
- **P2-C 프로덕션 연기 테스트**: 첫 패스 완료. 2026-05-19 릴리스 윈도우에서 라이브 검증 합격: Resend 원격 실제 송신, Stripe 라이브 결제/환불, Vercel 프로덕션 재배포, Supabase 원격 검사 모두 통과.
- **P2-D AI 보안 및 비용**: 첫 패스 완료. promptGuard 레드팀 테스트 강화, 코치 비용 제어 도입, Sentry/PostHog 프라이버시 감사 실시 (외부 시스템 변경 없음, 실제 이벤트 전송 없음, 비밀 정보 노출 없음).
- **P2-E 릴리스 자료**: 로컬 첫 패스 완료. `LAUNCH_CHECKLIST`, README 다듬기, 영문 케이스 스터디, 매출 실험 계획, 사용자 인터뷰용 스크립트, 30/60/90일 로드맵 포함.
- **SEO hreflang**: `buildHreflangAlternates()` 헬퍼가 모든 페이지 라우트에 `alternates.languages`를 추가.
- **접근성**: Heatmap ARIA 시맨틱(`role="grid"`, `aria-label`), UserMenu 키보드 내비게이션(방향키, Home/End).
- **라우트 바운더리**: today, result, review, puzzles 라우트에 `loading.tsx` + `error.tsx` 추가.
- **게스트 코치 영속화**: Supabase `guest_coach_usage`가 기기/일 단위 익명 코치 사용량을 저장(`service_role` 전용). IP 제한은 남용 방지용으로 인메모리 유지.
- **바둑판 모듈**: 핵심 로직을 네 모듈(`board.ts`, `goRules.ts`, `judge.ts`, `sgf.ts`)로 정리하고 레거시 `boardDisplay.ts` 제거.
- **문서 동기화**: API 레퍼런스에 `/api/health`, `/api/admin/*`, `/api/auth/device` 반영 및 **`POST /api/coach`의 SSE(Server-Sent Events)**·Postgres **RPC** 사용량 처리 명시；**관리**: `/api/admin/verify`는 `ADMIN_EMAILS` + `ADMIN_PIN`, **`/api/admin/grants`는 `ADMIN_USER_IDS`**；DB 문서에 권한 기반 `user_devices`, `manual_grants`, `guest_coach_usage`, **`0007_atomic_coach_usage_increment.sql`** 포함；다국어 **`CONCEPT.md`의 Pro 설명은 실제 할당량과 일치**(「무제한」 코치 아님 — **`PRODUCT_SPECS`** 참고)；README·색인은 9개 도메인 레이아웃에 맞춤；`docs/README.md`에 공개 저장소용 비밀·프라이버시 주의 사항.

## 삼, 콘텐츠 품질 현황 (Content Quality Status)

최근 콘텐츠 감사 보고는 `reports/*/latest.md` 및 P0-D 로컬 감사 체크리스트(2026-05-18 생성)에 저장되어 있습니다.

- **문제 데이터베이스 구조**: 3033개 문제 모두 19×19입니다. 난이도 3이 46.5%, 난이도 4가 35.1%를 차지합니다. 주요 태그는 `tesuji` (1822개 문제, 60.1%), 이어서 `life-death` (1187개 문제)입니다. `endgame` (끝내기) 및 `opening` (포석)은 각각 12개입니다.
- **콘텐츠 해설**: 전수 감사를 통해 3033개 문제 모두 `explained` 수준에 도달했음을 확인했습니다. 필드 누락, 정답 누락 또는 명백한 임시 해설은 없습니다. 190개의 해설이 500자를 초과하므로 중복되거나 장황하지 않은지 검증이 필요합니다.
- **코치 완성도**: 코치 데이터 파일은 `coachBasicEligibleIds.json` (3033), `coachReadyIds.json` (20) 및 `variationGroups.json` (0개 그룹)으로 분할되었으며 `getCoachAccess()`가 데이터 레이어와 런타임 품질 관문을 모두 검증합니다. P0-D는 20개 문제에 대해 `solutionSequence` 및 `wrongBranches`를 보강했습니다. 나머지 **3013**개 문제는 단순 텍스트 해설이 있다고 해서 "완전한 AI 코치 문제"로 간주해서는 안 됩니다.
- **품질 샘플링**: 195개 문제가 검토 대상으로 플래그 지정되었습니다. 초기 P0-D 배치 이외의 문제는 일반적으로 `solutionSequence` 및 `wrongBranches`가 부족합니다. 고난이도 문제, 인접 중복 문제 및 무작위 샘플의 지속적인 보강이 필요합니다.
- **중복 문제**: 89개의 부분 중복 그룹(243개 문제 포함)을 발견했습니다. 완전 중복 그룹은 없습니다. 중복 그룹은 대개 설명이 다른 동형 문제이며, 단순히 삭제하기보다는 변화도로 통합하거나 관련 연습으로 태그 지정해야 합니다.

## 사, 콘텐츠 향상 로드맵 (Content Enhancement Roadmap)

1. **품질 등급 명확화**: 문제를 `basic-explained`, `coach-eligible`, `coach-ready` 및 `variation-ready` 등급으로 명확히 구분합니다. 현재 전체 데이터베이스가 `coach-eligible` 기초 후보군으로 기능하며, P0-D의 초기 20개 문제가 `coach-ready`로 승인되었습니다. 다른 대다수의 문제는 정답 수순과 오답 분기가 부족합니다.
2. **고가치 콘텐츠 우선**: 난이도 4-5, 중복 그룹 및 희소 태그(`endgame` / `opening`) 문제에 대해 수동 또는 반자동으로 `solutionSequence`와 `wrongBranches`를 작성하여 소규모 배치로 검토에 보냅니다.
3. **중복을 자산으로 전환**: 설명이 다른 중복 그룹을 "동형/변화도" 자산으로 변환하고 교육적 차이를 유지합니다. 독특한 가치가 완전히 없는 경우에만 삭제를 고려합니다.
4. **구조적 편중 억제**: 데이터베이스가 19×19 중급 맥(tesuji)에 더 집중되는 것을 피하기 위해 9×9/13×13 입문 경로, 끝내기 및 포석 주제 추가를 우선시합니다.
5. **보고서로 대기열 추진**: `audit:puzzles`로 전체 분포를 파악하고, `report:quality`로 해설 깊이를 체크하며, `report:duplicates`로 중복을 변화도로 변환하고, `queue:content`로 검증된 출시 후보를 출력합니다.

## 오, 학습 루프 설계 (Learning Loop Design)

P1-A부터 P1-E의 첫 패스를 구현했습니다. 현재 베이스라인은 신규 사용자를 온보딩에서 첫 번째 문제로 안내하고 결과 페이지에서 에러 원인을 설명하며 다음 단계를 추천합니다. CoachDialogue는 문제 등급, 할당량 및 실패에 적응하도록 최적화되었습니다.

제품의 다음 단계는 사용자 경험을 `onboarding → first puzzle → result → coach → review → next recommendation`을 중심으로 조율할 것입니다:

- **온보딩**: 훈련 레벨과 목표를 수집하고, 기능을 소개하기만 하는 대신 "오늘 무엇을 할지"에 대한 명확한 진입점을 제공합니다.
- **첫 번째 문제**: 마찰을 낮게 유지하고 명확한 테마, 난이도 및 즉각적인 착수 피드백을 제공합니다.
- **결과 페이지**: 단순히 맞고 틀림을 표시할 뿐만 아니라 "왜 이 수가 성립하는지 / 왜 그 실수가 실패하는지" 설명하고 다음 행동을 제시합니다.
- **코치**: 승인된 `coach-ready` 문제에서만 완전한 AI 코칭을 강조하고, `basic-explained` 문제에서는 AI의 환각을 방지하기 위해 제한적인 정적 해설을 제공합니다.
- **복습**: 오답을 SRS로 전송하고 복습 시 지난 에러 지점과 이번 목표를 강조합니다.
- **다음 문제 추천**: 난이도, 태그, 최근 에러 및 SRS 만료 여부를 기반으로 다음 문제를 결정하여 지속 가능한 일일 연습 습관을 구축합니다.

## 육, 최근 개선 사항 (v1.1 하드닝)

- **메모리 안전 속도 제한**: `MemoryRateLimiter`(5만 항목 상한)와 게스트 IP 카운터(1만 항목 상한)가 만료된 항목을 제거하여 서버리스 인스턴스의 무제한 메모리 증가를 방지합니다.
- **공통 요청 본문 파싱**: 주요 JSON 변경 라우트(`/api/coach`, `/api/auth/device`, `/api/puzzle/attempt`, `/api/puzzle/reveal`)가 `lib/apiHeaders.ts`의 `parseMutationBody()`를 사용(기본 **2KB**, 코치 **8KB**, reveal **3KB**). Stripe 등은 동일 출처·라우트별 JSON 파싱.
- **Unicode 프롬프트 인젝션 방어**: `promptGuard.ts`가 패턴 매칭 전에 NFKC 정규화와 일반적인 Cyrillic/Greek 동형 문자 접기를 적용합니다.
- **Coach UX 개선**: 일반 오류 시 재시도 버튼, 사고 중 애니메이션 표시, 멘터 전환 시 스켈레톤 로딩.
- **Stripe Webhook 하드닝**: 본문 읽기 전에 1MB 페이로드 크기 제한(HTTP 413) 검증.
- **GoBoard 비활성 상태**: 상호작용 불가 시 판을 50% 투명도로 렌더링.
- **GoBoard 하이라이트 색상 수정**: 자동 재생 바둑판(기보 관전 등)에서 백돌 하이라이트가 표시될 때 착수 순간에 일시적으로 흑돌로 잘못 렌더링되는 버그를 수정했습니다. 하이라이트를 그리기 전에 해당 좌표에 돌이 이미 존재하는지 확인하고 본래의 돌 색상(흑 또는 백)을 유지하도록 했습니다.
- **이메일 로그인 활성화**: `NEXT_PUBLIC_ENABLE_EMAIL_LOGIN` 환경 변수를 활성화하여 사용자가 Google 이외의 이메일 주소로도 인증 링크(Magic Link)를 통해 로그인할 수 있도록 했습니다.

## 칠, Phase 3 첫 패스 완료 상태 (Phase 3 First Pass Completion Status)

Phase 3의 첫 패스가 완료되었습니다: P0 콘텐츠 품질 베이스라인, P1 학습 루프, P2 출시/성장/운영 자료 및 프로덕션 연기 테스트가 모두 납품되었습니다. 프로덕션 환경은 검증 완료되었으며, 남은 단계는 GitHub 릴리스, 공개 출시 발표 및 그 이후의 실제 사용자 검증입니다.

즉각적인 다음 단계:

1. **GitHub 릴리스 승인**: 이 문서의 차이점, 태그 이름 및 릴리스 노트를 확인하고 태그를 푸시하여 GitHub 릴리스를 생성합니다.
2. **다음 코치 문제 정제**: `queue:content` / `plan:content-batch`에서 20-50개의 고가치 문제를 계속 정제하여 `solutionSequence` 및 `wrongBranches`를 완료하고 승인 목록에 푸시합니다.
3. **실제 사용자 검증**: [USER_INTERVIEW_SCRIPT.md](USER_INTERVIEW_SCRIPT.md) 및 [REVENUE_EXPERIMENTS.md](REVENUE_EXPERIMENTS.md)에 따라 소규모 검증을 수행합니다. 사용자에게 연락하거나 이메일을 보내고, 결제를 받거나 대기 목록을 공개하기 전에 개별 승인이 필요합니다.
4. **프로덕션 관찰**: 안정성을 모니터링하기 위해 이전 Resend / Stripe 키를 24-48시간 동안 유지한 다음 정리하여 조기 만료를 방지합니다.

Frank로부터 개별 승인을 받아야 하는 외부 작업: `git push`, PR 생성/업데이트, GitHub 릴리스 생성, DNS/Cloudflare 변경, Supabase 프로덕션 변경, 공개 출시 발표, 외부 사용자 대상 이메일/마케팅 캠페인.

---

자세한 내용은 [docs/ko/CONCEPT.md](docs/ko/CONCEPT.md)를 참조하십시오.
