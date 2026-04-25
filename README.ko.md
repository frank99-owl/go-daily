# go-daily

> 매일 하나의 Go(바둑) 퍼즐 — **中 / EN / 日 / 한** 소크라테스식 AI 코치 포함.

[English →](README.md) | [中文 →](README.zh.md) | [日本語 →](README.ja.md)

![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript)
![Tailwind](https://img.shields.io/badge/Tailwind-v4-06b6d4?logo=tailwindcss)
![DeepSeek](https://img.shields.io/badge/DeepSeek-chat-4c6ef5)
![Supabase](https://img.shields.io/badge/Supabase-auth%2Bdb-3ecf8e?logo=supabase)

[Frank](https://github.com/frank99-owl)의 작은 프로젝트: 매일 하나의 Go(바둑 / 围棋 / 囲碁) 문제를 제공합니다. 급소를 탭하고, 막히면 AI가 소크라테스처럼 이끌어줍니다 — 답을 그냥 던져주는 게 아니라 질문을 던지며 가르쳐줍니다.

### 기획 & 에이전트 컨텍스트

- **[`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md)** — **현재 단계**, 완료 상태, 주의사항의 단일 진입점 (큰 변경사항 전에 먼저 읽으세요).
- **[`docs/phase2-next-steps.md`](docs/phase2-next-steps.md)** — Stripe, 권한 관리, 페이월에 대한 실행 및 승인 기준.
- **[`AGENTS.md`](AGENTS.md)** — AI 코딩 에이전트용 짧은 가이드.

## 기능

- **데일리 퍼즐** — 캘린더 날짜별로 하나, 로컬 라이브러리에서 순환
- **Canvas 바둑판** — 반응형 9x9 / 13x13 / 19x19, 호버 고스트 돌, HiDPI 선명 렌더링
- **4개 언어 UI** — 중국어 / 영어 / 일본어 / 한국어, URL 기반 라우팅 (`/zh/...`, `/en/...`)；기본 로케일은 영어
- **소크라테스식 온디맨드 코치** — 코치는 요청할 때만 말함; 정답 노트에 기반하여 환각을 일으키지 않음
- **라이브러리 + 복습** — 5개 난이도로 1,110문제 이상, 탐색 가능한 라이브러리와 오답 전용 복습 모드
- **연승 + 기록** — 연속 정답 일수, 정답률, 문제별 기록 (익명 시 localStorage, 로그인 시 Supabase)
- **공유 카드** — 오늘의 판 + 결과 1080x1080 PNG, 원탭 다운로드 또는 Web Share
- **인증 + 크로스 디바이스 동기화** — Supabase OAuth (Google 등), 자동으로 시도 기록 동기화
- **페이월 및 구독** — Stripe Checkout/Portal 통합, 무료 플랜 디바이스 및 할당량 제한, Pro 권한 설정 완료
- **간격 반복 (SRS)** — Pro 사용자는 복습 모드에서 오답에 대한 SM-2 간격 반복 스케줄링 제공
- **이메일 시스템** — Resend를 통한 트랜잭션(환영, 결제 실패) 및 일일 크론 이메일 발송

## 기술 스택

|            |                                                        |
| ---------- | ------------------------------------------------------ |
| Framework  | Next.js 16 (App Router, Turbopack) + React 19          |
| Language   | TypeScript strict                                      |
| Styling    | Tailwind CSS v4 (`@theme`)                             |
| Motion     | Framer Motion 12                                       |
| Icons      | lucide-react                                           |
| LLM        | DeepSeek `deepseek-chat` via OpenAI 호환 SDK           |
| Board      | Canvas 2D, 약 200줄, Go 라이브러리 미사용              |
| Auth + DB  | Supabase (Auth + Postgres + RLS)                       |
| Analytics  | PostHog (제품 분석)                                    |
| Monitoring | Sentry (오류 추적) + Vercel Analytics + Speed Insights |
| Emails     | Resend (트랜잭션 및 크론 이메일 발송)                  |
| Storage    | localStorage (익명) / Supabase (로그인) + IndexedDB 큐 |

## 프로젝트 구조

```
app/
  [locale]/               # URL 기반 i18n: /zh/、/en/、/ja/、/ko/
    today/                # 데일리 퍼즐
    puzzles/              # 라이브러리 목록 + [id] 상세
    result/               # 판정, 정답 공개, 코치, 공유 카드
    review/               # 오답 복습
    stats/                # 연승 / 정답률 / 기록
    about/                # 프로젝트 소개 페이지 (구 개발자 페이지)
  api/
    coach/route.ts        # LLM 프록시 (8KB 제한, 10 req/min/IP)
    report-error/route.ts # 클라이언트 오류 보고 엔드포인트
  auth/callback/route.ts  # OAuth 콜백 핸들러
  manifest.ts             # 동적 현지화 PWA 매니페스트
  layout.tsx              # 루트 레이아웃 (PostHogProvider, html lang)
components/
  GoBoard                 # canvas 판 + 클릭해서 두기 + 호버 고스트
  CoachDialogue           # 온디맨드 채팅
  ShareCard               # 오프스크린 canvas -> PNG / Web Share
  LocalizedLink           # 로케일 인식 next/link 래퍼
  Nav / LanguageToggle / PuzzleHeader
lib/
  localePath.ts           # 로케일 협상, URL 접두사/제거 헬퍼
  metadata.ts             # generateMetadata용 서버사이드 번역 헬퍼
  supabase/               # client.ts / server.ts / middleware.ts / service.ts
  posthog/                # client.ts / events.ts
  syncStorage.ts          # localStorage + IndexedDB 큐 + Supabase 동기화
  mergeOnLogin.ts         # 익명 -> 인증 데이터 병합 계획
  deviceId.ts             # 브라우저별 UUID + UA 설명
  deviceRegistry.ts       # 무료 플랜 단일 디바이스 페이월
  attemptKey.ts           # 정답 시도의 표준 중복 제거 키
  clientIp.ts             # IP 추출 (CF-Connecting-IP, X-Forwarded-For)
  board / judge / storage / puzzleOfTheDay / i18n / coachPrompt / rateLimit
content/
  puzzles.ts              # 환경 인식 진입점: 서버는 전체 데이터, 클라이언트는 경량 인덱스
  puzzles.server.ts       # 서버사이드 전체 데이터 로더
  data/
    puzzleIndex.json      # 경량 클라이언트사이드 인덱스 (요약만)
    classicalPuzzles.json  # 퍼블릭 도메인 문제집 (자동 생성)
    classicalPuzzles.json    # 전체 라이브러리 (자동 생성)
  messages/{zh,en,ja,ko}.json
  curatedPuzzles.ts       # 수기 선별 문제
types/
  index.ts                # Puzzle / AttemptRecord / CoachMessage / Locale
  schemas.ts              # zod 런타임 스키마 (API + 검증기 공유)
supabase/
  migrations/*.sql     # DB 스키마: profiles, attempts, subscriptions, stripe_events, user_devices
```

## 로컬 개발

```bash
cp .env.example .env.local
# .env.local을 열어 필요한 키를 입력 (아래 환경 변수 참조)

npm install
npm run dev
```

`http://localhost:3000`을 열고, 미들웨어가 협상된 로케일로 리다이렉트합니다 (예: `/en`).

## 환경 변수

| Name                            | Required | Default                    | Where                                                            |
| ------------------------------- | -------- | -------------------------- | ---------------------------------------------------------------- |
| `DEEPSEEK_API_KEY`              | yes      | —                          | 로컬에서는 `.env.local` / 프로덕션에서는 Vercel Project Settings |
| `NEXT_PUBLIC_SITE_URL`          | no       | `https://go-daily.app`     | 정규 URL, 사이트맵, robots                                       |
| `NEXT_PUBLIC_SUPABASE_URL`      | yes\*    | —                          | Supabase 프로젝트 URL (인증 + 데이터베이스)                      |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes\*    | —                          | Supabase 공개 키 (RLS와 함께 브라우저에 안전)                    |
| `SUPABASE_SERVICE_ROLE_KEY`     | yes\*    | —                          | Supabase 비밀 키 (서버 전용, RLS 무시)                           |
| `NEXT_PUBLIC_POSTHOG_KEY`       | no       | —                          | PostHog 프로젝트 API 키 (쓰기 전용, 브라우저에 안전)             |
| `NEXT_PUBLIC_POSTHOG_HOST`      | no       | `https://us.i.posthog.com` | PostHog 인제스트 호스트                                          |
| `NEXT_PUBLIC_SENTRY_DSN`        | no       | —                          | Sentry DSN (쓰기 전용 오류 인제스트)                             |
| `RATE_LIMIT_WINDOW_MS`          | no       | `60000` (60s)              | 레이트 제한 시간 창 (밀리초)                                     |
| `RATE_LIMIT_MAX`                | no       | `10`                       | IP당 시간 창당 최대 요청 수                                      |
| `UPSTASH_REDIS_REST_URL`        | no       | —                          | Upstash Redis URL (영속 레이트 제한)                             |
| `UPSTASH_REDIS_REST_TOKEN`      | no       | —                          | Upstash Redis 토큰                                               |
| `COACH_MODEL`                   | no       | `deepseek-chat`            | AI 코치 모델 식별자 (OpenAI 호환)                                |
| `STRIPE_SECRET_KEY`             | no       | —                          | Stripe 서버 측 비밀 키 (페이즈 2)                                |
| `STRIPE_WEBHOOK_SECRET`         | no       | —                          | Stripe Webhook 서명 시크릿 (페이즈 2)                            |
| `STRIPE_PRO_MONTHLY_PRICE_ID`   | no       | —                          | Stripe Pro 월간 Price ID (페이즈 2)                              |
| `STRIPE_PRO_YEARLY_PRICE_ID`    | no       | —                          | Stripe Pro 연간 Price ID (페이즈 2)                              |
| `STRIPE_TRIAL_DAYS`             | no       | `7`                        | Stripe 체험 기간 일수 (페이즈 2)                                 |

\*Supabase 변수는 인증과 클라우드 동기화에 필요. 익명 전용 모드로도 작동합니다.

`.env*`는 기본적으로 gitignore; `.env.example`만 커밋됩니다.

### 프로덕션 배포 참고 사항

- **레이트 제한**은 기본적으로 `MemoryRateLimiter`를 사용합니다. `UPSTASH_REDIS_REST_URL`과 `UPSTASH_REDIS_REST_TOKEN`이 설정되면 자동으로 `UpstashRateLimiter`로 전환됩니다.
- **모델 이름**은 선택적 `COACH_MODEL` 환경 변수로 제어 (기본값: `deepseek-chat`).
- **Analytics / Speed Insights**는 `@vercel/analytics`와 `@vercel/speed-insights`로 연결됨 (Vercel에서 제로 컨피그).
- **PostHog**와 **Sentry**가 구성됨. 해당 환경 변수를 설정하면 활성화.
- **CSP 헤더**는 프로덕션 보안을 위해 `next.config.ts`에 구성됨 (페이즈 2 Stripe 도메인 포함).

## 새 문제 추가

선별 문제는 `content/curatedPuzzles.ts`에 수기로 작성. 각 항목에는 다음이 필요:

- `stones[]` — 시작 위치 (좌상단을 원점으로 하는 0-인덱스 좌표)
- `correct[]` — 하나 이상의 허용 정답 포인트
- `prompt`와 `solutionNote`를 **4개 언어 모두**로

대량 가져오기의 경우 SGF 파일을 `scripts/sgf/`에 넣고 `npm run import:puzzles`를 실행. 출력은 `content/data/classicalPuzzles.json`으로.

데이터 진입 레이어(`content/puzzles.ts`)는 선별 및 가져온 소스를 집계. 서버에서는 `content/puzzles.server.ts`로 전체 퍼즐 데이터를 로드; 클라이언트에서는 경량 인덱스(`content/data/puzzleIndex.json`)만 가져옴.

코치는 `solutionNote[locale]`을 정답 정보로 받으므로 주의해서 작성하세요 — 모델은 노트에 없는 변화를 발명하지 않도록 지시받았습니다.

## 테스트

```bash
npm run test          # 544개 테스트, 68개 파일 (Vitest)
npm run test:watch    # 워치 모드
```

## 배포

프로덕션 도메인: **go-daily.app** (Cloudflare DNS -> Vercel).

GitHub 저장소를 Vercel에 가져오고 필요한 환경 변수를 설정하면, `main`에 대한 모든 푸시가 자동 배포됩니다.

**빌드 전략**:

- 선별 퍼즐 상세 페이지 (`/puzzles/[id]`)는 빌드 시 SSG
- 기타 퍼즐 상세 페이지는 ISR, 24시간 재검증
- 정적 페이지 수를 약 4,900개에서 약 300개로 줄여 빌드 속도 향상

## 알려진 제한 사항

- **LLM은 코치이지 판정자가 아닙니다.** DeepSeek은 제공된 정답 노트를 읽고 다시 말합니다 — 노트에 없는 변화를 환각으로 말할 수 있습니다.
- **포획 / 코우 로직 없음.** 판은 포획을 시뮬레이션하지 않습니다; 문제는 정답이 단일 급소가 되도록 선택되었습니다.
- **하나의 타임존, 하나의 퍼즐.** 데일리 전환은 로컬 자정이므로 타임존을 넘어가면 같은 문제가 표시되거나 건 넘어갈 수 있습니다.

---

(C) 2026 Frank.
