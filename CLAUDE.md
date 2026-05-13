# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**go-daily** is a daily Go (围棋) tsumego puzzle platform with streaming DeepSeek AI coaching, 4-language i18n (zh/en/ja/ko), and Stripe subscriptions.

**Stack**: Next.js 16 (App Router), React 19, Tailwind CSS v4, Supabase (Auth + Postgres + RLS), Stripe, DeepSeek AI, Vitest, Sentry, Upstash Redis (rate limiting in prod), Resend (email).

**Runtime**: Node.js >= 22.5.0

## Essential Commands

```bash
npm run dev              # Start dev server (localhost:3000)
npm run build            # Production build (runs prebuild + validation first)
npm run lint             # ESLint
npm run format           # Prettier (write)
npm run format:check     # Prettier (check — CI runs this)
npm run test             # Vitest single run
npm run test:watch       # Vitest watch mode
npm run test:coverage    # Coverage report (target: 70%+)
npm run validate:puzzles # Validate puzzle JSON data
npm run validate:messages # Validate i18n key sync across all 4 locales
npm run prebuild         # Validates puzzles + messages (runs before build)
```

Run a single test file: `npx vitest run tests/lib/coach.test.ts`

## Architecture

Nine domains under `lib/`, each self-contained:

| Domain   | Path            | Responsibility                                  |
| -------- | --------------- | ----------------------------------------------- |
| Auth     | `lib/auth/`     | Session, device registry, guest identity        |
| Board    | `lib/board/`    | Go rules, move validation, SGF parsing          |
| Coach    | `lib/coach/`    | AI prompting, quotas, persona system            |
| i18n     | `lib/i18n/`     | Locale negotiation, path helpers                |
| PostHog  | `lib/posthog/`  | Analytics, feature flags                        |
| Puzzle   | `lib/puzzle/`   | Puzzle loading, SRS scheduling, collections     |
| Storage  | `lib/storage/`  | Three-tier: LocalStorage → IndexedDB → Supabase |
| Stripe   | `lib/stripe/`   | Payments, subscriptions, webhooks               |
| Supabase | `lib/supabase/` | Auth SSR helpers, service client                |

Cross-cutting modules in `lib/*.ts`: `entitlements.ts`, `entitlementsServer.ts`, `env.ts`, `rateLimit.ts`, `apiHeaders.ts`, `email.ts`, `errorReporting.ts`, `requestSecurity.ts`, `promptGuard.ts`, `clientIp.ts`.

**Key entry points**:

- `proxy.ts` — Next.js middleware (auth refresh, locale negotiation, route guarding)
- `app/[locale]/` — all user-facing pages (locale-prefixed)
- `app/api/` — API route handlers
- `types/schemas.ts` — Zod schemas (single source of truth for shared types)

## Critical Rules

1. **Never import server-only modules from client code.** `lib/stripe/server.ts`, `lib/coach/coachState.ts`, `lib/supabase/service.ts` throw at runtime if imported in browser context.

2. **Zod schemas are the source of truth.** Shared data structures derive from `types/schemas.ts` using `z.infer<typeof Schema>` in `types/index.ts`.

3. **Locale-aware routing is mandatory.** Every user-facing page lives under `app/[locale]/`. Use `localePath()` from `lib/i18n/localePath.ts` to build URLs.

4. **RLS is on for every table.** Client-side Supabase queries are scoped to `auth.uid() = user_id`. Use `lib/supabase/service.ts` (service_role) only for background tasks.

5. **Attempt dedup key**: `puzzleId-solvedAtMs` is the global anchor for data sync across devices. Never modify this contract.

6. **Domain-driven logic**: All core logic must reside in `lib/` within its respective domain. Avoid logic leakage into UI components.

## Code Style

- **Prettier**: semicolons on, double quotes, trailing commas everywhere, 100-char print width
- **ESLint**: flat config (`eslint.config.mjs`), Next.js core-web-vitals + TypeScript + import ordering
- **TypeScript**: strict mode, `tsc --noEmit` in CI
- **Imports**: alphabetical ordering with newlines between groups (enforced by `eslint-plugin-import`)
- **Commit convention**: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:` prefixes

## Testing

Tests mirror source structure under `tests/`: `tests/lib/`, `tests/components/`, `tests/api/`, `tests/app/`, `tests/scripts/`. Co-located tests also exist in `lib/` itself.

Setup file `tests/setup.ts` provides DOM mocks (scrollTo, ResizeObserver, canvas, localStorage, sessionStorage).

All logic changes require unit tests. UI changes should have component tests for critical paths.

## CI Pipeline

`.github/workflows/ci.yml`: format:check → lint → validate:puzzles → validate:messages → tsc --noEmit → test → build.

## Common Pitfalls

- **i18n key drift**: Always run `npm run validate:messages` before committing. Keys must match across all 4 locale files in `content/messages/`.
- **Coach eligibility**: Not all puzzles support coaching. Check `content/data/coachEligibleIds.json` and `lib/coach/coachEligibility.ts`.
- **Stripe webhook idempotency**: Events are logged in `stripe_events` before processing. Never bypass this.
- **Three-tier storage**: Anonymous users use LocalStorage only. Logged-in users double-write to LocalStorage + IndexedDB queue, then sync to Supabase.
- **Environment variables**: See `.env.example` for the full list. Server-only secrets must NOT use `NEXT_PUBLIC_` prefix.
- **Manual Pro grants**: Email-based grants in `manual_grants` merged in `resolveViewerPlan()` (`lib/entitlementsServer.ts`). Admin endpoints: `/api/admin/grants` (session UUID allowlist via `ADMIN_USER_IDS`), `/api/admin/verify` (`ADMIN_EMAILS` + `ADMIN_PIN`). Keep all server-only.
- **Production rate limiting**: Missing `UPSTASH_REDIS_*` makes `createRateLimiter()` return a stub that throws on first `isLimited()` call. Configure Upstash for real traffic.
- **`next/og` (Satori)**: Avoid `z-index` in OG/Twitter JSX — layer gradients on root wrapper `background` instead. Root OG routes use `runtime = "nodejs"` (not Edge) and are statically prerendered.

## Documentation

Detailed docs are in `docs/{en,zh,ja,ko}/` — 8 pillars covering architecture, API reference, database schema, product specs, operations, project status, legal compliance, and concept. Use `docs/README.md` as the hub. Also see `AGENTS.md` for the full AI agent orientation guide.
