# API Route Reference

This document catalogs every API route in go-daily, organized by domain. All routes are Next.js Route Handlers under `app/api/`.

---

## 1. Coach API (`app/api/coach/route.ts`)

AI coaching dialogue powered by DeepSeek.

### `POST /api/coach`

Send a user message and receive an AI coach reply as a streamed assistant message.

**Auth**: Optional. Logged-in users use the Supabase session cookie **and should send `x-go-daily-device-id`** when the client tracks a device fingerprint (required for Free-plan device-seat logic in `getCoachState`). Guest users send `x-go-daily-guest-device-id` (lower quotas).

**Request Body** (JSON, validated by `CoachRequestSchema`):

**Notes**:

- Move correctness is **not** part of the request. The handler runs `judgeMove(puzzle, userMove)` and passes the result into the system prompt (`buildSystemPrompt`).
- History messages are subject to a total character budget of 6,000 characters (newest-first truncation), in addition to per-message truncation at 2,000 characters. At most the last 6 turns are kept before the budget trim.
- When provided, `personaId` must be one of: `ke-jie`, `lee-sedol`, `go-seigen`, `iyama-yuta`, `shin-jinseo`, `custom` (`CoachRequestSchema`); omitted selects Go Seigen (`go-seigen`).

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

**Success Response** (`200`): Server-Sent Events (`Content-Type: text/event-stream`). The body is SSE `data:` lines whose JSON payloads may be:

| Payload                              | Meaning                                                                                              |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `{ "delta": "..." }`                 | Partial assistant text (streamed)                                                                    |
| `{ "done": true, "usage": { ... } }` | Stream finished; `usage` is the quota snapshot **after** the increment applied for this request      |
| `{ "error": "<code>" }`              | Stream failed mid-flight; `<code>` is one of `upstream_error`, `timeout`, `rate_limit`, `auth_error` |

Counters are incremented **before** streaming begins, so aborted connections still consume quota.

**JSON error responses** (no SSE body — returned before streaming starts):

| Status          | Code / body             | Condition                                                                                                                        |
| --------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 400             | —                       | Invalid Content-Type, JSON, schema, malformed request, or `x-go-daily-guest-device-id` header exceeds 128 characters             |
| 401             | `login_required`        | No session and no `x-go-daily-guest-device-id`                                                                                   |
| 403             | `error: "forbidden"`    | Failed same-origin mutation / CSRF guard (`parseMutationBody`)                                                                   |
| 403             | `device_limit`          | Free user exceeded device limit (`getCoachState`)                                                                                |
| 403             | `coach_unavailable`     | Puzzle not coach-eligible (`getCoachAccess`)                                                                                     |
| 404             | —                       | Unknown `puzzleId`                                                                                                               |
| 413             | —                       | Body larger than **8 KB** (`MAX_BODY_BYTES`)                                                                                     |
| 429             | `daily_limit_reached`   | User or guest **daily** coach quota exhausted, **or** (guest-only) **per-IP daily** cap (`checkIpLimit` — `usage` may be `null`) |
| 429             | `monthly_limit_reached` | **Monthly** quota exhausted                                                                                                      |
| 429             | —                       | Generic IP rate limiter (`rateLimiter`)                                                                                          |
| 500             | —                       | Missing `DEEPSEEK_API_KEY` on server                                                                                             |
| 500             | `quota_write_failed`    | Failed to increment usage counter (DB/RPC error)                                                                                 |
| 502 / 504 / 429 | —                       | Provider fails before SSE starts (JSON `{ "error": "..." }`; timeout uses `504`)                                                 |

**Guards Applied**:

