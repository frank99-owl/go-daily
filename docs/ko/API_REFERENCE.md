# API 라우트 레퍼런스

이 문서는 go-daily의 모든 API 라우트를 도메인별로 정리한 것입니다. 모든 라우트는 `app/api/` 아래에 위치한 Next.js 라우트 핸들러입니다.

---

## 1. 코치 API (`app/api/coach/route.ts`)

DeepSeek 기반 AI 코칭 대화 기능입니다.

### `POST /api/coach`

사용자 메시지를 전송하고 AI 코치의 응답을 받습니다.

**인증**: 필수 (Supabase 세션 쿠키).

**요청 본문** (JSON, `CoachRequestSchema`로 유효성 검증):

```typescript
{
  puzzleId: string;      // min 1 char
  locale: "zh" | "en" | "ja" | "ko";
  userMove: { x: number; y: number };
  isCorrect: boolean;
  personaId?: string;    // defaults to Go Seigen
  history: Array<{       // min 1 entry
    role: "user" | "assistant";
    content: string;
    ts: number;
  }>;
}
```

**성공 응답** (`200`):

```json
{ "reply": "string", "usage": { "plan", "dailyRemaining", "monthlyRemaining", ... } }
```

**오류 응답**:
| 상태 코드 | 코드 | 조건 |
|-----------|------|------|
| 400 | — | 잘못된 Content-Type, 본문 크기, JSON 또는 스키마 |
| 401 | `login_required` | 세션 없음 |
| 403 | `device_limit` | 무료 사용자가 1대 기기 초과 |
| 403 | — | 코칭이 승인되지 않은 퍼즐 |
| 429 | `daily_limit_reached` | 일일 사용량 소진 |
| 429 | `monthly_limit_reached` | 월간 사용량 소진 |
| 429 | — | IP 기반 요청 속도 제한 |
| 502 | — | 상위 LLM 오류 |
| 504 | — | 상위 타임아웃 (25초 초과) |

**적용된 가드**:

- Content-Length 제한 (본문 8KB, 헤더 10KB)
- IP 기반 요청 속도 제한 (Upstash Redis 또는 인메모리 폴백)
- 모든 사용자 메시지에 대한 프롬프트 인젝션 검사 (`guardUserMessage`)
- 입력값 살균 처리 (`sanitizeInput`)
- 코치 자격 확인 (퍼즐이 `coachEligibleIds.json`에 포함되어 있어야 함)
- 사용량 쿼터 적용 (사용자별 일간 + 월간 카운터)

### `GET /api/coach`

현재 사용자의 코치 사용량 요약을 조회합니다.

**인증**: 필수.

**응답** (`200`):

```json
{ "usage": { "plan", "dailyLimit", "monthlyLimit", "dailyUsed", "monthlyUsed", ... } }
```

---

## 2. 퍼즐 API

### `POST /api/puzzle/attempt` (`app/api/puzzle/attempt/route.ts`)

퍼즐 정답에 대해 사용자의 수를 검증합니다.

**인증**: 불필요 (공개 엔드포인트).

**요청 본문** (JSON, `PuzzleAttemptRequestSchema`로 유효성 검증):

```typescript
{
  puzzleId: string; // 1–120 chars
  userMove: {
    x: number;
    y: number;
  }
}
```

**응답** (`200`):

```json
{
  "puzzleId": "string",
  "userMove": { "x": 0, "y": 0 },
  "correct": true,
  "revealToken": "string" // 해답 열람용 단기 토큰
}
```

**가드**: 동일 출처 확인, IP + 퍼즐별 요청 속도 제한, 수 범위 유효성 검증.

### `POST /api/puzzle/reveal` (`app/api/puzzle/reveal/route.ts`)

유효한 reveal 토큰을 사용하여 퍼즐의 전체 해답을 공개합니다.

**인증**: 불필요 (토큰 기반 접근 제어).

**요청 본문**:

```typescript
{
  puzzleId: string;
  revealToken: string; // /api/puzzle/attempt에서 발급된 서명된 토큰
}
```

**응답** (`200`): `correct`, `solutionNote`, `solutionSequence`를 포함한 퍼즐 전체 해답.

