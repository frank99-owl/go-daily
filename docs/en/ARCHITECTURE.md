# Technical Architecture & Core Modules

This document describes the internal structure of go-daily, reflecting the six-domain refactoring of the `lib/` directory and the centralized middleware logic.

## 1. The Global Request Lifecycle (`proxy.ts`)

Everything user-facing passes through the `proxy.ts` middleware. It handles three critical tasks in a single pass:

1.  **Auth Refresh**: Using `@supabase/ssr`, it refreshes the session cookie on every navigation to keep Server Components hydrated with fresh user state.
2.  **Locale Negotiation**: It handles the 308 (Permanent) redirect matrix to ensure every path is locale-prefixed (`/{zh|en|ja|ko}/...`).
3.  **Route Guarding**: It intercepts protected paths (e.g., `/account`, `/pricing/checkout`) and redirects unauthenticated users to `/login?next=...`.

## 2. Core Domain Modules (`lib/`)

### `lib/auth/` & `lib/supabase/`

- **The Bridge**: We use a dual-client strategy. `client.ts` for browser-side hooks and `server.ts` for App Router async server components.
- **Service Layer**: `service.ts` uses the `service_role` key to bypass RLS for background tasks like Stripe webhooks or cron emails.

### `lib/storage/` (Persistence Engine)

The system operates on a tiered synchronization model:

1.  **Anonymous (LocalStorage)**: Primary source for non-logged-in users.
2.  **Queue (IndexedDB)**: Pending attempts are stored in a durable IndexedDB queue. This ensures that data is not lost if a tab is closed before a sync to Supabase completes.
3.  **Cloud (Supabase)**: The ultimate source of truth. The `syncStorage.ts` orchestrates the "Flush" logic triggered by `online` events or page loads.

### `lib/coach/` (AI Intelligence)

- **Prompting**: Centralized in `coachPrompt.ts` to ensure consistency in Socratic tutoring across different puzzles.
- **Budgeting**: `coachBudget.ts` enforces a hard monthly token limit at the application layer (upstream of DeepSeek billing) to prevent runaway costs.

### `lib/i18n/` (Global Presence)

- **URL-First**: We favor URL parameters over cookies or headers for locale state to ensure search engines can crawl all 4,800+ localized puzzle pages independently.
- **Message Consistency**: `validateMessages.ts` ensures that keys across `zh`, `en`, `ja`, and `ko` never drift during build time.

## 3. Data Flow: The Attempt Lifecycle

1.  **Event**: User solves a puzzle on the board (`GoBoard.tsx`).
2.  **Local Write**: `saveAttempt` writes to `localStorage` for instant feedback.
3.  **Enqueue**: If logged in, the attempt is pushed to the IndexedDB queue.
4.  **Sync**: `syncStorage` attempts to batch-insert into the Supabase `attempts` table.
5.  **Entitlement Update**: Successful attempts trigger a re-calculation of the user's streak and SRS schedule.

## 4. Security & Compliance

- **RLS (Row Level Security)**: Every Postgres table has a mandatory `auth.uid() = user_id` policy. Even if an API is exposed, the database layer ensures no data leakage.
- **PII Masking**: Sentry and PostHog are configured with `beforeSend` filters to redact user messages from AI coach dialogues before they leave the client.