- Content-Length cap (**8 KB** body via `parseMutationBody`; same-origin check)
- IP rate limiting via `createRateLimiter` (Upstash Redis **required** in production; in-process `MemoryRateLimiter` only in non-production)
- Prompt injection screening on all user messages (`guardUserMessage`)
- Input sanitization (`sanitizeInput`)
- Coach eligibility check (puzzle ID allowlist in `coachEligibleIds.json` **and** runtime quality gates via `checkCoachEligibility` / `getCoachAccess`)
- Usage quota enforcement (per-user daily + monthly counters; Postgres RPC increments — see Database Schema)
- Guest usage persisted in Supabase `guest_coach_usage` via `service_role`; **per-IP daily** guest caps (`checkIpLimit`, `GUEST_IP_DAILY_LIMIT` — currently 20/IP/UTC day) use **Upstash** when `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are set, otherwise an in-process `Map` in `guestCoachUsage.ts`.

### `GET /api/coach`

Retrieve coach usage summary for the current caller.

**Auth**: Optional. Logged-in users use the Supabase session cookie and may pass `x-go-daily-device-id` for device-seat evaluation. Guests may pass `x-go-daily-guest-device-id` to read guest quota usage. Requests with neither session nor guest header return `401`.

**Response** (`200`):

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

For logged-in users, `usage` may be `null` when coach entitlements resolve to unavailable (`coach.available === false`). Guests always receive a numeric guest quota object when `x-go-daily-guest-device-id` is present.

**Headers**: Same optional `x-go-daily-device-id` / `x-go-daily-guest-device-id` convention as POST.

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

### `POST /api/puzzle/random` (`app/api/puzzle/random/route.ts`)

Get a random puzzle for the "Random" page.

**Auth**: Not required.

**Response** (`200`):

```json
{ "puzzleId": "string" }
```

Returns the ID of a randomly selected puzzle. The client then fetches the full puzzle data separately.

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
- Requests with `Content-Length > 1 MB` are rejected with HTTP 413 before reading the body.

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

### `GET /api/cron/daily-email` (`app/api/cron/daily-email/route.ts`)

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

## 7. Health API

### `GET /api/health` (`app/api/health/route.ts`)

Lightweight uptime probe for monitoring.

**Auth**: Not required.

**Behavior**: When `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set, probes `${SUPABASE_URL}/auth/v1/settings` (5s timeout). If env vars are missing, Supabase is marked `skipped` and the handler still returns healthy.

**Response** (`200`): `{ "status": "healthy", "timestamp": ISO8601, "checks": { "supabase": "ok" | "error" | "skipped" } }`

**Response** (`503`): `{ "status": "degraded", ... }` when the Supabase probe fails.

---

## 8. Admin API (`app/api/admin/`)

Operational routes protected by `ADMIN_EMAILS` (comma-separated allowlist) and `ADMIN_PIN`. Intended for trusted operators only.

### `POST /api/admin/verify` (`verify/route.ts`)

Verify the configured admin PIN after the user’s email is confirmed as an admin.

**Auth**: Required (session; `user.email` must appear in `ADMIN_EMAILS`).

**Same-origin**: Required (`isSameOriginMutationRequest`).

**Request Body** (JSON): `{ "pin": string }` — must equal `ADMIN_PIN`.

**Responses**: `200` `{ "ok": true }`; `401` if not signed in; `403` wrong PIN or not allowlisted; `500` if `ADMIN_PIN` is unset.

### `GET /api/admin/grants` (`grants/route.ts`)

List manual Pro grants (`manual_grants` table).

**Auth**: Session email must be in `ADMIN_EMAILS`.

**Response** (`200`): `{ "grants": [{ "email", "expires_at", "granted_by", "created_at" }, ...] }`

### `POST /api/admin/grants`

Upsert a manual grant by email (`onConflict: email`).

**Auth**: Admin session. Same-origin POST.

**Request Body**: `{ "email": string, "days": number /* 1–3650 */, "granted_by"?: string }`

**Response** (`200`): `{ "ok": true, "email", "expires_at" }`

### `DELETE /api/admin/grants`

Remove a manual grant.

**Auth**: Admin session. Same-origin mutation.

**Request Body**: `{ "email": string }`

**Response** (`200`): `{ "ok": true }`

---

## 9. Cross-Cutting Concerns

### Rate Limiting

Write endpoints use `createRateLimiter()`, which behaves as follows:

- When **`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are both set**: `UpstashRateLimiter` (Redis-backed, multi-instance).
- When **either is missing** and `NODE_ENV !== "production"`: `MemoryRateLimiter` (in-process only).
- When **either is missing** and `NODE_ENV === "production"`: `createRateLimiter()` **throws** when the route module loads — production deploys must configure Upstash (see `lib/rateLimit.ts`).

`MemoryRateLimiter` caps tracked keys at 50,000; when over cap it deletes the oldest key by insertion order, and a periodic sweep drops idle keys. Default window: 10 requests per 60-second window per key (override via `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX`).

### Body Parsing

All mutation routes use `parseMutationBody()` from `lib/apiHeaders.ts` for shared Content-Type, Content-Length, CSRF, and JSON parsing.

### API Response Headers

All responses pass through `createApiResponse()` from `lib/apiHeaders.ts`, which sets standardized security headers.

### Runtime

Integration-heavy handlers (Stripe, coach, cron, admin, puzzle mutations, etc.) set `export const runtime = "nodejs"` so Node-only APIs are available. Lightweight routes such as `/api/health` rely on the default runtime.
