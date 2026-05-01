# API Route Reference

This document catalogs every API route in go-daily, organized by domain. All routes are Next.js Route Handlers under `app/api/`.

---

## 1. Coach API (`app/api/coach/route.ts`)

AI coaching dialogue powered by DeepSeek.

### `POST /api/coach`

Send a user message and receive an AI coach reply.

**Auth**: Required (Supabase session cookie).

**Request Body** (JSON, validated by `CoachRequestSchema`):

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

**Success Response** (`200`):

```json
{ "reply": "string", "usage": { "plan", "dailyRemaining", "monthlyRemaining", ... } }
```

**Error Responses**:
| Status | Code | Condition |
|--------|------|-----------|
| 400 | — | Invalid Content-Type, body size, JSON, or schema |
| 401 | `login_required` | No session |
| 403 | `device_limit` | Free user exceeded 1 device |
| 403 | — | Puzzle not approved for coaching |
| 429 | `daily_limit_reached` | Daily quota exhausted |
| 429 | `monthly_limit_reached` | Monthly quota exhausted |
| 429 | — | IP rate limit |
| 502 | — | Upstream LLM error |
| 504 | — | Upstream timeout (>25s) |

**Guards Applied**:

- Content-Length cap (8 KB body, 10 KB header)
- IP rate limiting (Upstash Redis or in-memory fallback)
- Prompt injection screening on all user messages (`guardUserMessage`)
- Input sanitization (`sanitizeInput`)
- Coach eligibility check (puzzle must be in `coachEligibleIds.json`)
- Usage quota enforcement (per-user daily + monthly counters)

### `GET /api/coach`

Retrieve current user's coach usage summary.

**Auth**: Required.

**Response** (`200`):

```json
{ "usage": { "plan", "dailyLimit", "monthlyLimit", "dailyUsed", "monthlyUsed", ... } }
```

---

## 2. Puzzle API

### `POST /api/puzzle/attempt` (`app/api/puzzle/attempt/route.ts`)

Validate a user's move against the puzzle solution.

**Auth**: Not required (public endpoint).

**Request Body** (JSON, validated by `PuzzleAttemptRequestSchema`):

```typescript
{
  puzzleId: string; // 1–120 chars
  userMove: {
    x: number;
    y: number;
  }
}
```

**Response** (`200`):

```json
{
  "puzzleId": "string",
  "userMove": { "x": 0, "y": 0 },
  "correct": true,
  "revealToken": "string" // short-lived token for viewing the solution
}
```

**Guards**: Same-origin check, IP + per-puzzle rate limiting, move bounds validation.

### `POST /api/puzzle/reveal` (`app/api/puzzle/reveal/route.ts`)

Reveal the full solution for a puzzle using a valid reveal token.

**Auth**: Not required (token-gated).

**Request Body**:

```typescript
{
  puzzleId: string;
  revealToken: string; // signed token from /api/puzzle/attempt
}
```

**Response** (`200`): Full puzzle solution including `correct`, `solutionNote`, and `solutionSequence`.

### `GET /api/puzzle/random` (`app/api/puzzle/random/route.ts`)

Get a random puzzle for the "Random" page.

**Auth**: Not required.

**Response** (`200`): A `PublicPuzzle` object (no solution data).

---

## 3. Stripe API (`app/api/stripe/`)

### `POST /api/stripe/checkout` (`checkout/route.ts`)

Create a Stripe Checkout session for Pro subscription.

**Auth**: Required.

**Request Body**:

```typescript
{
  interval: "monthly" | "yearly";
}
```

**Response** (`200`): `{ "url": "https://checkout.stripe.com/..." }`

### `POST /api/stripe/portal` (`portal/route.ts`)

Create a Stripe Customer Portal session for managing subscription.

**Auth**: Required.

**Response** (`200`): `{ "url": "https://billing.stripe.com/..." }`

### `POST /api/stripe/webhook` (`webhook/route.ts`)

Stripe webhook receiver. Handles `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, and `invoice.payment_failed` events.

**Auth**: Stripe signature verification (no user session).

**Behavior**:

- Idempotency via `stripe_events` table (claims event before processing).
- Upserts subscription state into `subscriptions` table.
- Sends payment-failed email on `invoice.payment_failed`.

---

## 4. Auth API

### `GET /auth/callback` (`app/auth/callback/route.ts`)

Supabase OAuth/magic-link callback. Exchanges the auth code for a session and redirects to the appropriate locale-prefixed page.

### `POST /api/account/delete` (`app/api/account/delete/route.ts`)

Delete the authenticated user's account and all associated data.

**Auth**: Required.

**Response** (`200`): `{ "ok": true }`

---

## 5. Email API

### `GET /email/unsubscribe` (`app/email/unsubscribe/route.ts`)

Unsubscribe from daily puzzle emails using a one-time token.

**Query Params**: `token` (from `profiles.email_unsubscribe_token`).

### `POST /api/cron/daily-email` (`app/api/cron/daily-email/route.ts`)

Vercel Cron handler for sending daily puzzle reminder emails.

**Auth**: Cron secret (`CRON_SECRET` env var).

---

## 6. Observability API

### `POST /api/report-error` (`app/api/report-error/route.ts`)

Client-side error reporting endpoint. Accepts structured error reports from browser `error`/`unhandledrejection` handlers.

**Auth**: Not required (public, rate-limited).

**Request Body** (validated by `ClientErrorReportSchema`):

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

## 7. Cross-Cutting Concerns

### Rate Limiting

All write endpoints use `createRateLimiter()` which returns either:

- `UpstashRateLimiter` (production, cross-instance) when `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are set.
- `MemoryRateLimiter` (dev, single-instance) as fallback.

Default: 10 requests per 60-second window per key.

### API Response Headers

All responses pass through `createApiResponse()` from `lib/apiHeaders.ts`, which sets standardized security headers.

### Runtime

All API routes specify `export const runtime = "nodejs"` to ensure access to Node.js APIs (not Edge Runtime).
