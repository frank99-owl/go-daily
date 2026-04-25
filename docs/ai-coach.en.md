# AI Coach Documentation

> Chinese version: [ai-coach.md](./ai-coach.md)

---

## Table of Contents

1. [Feature Overview](#1-feature-overview)
2. [API Contract](#2-api-contract)
3. [System Prompt Construction](#3-system-prompt-construction)
4. [Model Configuration](#4-model-configuration)
5. [Rate Limiting](#5-rate-limiting)
6. [Session Storage](#6-session-storage)
7. [`isCurated` Gating](#7-iscurated-gating)
8. [Error Handling](#8-error-handling)
9. [Environment Variables](#9-environment-variables)
10. [Security Considerations](#10-security-considerations)

---

## 1. Feature Overview

The AI Coach is a Go-tutoring chat feature powered by DeepSeek, displayed on the **result page** (`app/[locale]/result/`). It helps users understand whether their move was correct and the underlying principles behind it.

**Feature highlights**:

- Replies in all 4 supported locales (matches the user's current UI language)
- Already knows the user's move and whether it was correct — the user doesn't need to re-describe it
- Ground-truth facts (correct answer, solution sequence, wrong branches) are injected into the system prompt to prevent hallucination
- Socratic tone: affirm and deepen when correct; diagnose the misread and hint when wrong — doesn't immediately give away the answer
- Conversation history persists for the lifetime of the browser tab (sessionStorage)

---

## 2. API Contract

### Endpoint

```
POST /api/coach
Content-Type: application/json
```

### Request Body

```ts
type CoachRequest = {
  puzzleId: string; // must exist in PUZZLES array
  locale: "zh" | "en" | "ja" | "ko";
  userMove: { x: number; y: number }; // 0-indexed coordinate
  isCorrect: boolean;
  history: CoachMessage[]; // at least 1 entry (the user's first question)
};
```

### Response Body (200 OK)

```ts
{
  reply: string;
}
```

### Error Responses

| HTTP Status | Reason                                              |
| ----------- | --------------------------------------------------- |
| 400         | Missing or malformed parameters                     |
| 404         | `puzzleId` not found                                |
| 413         | Request body exceeds 8 KB                           |
| 429         | Rate limit triggered (10 requests/minute/IP)        |
| 500         | Server missing `DEEPSEEK_API_KEY`                   |
| 502         | DeepSeek API call failed or returned an empty reply |

### Request Constraints

| Constraint               | Value                          |
| ------------------------ | ------------------------------ |
| Max request body         | 8 KB                           |
| Max conversation history | 6 messages (server truncates)  |
| Max message length       | 2 000 chars (server truncates) |
| Rate limit               | 10 req/min per IP              |

---

## 3. System Prompt Construction

Source: `lib/coachPrompt.ts` → `buildSystemPrompt()`

### 3.1 Prompt Structure

```
[ROLE SETUP]
  You are a friendly Go coach…
  Socratic tone…
  Keep replies short (2–4 paragraphs)…
  Treat solutionNote and correct[] as ground truth; never invent new solutions…

[POSITION]
  Board size and coordinate explanation
  Black stones on board
  White stones on board
  Who plays next
  Accepted correct point(s)
  Tag and difficulty

[STUDENT'S MOVE]
  User's move coordinate + CORRECT / INCORRECT

[SOLUTION SEQUENCE]  (if present)
  Step-by-step correct variation

[COMMON WRONG BRANCHES]  (if present)
  Wrong move → refutation sequence

[SOLUTION NOTE]
  localized(puzzle.solutionNote, locale)  ← in the user's language

[STYLE]
  Locale-specific tone instructions (Chinese / English / Japanese / Korean)
```

### 3.2 Key Design Decisions

**Ground-truth injection**: `solutionNote`, `solutionSequence`, and `wrongBranches` are all injected into the system prompt. The model doesn't need to reason about the position from scratch — it only needs to explain the already-known correct answer. This is the core mechanism for preventing LLM hallucination in Go analysis.

**Move and result pre-loaded**: the client judges correctness when the user submits, and the server bakes this into the system prompt. The coach has full context from the very first message.

**`localized()` fallback**: the system prompt uses `localized(puzzle.solutionNote, locale)` rather than direct indexing, ensuring a graceful fallback when a locale field is empty.

---

## 4. Model Configuration

```ts
const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com",
});

const completion = await client.chat.completions.create({
  model: "deepseek-chat",
  messages: openaiMessages,
  temperature: 0.6,
  max_tokens: 400,
});
```

| Parameter     | Value                      | Notes                                                                       |
| ------------- | -------------------------- | --------------------------------------------------------------------------- |
| `model`       | `deepseek-chat`            | DeepSeek V3 (OpenAI-compatible API)                                         |
| `baseURL`     | `https://api.deepseek.com` | DeepSeek's OpenAI-compatible endpoint                                       |
| `temperature` | `0.6`                      | Moderate — accurate Go explanations with natural tone variation             |
| `max_tokens`  | `400`                      | Roughly 300 Chinese characters or 400 English words — keeps replies concise |

The `openai` npm package is used (not the Anthropic SDK); only `baseURL` needs changing to reuse the OpenAI client protocol with DeepSeek.

---

## 5. Rate Limiting

Defaults to `MemoryRateLimiter` (in-process `Map<string, number[]>`). Parameters are adjustable via the `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` environment variables.

When `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are configured, the app automatically switches to `UpstashRateLimiter` for cross-instance persistent rate limiting.

IP extraction priority: `CF-Connecting-IP` → `X-Forwarded-For` (first hop) → `X-Real-IP` → fallback to `"unknown"`.

See `lib/clientIp.ts`.

---

## 6. Session Storage

The client stores conversation history as `CoachMessage[]` in `sessionStorage` under the key `go-daily.coach.${puzzleId}.${locale}`.

```ts
interface CoachMessage {
  role: "user" | "assistant";
  content: string;
  ts: number; // display-only timestamp; server ignores it
}
```

**Lifetime**: cleared when the tab closes. Survives page refresh and navigation away then back (same tab).

**History trimming**: the server only forwards the last `MAX_HISTORY = 6` messages to prevent the prompt from growing too large.

---

## 7. `isCurated` Gating

```ts
// app/[locale]/result/ResultClient.tsx (illustrative)
{puzzle.isCurated !== false && (
  <CoachPanel puzzle={puzzle} ... />
)}
```

When `puzzle.isCurated === false`, the coach panel is entirely hidden — not rendered, not fetched.

**Reason**: bulk-imported puzzles don't have hand-reviewed `solutionNote` content. Injecting an empty string into the system prompt lets the model free-associate without any grounding facts, producing incorrect Go explanations.

---

## 8. Error Handling

### Client Side

On network or API error, the chat panel shows an error message (not a loading indicator) and lets the user retry.

### Server Side (`app/api/coach/route.ts`)

```ts
try {
  // DeepSeek API call
} catch (err) {
  console.error("[coach] upstream error:", err);
  return NextResponse.json(
    { error: "Coach is temporarily unavailable. Please try again later." },
    { status: 502 },
  );
}
```

All errors return JSON `{ error: string }`; HTTP status reflects the error category (see Section 2).

---

## 9. Environment Variables

| Variable                   | Required | Default         | Description                                                |
| -------------------------- | -------- | --------------- | ---------------------------------------------------------- |
| `DEEPSEEK_API_KEY`         | ✅       | —               | DeepSeek API key; all coach requests return 500 without it |
| `COACH_MODEL`              | —        | `deepseek-chat` | Model identifier for the AI coach                          |
| `RATE_LIMIT_WINDOW_MS`     | —        | `60000`         | Rate-limit time window in milliseconds                     |
| `RATE_LIMIT_MAX`           | —        | `10`            | Max requests per window per IP                             |
| `UPSTASH_REDIS_REST_URL`   | —        | —               | Upstash Redis REST URL; enables persistent rate limiting   |
| `UPSTASH_REDIS_REST_TOKEN` | —        | —               | Upstash Redis REST Token                                   |

**Local development**: create `.env.local` in the project root:

```
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxx
# Optional: switch model
# COACH_MODEL=deepseek-chat
# Optional: adjust rate limit parameters
# RATE_LIMIT_WINDOW_MS=60000
# RATE_LIMIT_MAX=10
# Optional: enable Upstash Redis persistent rate limiting
# UPSTASH_REDIS_REST_URL=https://...
# UPSTASH_REDIS_REST_TOKEN=...
```

**Vercel deployment**: add in Project Settings → Environment Variables, enabled for Production + Preview + Development.

---

## 10. Security Considerations

| Risk                                  | Mitigation                                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Large malicious request bodies        | 8 KB hard cap (checked via `content-length` header)                                                           |
| API abuse / flood                     | In-process rate limiting (not shared across instances); fail-open on rate-limiter failure — service continues |
| Content injection via message history | Each `content` is truncated to 2 000 chars; max 6 messages forwarded                                          |
| Forged `puzzleId`                     | Server looks up `puzzleId` in `PUZZLES`; unknown IDs return 404                                               |
| System prompt leakage                 | Client only receives `reply`; system prompt is built server-side only and never sent in the response          |
| API key exposure                      | Stored in server-side environment variable; never sent to the browser                                         |

---

_Related docs: [architecture.en.md](./architecture.en.md) · [data-schema.en.md](./data-schema.en.md) · [extensibility.en.md](./extensibility.en.md)_
