# Technical Architecture & Core Modules

This document describes the internal structure of go-daily, reflecting the nine-domain structure of the `lib/` directory and the centralized app-root proxy (`proxy.ts`).

## Overview

- **Edge & routing:** Page traffic passes through root `proxy.ts` for session refresh, auth redirects, and locale negotiation (`/{locale}/...`). API routes under `app/api/` skip the global proxy and enforce their own validation (cookies, Stripe signatures, same-origin / CSRF rules, and JSON body handling — including `parseMutationBody()` where applicable).
- **Modular core:** Business logic lives in `lib/<domain>/` (board rules, coach, puzzle, storage, Stripe, …) with shared contracts from `types/schemas.ts`.
- **This document:** Request lifecycle, domain map, and security-relevant boundaries.

## 1. The Global Request Lifecycle (`proxy.ts`)

Everything user-facing passes through root `proxy.ts` (the Next.js app-root proxy). It handles four critical tasks in a single pass:

1.  **Manifest Special-Case Handling**: Intercepts requests for the PWA manifest and serves the appropriate version.
2.  **Exempt Path Passthrough**: Lets certain paths (static assets, API webhooks, etc.) bypass all proxy logic.
3.  **Session Refresh & Auth Redirect**: Using `@supabase/ssr`, it refreshes the session cookie on every navigation to keep Server Components hydrated with fresh user state. Already-prefixed paths (`/en/account`, etc.) are guarded here — unauthenticated users hitting `/account` are redirected to `/login?next=...`, and authenticated users hitting `/login` are redirected to `/account`.
4.  **Locale Negotiation**: For unprefixed paths, it handles the 308 (Permanent) redirect matrix to ensure every path is locale-prefixed (`/{zh|en|ja|ko}/...`).

**Next.js 16 scope**: Global request handling lives in root `proxy.ts` (exported `proxy` + `config.matcher`; Node.js runtime). The matcher skips `/api/*` and `/auth/*`, so API routes and the Supabase auth callback implement their own checks (cookies, Stripe signatures, same-origin / body validation, etc.). Locale negotiation and cookie refresh apply to **page** navigations, not those prefixes.

## 2. Core Domain Modules (`lib/`)

### `lib/env.ts` (Environment Validation)

A centralized, Zod-based environment variable validator. Each domain (Coach, Stripe, Supabase, Reveal) has its own schema and a lazy-validated singleton accessor (`getCoachEnv()`, `getStripeEnv()`, etc.). Missing variables surface as clear startup-style errors at first use rather than silent 500s deep in a route handler. Browser `client.ts` and the session-refresh helper `lib/supabase/middleware.ts` keep their own inline checks since `lib/env.ts` is server-only.

### `lib/auth/` & `lib/supabase/`

- **The Bridge**: We use a dual-client strategy. `client.ts` for browser-side hooks and `server.ts` for App Router async server components.
- **Service Layer**: `service.ts` uses the `service_role` key to bypass RLS for background tasks like Stripe webhooks or cron emails.

### `lib/storage/` (Persistence Engine)

The system operates on a three-state synchronization model:

1.  **`anon` (LocalStorage only)**: Primary source for non-logged-in users. No network calls are made.
2.  **`logged-in-online` (LocalStorage + IndexedDB queue + Supabase)**: For authenticated users with an active connection. Writes go to LocalStorage for instant feedback, are enqueued in IndexedDB as a durable buffer, and are batch-flushed to Supabase immediately via `syncStorage.ts`.
3.  **`logged-in-offline` (LocalStorage + IndexedDB queue)**: For authenticated users who have lost connectivity. Writes still go to LocalStorage and IndexedDB, but the Supabase flush is deferred. A retry mechanism triggers the sync when the `online` event fires or on the next page load.

### `lib/coach/` (AI Intelligence)

- **Prompting**: Centralized in `coachPrompt.ts` so every puzzle shares the same coaching contract (solution notes and variation metadata treated as ground truth, persona tone, locale-specific style blocks).
- **Budgeting**: `coachQuota.ts` provides date utility functions (`formatDateInTimeZone`, `getNaturalMonthWindow`, `getBillingAnchoredMonthWindow`) used for billing-period calculations. The actual quota limits are enforced in `lib/entitlements.ts`.
- **Usage counters**: Logged-in and guest coach message counts persist in Postgres; increments go through RPCs (`increment_coach_usage`, `increment_guest_coach_usage`) for atomic upserts under concurrency.

### `lib/i18n/` (Global Presence)

- **URL-First**: We favor URL parameters over cookies or headers for locale state so search engines can crawl the full localized surface: **12,000+** URLs in `sitemap.xml` today (static pages, collection filters, puzzle details × four locales), growing with `content/data/puzzleIndex.json`.
- **Message Consistency**: `scripts/validateMessages.ts` ensures that keys across `zh`, `en`, `ja`, and `ko` never drift during build time.

### `lib/board/` (Go Board Logic)

- **Core Engine**: Stone placement, rule enforcement (liberties, captures, ko), and board rendering across four modules: `board.ts`, `goRules.ts`, `judge.ts`, and `sgf.ts`.
- **SGF Parsing**: Full SGF (Smart Game Format) import/export for game records and puzzle definitions.

### `lib/puzzle/` (Puzzle Engine)

- **SRS & loading**: Spaced repetition (`srs.ts`, `reviewSrs.ts`), daily selection, collections, reveal tokens, snapshots, and status helpers — eight puzzle modules plus a colocated `puzzleOfTheDay.test.ts` in `lib/puzzle/`.

### `lib/entitlements.ts` & `lib/entitlementsServer.ts` (Plans)

- **Tier matrix**: `entitlements.ts` defines guest / free / Pro coach limits, device seats, ads, and sync behavior for client-safe consumption.
- **Server merge**: `entitlementsServer.ts` resolves the effective plan (Stripe + `manual_grants` via `resolveViewerPlan`) for APIs and server components.

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
- **Route-level auth**: `proxy.ts` refreshes Supabase session cookies and guards locale-prefixed **pages** (e.g. `/account`, `/login`). `/api/*` is outside the proxy matcher; Stripe, coach, admin, and puzzle routes enforce sessions, tokens, or signatures themselves.
- **Rate limiting**: `lib/rateLimit.ts` — `UpstashRateLimiter` when both `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set; otherwise `MemoryRateLimiter` in non-production. In **`NODE_ENV === "production"`**, missing Upstash variables make `createRateLimiter()` return a **stub** whose `isLimited()` calls throw (first use when a route checks limits; build-time data collection can still run). `MemoryRateLimiter` caps tracked keys (50k) and drops the oldest key when over cap, plus periodic cleanup of idle keys.

---

**See also**:

- [API Reference](API_REFERENCE.md) — complete route catalog with request/response schemas.
- [Database Schema](DATABASE_SCHEMA.md) — Supabase table definitions, indexes, and RLS policies.
