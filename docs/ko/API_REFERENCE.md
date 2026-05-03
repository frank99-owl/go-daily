# API 라우트 레퍼런스

이 문서는 go-daily의 모든 API 라우트를 도메인별로 정리한 것입니다. 모든 라우트는 `app/api/` 아래에 위치한 Next.js 라우트 핸들러입니다.

---

## 1. 코치 API (`app/api/coach/route.ts`)

DeepSeek 기반 AI 코칭 대화 기능입니다.

### `POST /api/coach`

응답은 **SSE(Server-Sent Events)** 로 스트리밍됩니다.

**인증**: 선택 사항. 로그인 사용자는 Supabase 세션 Cookie를 사용합니다. **디바이스 지문을 쓰는 클라이언트는 `x-go-daily-device-id`**(무료 플랜 단일 기기석, `getCoachState`). **게스트는 `x-go-daily-guest-device-id`**(더 낮은 할당량).

**요청 본문** (JSON, `CoachRequestSchema`):

**참고**:

- **정답 여부는 클라이언트가 보내지 않습니다**. 서버가 `judgeMove(puzzle, userMove)`로 판별하고 시스템 프롬프트(`buildSystemPrompt`)에 반영합니다.
- 히스토리는 총 **6,000자**(최신 우선) + 메시지당 **2,000자**까지, 그 전에 최대 **6**턴까지 유지됩니다.
- `personaId`를 보낼 때는 `ke-jie`, `lee-sedol`, `go-seigen`, `iyama-yuta`, `shin-jinseo`, `custom` 중 하나(`CoachRequestSchema`). 생략 시 기본은 `go-seigen`(고 세이겐 스타일).

```typescript
{
  puzzleId: string;      // min 1 char
  locale: "zh" | "en" | "ja" | "ko";
  userMove: { x: number; y: number };
  personaId?: string;    // defaults to Go Seigen
  history: Array<{       // min 1 entry
    role: "user" | "assistant";
    content: string;
    ts: number;
  }>;
}
```

**성공** (`200`): `Content-Type: text/event-stream`. SSE `data:` 한 줄당 JSON 형태는 아래와 같습니다.

| 페이로드                             | 의미                                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| `{ "delta": "..." }`                 | 조각별 어시스턴트 텍스트                                                     |
| `{ "done": true, "usage": { ... } }` | 종료. 본 요청에서 **증가 적용 후** 할당량                                    |
| `{ "error": "<code>" }`              | 중간 실패. `<code>`: `upstream_error`, `timeout`, `rate_limit`, `auth_error` |

스트림 시작 전에 사용량이 먼저 증가합니다. 연결을 끊어도 해당 횟수는 차감됩니다.

**JSON 오류**(SSE 시작 전):

| 상태            | 조건                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------- |
| 400             | Content-Type / JSON / 스키마 문제, 또는 `x-go-daily-guest-device-id` 헤더가 128자 초과   |
| 401             | `login_required` … 세션·게스트 헤더 모두 없음                                            |
| 403             | `forbidden` … 동일 출처 변이 / CSRF (`parseMutationBody`)                                |
| 403             | `device_limit` … `getCoachState` 기기 한도                                               |
| 403             | `coach_unavailable` … 코칭 미승인 퍼즐 (`getCoachAccess`)                                |
| 404             | 알 수 없는 `puzzleId`                                                                    |
| 413             | 본문 **8 KB** 초과 (`MAX_BODY_BYTES`)                                                    |
| 429             | `daily_limit_reached` … 일일 한도 또는(게스트만) **IP 일일**(`usage`가 `null`일 수 있음) |
| 429             | `monthly_limit_reached`                                                                  |
| 429             | 일반 IP 속도 제한                                                                        |
| 500             | `DEEPSEEK_API_KEY` 누락                                                                  |
| 500             | `quota_write_failed` … 사용량 카운트 쓰기 실패 (DB/RPC 오류)                             |
| 502 / 504 / 429 | SSE 전 프로바이더 실패 시 JSON `{ "error": "..." }`(타임아웃은 `504`)                    |

**가드**:

- 본문 **8 KB**, 동일 출처, IP 제한(`createRateLimiter`: **프로덕션**은 Upstash 필수, **개발**만 인메모리), `guardUserMessage`, `sanitizeInput`, `coachEligibleIds.json` 및 `checkCoachEligibility` / `getCoachAccess` 런타임 검사, 할당량(Postgres RPC — DATABASE 문서 참고). 게스트 기기별 행은 `service_role`만. **게스트 IP 일일 상한**(`checkIpLimit`, `GUEST_IP_DAILY_LIMIT`, 현재 IP당 UTC 일 **20**회)은 Upstash 설정 시 Redis, 아니면 `guestCoachUsage.ts` 인메모리 `Map`.

### `GET /api/coach`

현재 호출자의 코치 사용량 요약.

**인증**: 선택 사항. 로그인 시 Cookie 및 선택적 `x-go-daily-device-id`. 게스트는 `x-go-daily-guest-device-id`. 둘 다 없으면 `401`.

