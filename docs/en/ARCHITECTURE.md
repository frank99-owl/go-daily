# Technical Architecture & Core Modules

This document describes the internal structure of go-daily, reflecting the nine-domain structure of the `lib/` directory and the centralized middleware logic.

## 1. The Global Request Lifecycle (`proxy.ts`)

Everything user-facing passes through the `proxy.ts` middleware. It handles four critical tasks in a single pass:

1.  **Manifest Special-Case Handling**: Intercepts requests for the PWA manifest and serves the appropriate version.
2.  **Exempt Path Passthrough**: Lets certain paths (static assets, API webhooks, etc.) bypass all middleware logic.
3.  **Session Refresh & Auth Redirect**: Using `@supabase/ssr`, it refreshes the session cookie on every navigation to keep Server Components hydrated with fresh user state. Already-prefixed paths (`/en/account`, etc.) are guarded here — unauthenticated users hitting `/account` are redirected to `/login?next=...`, and authenticated users hitting `/login` are redirected to `/account`.
4.  **Locale Negotiation**: For unprefixed paths, it handles the 308 (Permanent) redirect matrix to ensure every path is locale-prefixed (`/{zh|en|ja|ko}/...`).

## 2. Core Domain Modules (`lib/`)

### `lib/env.ts` (Environment Validation)

A centralized, Zod-based environment variable validator. Each domain (Coach, Stripe, Supabase, Reveal) has its own schema and a lazy-validated singleton accessor (`getCoachEnv()`, `getStripeEnv()`, etc.). Missing variables surface as clear startup-style errors at first use rather than silent 500s deep in a route handler. Browser-side Supabase files (`client.ts`, `middleware.ts`) maintain their own inline validation since `lib/env.ts` is server-only.

### `lib/auth/` & `lib/supabase/`

- **The Bridge**: We use a dual-client strategy. `client.ts` for browser-side hooks and `server.ts` for App Router async server components.
- **Service Layer**: `service.ts` uses the `service_role` key to bypass RLS for background tasks like Stripe webhooks or cron emails.

### `lib/storage/` (Persistence Engine)

The system operates on a three-state synchronization model:

1.  **`anon` (LocalStorage only)**: Primary source for non-logged-in users. No network calls are made.
2.  **`logged-in-online` (LocalStorage + IndexedDB queue + Supabase)**: For authenticated users with an active connection. Writes go to LocalStorage for instant feedback, are enqueued in IndexedDB as a durable buffer, and are batch-flushed to Supabase immediately via `syncStorage.ts`.
3.  **`logged-in-offline` (LocalStorage + IndexedDB queue)**: For authenticated users who have lost connectivity. Writes still go to LocalStorage and IndexedDB, but the Supabase flush is deferred. A retry mechanism triggers the sync when the `online` event fires or on the next page load.

### `lib/coach/` (AI Intelligence)

- **Prompting**: Centralized in `coachPrompt.ts` to ensure consistency in Socratic tutoring across different puzzles.
- **Budgeting**: `coachQuota.ts` provides date utility functions (`formatDateInTimeZone`, `getNaturalMonthWindow`, `getBillingAnchoredMonthWindow`) used for billing-period calculations. The actual quota limits are enforced in `lib/entitlements.ts`.

### `lib/i18n/` (Global Presence)

- **URL-First**: We favor URL parameters over cookies or headers for locale state to ensure search engines can crawl all 4,800+ localized puzzle pages independently.
- **Message Consistency**: `scripts/validateMessages.ts` ensures that keys across `zh`, `en`, `ja`, and `ko` never drift during build time.

### `lib/board/` (Go Board Logic)

- **Core Engine**: Stone placement, rule enforcement (liberties, captures, ko), and board display across 6 source files.
- **SGF Parsing**: Full SGF (Smart Game Format) import/export for game records and puzzle definitions.

### `lib/puzzle/` (Puzzle Engine)

- **SRS Scheduling**: Spaced repetition logic drives the daily review queue, with 8 source files covering collections, daily selection, review flows, and reveal tokens.
- **Entitlement**: Tracks puzzle access and streak state tied to the user's subscription tier.

### `lib/stripe/` (Payments)

- **Server SDK Wrapper**: A single `server.ts` file that wraps the Stripe Node SDK for server-side checkout, subscription management, and webhook verification.

### `lib/posthog/` (Analytics)

- **Server-Side Tracking**: PostHog event tracking from the server, with typed event definitions to ensure analytics consistency.
- **PII Safety**: Events are filtered through `beforeSend` hooks to strip sensitive user data before leaving the server.

## 3. Data Flow: The Attempt Lifecycle

1.  **Event**: User solves a puzzle on the board (`GoBoard.tsx`).
2.  **Local Write**: `saveAttempt` writes to `localStorage` for instant feedback.
3.  **Enqueue**: If logged in, the attempt is pushed to the IndexedDB queue.
4.  **Sync**: `syncStorage` attempts to batch-insert into the Supabase `attempts` table.
5.  **Entitlement Update**: Successful attempts trigger a re-calculation of the user's streak and SRS schedule.

## 4. Legal & Compliance Domain

Legal requirements are treated as **Content Assets** rather than hardcoded logic, allowing for rapid jurisdictional adjustments.

- **Source of Truth**: `app/[locale]/legal/_content.ts` centralizes all multilingual legal texts.
- **Dynamic Disclosure**: The system is architected to render components based on the user's active locale and unified pillar structure.
- **Regional Integration**: Regional requirements (like Japan's Tokushoho or Korea's PIPA) are integrated as unified content blocks within the three pillars.

- **Data Residency Strategy**: Documentation explicitly maps data flow to Singapore (Supabase) and the USA (Vercel) to satisfy cross-border disclosure laws (PIPA/GDPR).

## 5. Security & Infrastructure

- **RLS (Row Level Security)**: Every Postgres table has a mandatory `auth.uid() = user_id` policy. Even if an API is exposed, the database layer ensures no data leakage.
- **PII Masking**: Sentry and PostHog are configured with `beforeSend` filters to redact user messages from AI coach dialogues before they leave the client.
- **NFKC Normalization**: User-supplied text is normalized to NFKC form before processing to prevent homoglyph and Unicode normalization attacks.
- **Service Isolation**: The `proxy.ts` middleware ensures that only authenticated and authorized requests reach the heavy-duty API routes (Stripe/Coach).
- **Rate Limiting**: `lib/rateLimit.ts` provides two implementations — `MemoryRateLimiter` (dev/single-instance, 50k entry cap with LRU eviction) and `UpstashRateLimiter` (production, Redis-backed). The factory auto-selects based on `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` env vars.

---

**See also**:

- [API Reference](API_REFERENCE.md) — complete route catalog with request/response schemas.
- [Database Schema](DATABASE_SCHEMA.md) — Supabase table definitions, indexes, and RLS policies.