### `POST /api/puzzle/random` (`app/api/puzzle/random/route.ts`)

"랜덤" 페이지용 임의의 퍼즐을 조회합니다.

**인증**: 불필요.

**응답** (`200`):

```json
{ "puzzleId": "string" }
```

임의로 선택된 퍼즐의 ID를 반환합니다. 클라이언트는 이후 별도로 전체 퍼즐 데이터를 조회합니다.

---

## 3. Stripe API (`app/api/stripe/`)

### `POST /api/stripe/checkout` (`checkout/route.ts`)

Pro 구독을 위한 Stripe Checkout 세션을 생성합니다.

**인증**: 필수.

**요청 본문**:

```typescript
{
  interval: "monthly" | "yearly";
}
```

**응답** (`200`): `{ "url": "https://checkout.stripe.com/..." }`

### `POST /api/stripe/portal` (`portal/route.ts`)

구독 관리를 위한 Stripe Customer Portal 세션을 생성합니다.

**인증**: 필수.

**응답** (`200`): `{ "url": "https://billing.stripe.com/..." }`

### `POST /api/stripe/webhook` (`webhook/route.ts`)

Stripe 웹훅 수신기입니다. `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed` 이벤트를 처리합니다.

**인증**: Stripe 서명 검증 (사용자 세션 불필요).

**동작**:

- `stripe_events` 테이블을 통한 멱등성 보장 (처리 전 이벤트 선점).
- `subscriptions` 테이블에 구독 상태를 업서트.
- `invoice.payment_failed` 발생 시 결제 실패 이메일 발송.

---

## 4. 인증 API

### `GET /auth/callback` (`app/auth/callback/route.ts`)

Supabase OAuth/매직링크 콜백입니다. 인증 코드를 세션으로 교환하고 적절한 locale 접두사가 붙은 페이지로 리다이렉트합니다.

### `POST /api/account/delete` (`app/api/account/delete/route.ts`)

인증된 사용자의 계정과 관련된 모든 데이터를 삭제합니다.

**인증**: 필수.

**응답** (`200`): `{ "ok": true }`

---

## 5. 이메일 API

### `GET /email/unsubscribe` (`app/email/unsubscribe/route.ts`)

일회성 토큰을 사용하여 일일 퍼즐 이메일 수신을 해제합니다.

**쿼리 파라미터**: `token` (`profiles.email_unsubscribe_token`에서 조회).

### `GET /api/cron/daily-email` (`app/api/cron/daily-email/route.ts`)

일일 퍼즐 리마인더 이메일 발송을 위한 Vercel Cron 핸들러입니다.

**인증**: 크론 시크릿 (`CRON_SECRET` 환경 변수).

---

## 6. 관찰 가능성 API

### `POST /api/report-error` (`app/api/report-error/route.ts`)

클라이언트 측 오류 보고 엔드포인트입니다. 브라우저의 `error`/`unhandledrejection` 핸들러로부터 구조화된 오류 보고를 수신합니다.

**인증**: 불필요 (공개, 요청 속도 제한 적용).

**요청 본문** (`ClientErrorReportSchema`로 유효성 검증):

```typescript
{
  message: string;
  stack?: string;
  url: string;
  timestamp: number;
  userAgent: string;
  locale?: "zh" | "en" | "ja" | "ko";
  puzzleId?: string;
}
```

---

## 7. 공통 관심사

### 요청 속도 제한

모든 쓰기 엔드포인트는 `createRateLimiter()`를 사용하며, 다음 중 하나를 반환합니다:

- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`이 설정된 경우 `UpstashRateLimiter` (프로덕션, 인스턴스 간 공유).
- 폴백으로 `MemoryRateLimiter` (개발, 단일 인스턴스).

기본값: 키당 60초 윈도우 동안 10회 요청.

### API 응답 헤더

모든 응답은 `lib/apiHeaders.ts`의 `createApiResponse()`를 거치며, 표준화된 보안 헤더가 설정됩니다.

### 런타임

모든 API 라우트는 `export const runtime = "nodejs"`를 지정하여 Node.js API에 접근할 수 있도록 합니다 (Edge Runtime 아님).