**응답** (`200`):

```json
{
  "usage": {
    "plan",
    "dailyLimit",
    "monthlyLimit",
    "dailyUsed",
    "monthlyUsed",
    "dailyRemaining",
    "monthlyRemaining",
    "timeZone",
    "monthWindowKind",
    "monthWindowStart",
    "monthWindowEnd",
    "billingAnchorDay"
  }
}
```

로그인 사용자는 `coach.available === false`이면 `usage`가 `null`일 수 있습니다. 게스트는 헤더가 있으면 항상 객체입니다.

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
- `Content-Length > 1 MB`인 요청은 본문 읽기 전에 HTTP 413으로 거부됩니다.

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

## 7. 상태 확인 API

### `GET /api/health` (`app/api/health/route.ts`)

모니터링용 경량 헬스 프로브입니다.

**인증**: 불필요.

**동작**: `NEXT_PUBLIC_SUPABASE_URL` 및 `NEXT_PUBLIC_SUPABASE_ANON_KEY`가 설정되어 있으면 `${SUPABASE_URL}/auth/v1/settings`를 프로브합니다(5초 타임아웃). 미설정이면 `supabase`는 `skipped`로 표시되며 여전히 healthy를 반환합니다.

**응답** (`200`): `{ "status": "healthy", "timestamp": ISO8601, "checks": { "supabase": "ok" | "error" | "skipped" } }`

**응답** (`503`): Supabase 프로브 실패 시 `{ "status": "degraded", ... }`.

---

## 8. 관리자 API (`app/api/admin/`)

`ADMIN_EMAILS`(쉼표 구분 허용 목록)와 `ADMIN_PIN`으로 보호되는 운영 엔드포인트입니다.

### `POST /api/admin/verify` (`verify/route.ts`)

이메일이 관리자로 확인된 뒤 PIN을 검증합니다.

**인증**: 필수(세션; `user.email`이 `ADMIN_EMAILS`에 있어야 함).

**동일 출처**: POST는 동일 출처 검사를 통과해야 합니다.

**요청 본문** (JSON): `{ "pin": string }` — `ADMIN_PIN`과 일치해야 합니다.

**응답**: `200` `{ "ok": true }`; 미로그인 `401`; 허용 목록 외 또는 PIN 오류 `403`; `ADMIN_PIN` 미설정 `500`.

### `GET /api/admin/grants` (`grants/route.ts`)

수동 Pro 부여(`manual_grants`) 목록을 반환합니다.

**인증**: 세션 이메일이 `ADMIN_EMAILS`에 포함되어야 합니다.

**응답** (`200`): `{ "grants": [{ "email", "expires_at", "granted_by", "created_at" }, ...] }`

### `POST /api/admin/grants`

이메일 기준으로 수동 부여를 upsert합니다(`onConflict: email`).

**인증**: 관리자 세션. 동일 출처 POST.

**요청 본문**: `{ "email": string, "days": number /* 1–3650 */, "granted_by"?: string }`

**응답** (`200`): `{ "ok": true, "email", "expires_at" }`

### `DELETE /api/admin/grants`

수동 부여를 제거합니다.

**인증**: 관리자 세션. 동일 출처 변경 요청.

**요청 본문**: `{ "email": string }`

**응답** (`200`): `{ "ok": true }`

---

## 9. 공통 관심사

### 요청 속도 제한

쓰기 엔드포인트는 `createRateLimiter()`를 쓰며 동작은 다음과 같습니다.

- **`UPSTASH_REDIS_REST_URL`과 `UPSTASH_REDIS_REST_TOKEN`이 모두 설정됨**: `UpstashRateLimiter`(Redis, 다중 인스턴스).
- **둘 중 하나라도 없고 `NODE_ENV !== "production"`**: `MemoryRateLimiter`(단일 프로세스 전용).
- **둘 중 하나라도 없고 `NODE_ENV === "production"`**: 라우트 모듈 로드 시 `createRateLimiter()`가 **예외를 던짐** — 프로덕션에서는 Upstash 필수(`lib/rateLimit.ts` 참고).

`MemoryRateLimiter`는 키 상한 50,000개, 초과 시 가장 먼저 들어온 키를 제거하고 주기적으로 유휴 키를 정리합니다. 기본값: 키당 60초 윈도우에 10회(`RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX`로 재정의 가능).

### 요청 본문 파싱

모든 변경 라우트는 `lib/apiHeaders.ts`의 `parseMutationBody()`를 사용하여 Content-Type, Content-Length, CSRF, JSON 파싱을 공통 처리합니다.

### API 응답 헤더

모든 응답은 `lib/apiHeaders.ts`의 `createApiResponse()`를 거치며, 표준화된 보안 헤더가 설정됩니다.

### 런타임

Stripe, 코치, cron, admin, 퍼즐 변형 등 통합이 무거운 핸들러는 `export const runtime = "nodejs"`를 지정합니다. `/api/health` 같은 경량 라우트는 기본 런타임을 사용합니다.
