# Repository Guide for AI Coding Agents

## Quick Orientation

**What**: go-daily — a daily Go (围棋) puzzle platform with DeepSeek-backed streaming AI coaching (`coachPrompt.ts`, personas, quotas), 4-language i18n (zh/en/ja/ko), and Stripe subscriptions.

**Stack**: Next.js 16 (App Router), React 19, Tailwind CSS v4, Supabase (Auth + Postgres), Stripe, DeepSeek AI, Vitest.

**Key entry points**:

- `proxy.ts` — global middleware (auth refresh, locale negotiation, route guarding)
- `app/[locale]/` — all user-facing pages (locale-prefixed)
- `app/api/` — API route handlers
- `lib/` — core business logic (nine domains: auth, board, coach, i18n, posthog, puzzle, storage, stripe, supabase)
- `content/` — puzzle data and i18n messages
- `types/schemas.ts` — Zod schemas (single source of truth for shared types)

## Architecture: Nine Domains

All core logic lives in `lib/` organized by domain:

| Domain   | Path            | Responsibility                                                                                   |
| -------- | --------------- | ------------------------------------------------------------------------------------------------ |
| Auth     | `lib/auth/`     | Session management, device registry, guest identity                                              |
| Board    | `lib/board/`    | Go rules, move validation, SGF parsing, board/judge modules (`board`, `goRules`, `judge`, `sgf`) |
| Coach    | `lib/coach/`    | AI prompting, quota management, persona system, eligibility                                      |
| i18n     | `lib/i18n/`     | Locale negotiation, path helpers, message validation                                             |
| PostHog  | `lib/posthog/`  | Analytics events, server-side capture, feature flags                                             |
| Puzzle   | `lib/puzzle/`   | Puzzle loading, SRS scheduling, collections, reveal tokens                                       |
| Storage  | `lib/storage/`  | Three-tier persistence (LocalStorage → IndexedDB → Supabase)                                     |
| Stripe   | `lib/stripe/`   | Payment processing, subscription management, webhooks                                            |
| Supabase | `lib/supabase/` | Auth SSR helpers, service client, RLS bypass for admin ops                                       |

**Root `lib/*.ts` (cross-cutting)**: plan/quotas and server resolution live in `entitlements.ts` / `entitlementsServer.ts`; shared infra includes `env.ts`, `rateLimit.ts`, `apiHeaders.ts`, `email.ts`, `errorReporting.ts`, `requestSecurity.ts`, `promptGuard.ts`, etc.

## Critical Rules

1. **Never import server-only modules from client code.** `lib/stripe/server.ts`, `lib/coach/coachState.ts`, and `lib/supabase/service.ts` throw at runtime if imported in browser context.

2. **Zod schemas are the source of truth.** Shared data structures derive from `types/schemas.ts`. Use `z.infer<typeof Schema>` in `types/index.ts`.

3. **Locale-aware routing is mandatory.** Every user-facing page lives under `app/[locale]/`. Use `localePath()` from `lib/i18n/localePath.ts` to build URLs.

4. **RLS is on for every table.** Client-side Supabase queries are scoped to `auth.uid() = user_id`. Use `lib/supabase/service.ts` (service_role) only for background tasks.

5. **Attempt dedup key**: `puzzleId-solvedAtMs` is the global anchor for data sync across devices. Never modify this contract.

## Testing

```bash
npm run test          # Run all (80 files, 643 cases)
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report (target: 70%+)
```

Tests mirror source under `tests/`: `tests/lib/`, `tests/components/`, `tests/api/`, `tests/app/`, `tests/scripts/`.

All logic changes require unit tests. UI changes should have component tests for critical paths.

## Build & CI

```bash
npm run prebuild      # Validates puzzles + i18n message keys
npm run build         # Production build
npm run lint          # ESLint
npm run format:check  # Prettier check
```

CI pipeline (`.github/workflows/ci.yml`): format:check → lint → validate:puzzles → validate:messages → tsc --noEmit → test → build.

## Common Pitfalls

- **i18n key drift**: Always run `npm run validate:messages` before committing. Keys must match across all 4 locale files in `content/messages/`.
- **Coach eligibility**: Not all puzzles support coaching. Check `content/data/coachEligibleIds.json` and `lib/coach/coachEligibility.ts`.
- **Stripe webhook idempotency**: Events are logged in `stripe_events` before processing. Never bypass this.
- **Three-tier storage**: Anonymous users use LocalStorage only. Logged-in users double-write to LocalStorage + IndexedDB queue, then sync to Supabase.
- **Environment variables**: See `.env.example` for the full list. Never commit `.env.local`. Server-only secrets must NOT use `NEXT_PUBLIC_` prefix.
- **Manual Pro grants**: Email-based grants live in `manual_grants` and are merged in `resolveViewerPlan()` (`lib/entitlementsServer.ts`). Admin APIs are under `/api/admin/*`; keep `ADMIN_PIN` server-only and do not add permissive RLS policies to `manual_grants`.
- **Guest coach counters**: `guest_coach_usage` is written only via `service_role` in `guestCoachUsage.ts`; clients never query it directly.

## Documentation

| Document                            | Description                                                 |
| ----------------------------------- | ----------------------------------------------------------- |
| `docs/{locale}/CONCEPT.md`          | Project mission, strategic phases, engineering philosophy   |
| `docs/{locale}/ARCHITECTURE.md`     | Request lifecycle, nine-domain modules, data flow           |
| `docs/{locale}/PRODUCT_SPECS.md`    | Entitlements, SRS algorithm, subscription logic, compliance |
| `docs/{locale}/OPERATIONS_QA.md`    | Deployment, preflight checks, test strategy                 |
| `docs/{locale}/PROJECT_STATUS.md`   | Current phase, recent progress, next steps                  |
| `docs/{locale}/API_REFERENCE.md`    | All API routes with request/response schemas                |
| `docs/{locale}/DATABASE_SCHEMA.md`  | Supabase table definitions and RLS policies                 |
| `docs/{locale}/LEGAL_COMPLIANCE.md` | Multi-jurisdiction legal strategy                           |

**Other Markdown**: root `README.md` / localized `README.*`, `CONTRIBUTING.md` (English; GitHub default) + `CONTRIBUTING.zh.md`, `CHANGELOG.md`, `SECURITY.md`, `LICENSE`. **`reports/**`**: generator output from `audit:puzzles`, `queue:content`, `report:\*`— not committed; not hand-maintained product specs (see`docs/README.md`).
