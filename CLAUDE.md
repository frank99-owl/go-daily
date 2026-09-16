# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**go-daily** is a daily Go (围棋) tsumego puzzle platform with streaming DeepSeek AI coaching, 4-language i18n (zh/en/ja/ko), and Stripe subscriptions.

**Stack**: Next.js 16 (App Router), React 19, Tailwind CSS v4, Supabase (Auth + Postgres + RLS), Stripe, DeepSeek AI, Vitest + Playwright, Sentry, Upstash Redis (rate limiting in prod), Resend (email).

**Runtime**: Node.js >= 22.5.0

## Essential Commands

```bash
npm run dev              # Start dev server (localhost:3000)
npm run build            # Production build (runs prebuild + validation first)
npm run lint             # ESLint
npm run format           # Prettier (write)
npm run format:check     # Prettier (check — CI runs this)
npm run test             # Vitest single run (unit + integration)
npm run test:watch       # Vitest watch mode
npm run test:coverage    # Coverage report (target: 70%+)
npm run test:e2e         # Playwright, against a production build (run `npm run build` first)
npm run test:e2e:ui      # Playwright watch UI
npm run validate:puzzles # Validate puzzle JSON data
npm run validate:messages # Validate i18n key sync across all 4 locales
npm run validate:context # Validate CLAUDE.md / AGENTS.md against the codebase
npm run prebuild         # Validates puzzles + messages (runs before build)
npm run eval:coach       # Coach behavioral eval — dry run (add -- --live for real calls)
```

Run a single test file: `npx vitest run tests/api/coach.test.ts`

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

Cross-cutting modules in `lib/*.ts`: `admin.ts`, `entitlements.ts`, `entitlementsServer.ts`, `env.ts`, `rateLimit.ts`, `apiHeaders.ts`, `email.ts`, `errorReporting.ts`, `requestSecurity.ts`, `promptGuard.ts`, `promptGuardCodes.ts`, `clientIp.ts`, `jsonLd.ts`.

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

Vitest tests live **only** under `tests/`, mirroring the path of what they test: `tests/lib/`, `tests/components/`, `tests/api/`, `tests/app/`, `tests/scripts/`, `tests/evals/`. Never co-locate a test beside its source — until 2026-09 twenty did, and nine modules had one test file in each place with different contents. `tests/repo/testLayout.test.ts` fails CI on a `*.test.ts(x)` outside `tests/` or a `*.spec.ts` outside `e2e/`. When one module needs two files because their `vi.mock` setups conflict (mocks hoist to file scope), name them by what they cover — `syncStorage.test.ts` and `syncStorage.backoff.test.ts`.

Setup file `tests/setup.ts` provides DOM mocks (scrollTo, ResizeObserver, canvas, localStorage, sessionStorage).

End-to-end specs live in `e2e/` and run under Playwright, not Vitest (`vitest.config.ts` excludes the directory). They drive a real browser against a production build and cover the signed-out visitor: locale routing, response status codes, security headers, and canvas interaction. `e2e/README.md` explains why they need placeholder — not real — Supabase env, and what the monetization chain would need before it can be covered there.

All logic changes require unit tests. UI changes should have component tests for critical paths. **Changes to the coach system prompt or a persona brief additionally require an eval case** — see `.claude/commands/prompt-change.md`.

**Routes with a module-level rate limiter need a distinct IP per test request.** `getClientIP` falls back to the string `"unknown"`, so a test file that sends no `x-forwarded-for` pools every request into one bucket and starts tripping the limiter partway through the file. See the `nextTestIp()` helper in `tests/api/coach.test.ts`.

## The harness

Three pieces exist so the rules in this file are enforced by something other
than an agent's memory:

- **`npm run validate:context`** (`scripts/validateContext.ts`) fails CI when
  this file or `AGENTS.md` describes a command, domain, path, or invariant that
  no longer matches the codebase. Adding a new invariant to the pitfalls below
  means adding it to `CRITICAL_INVARIANTS` there too.
- **`evals/`** grades what the coach model actually _does_ against the rules
  `buildSystemPrompt` states. `tests/lib/coach/coachPrompt.test.ts` only proves the
  prompt contains them. See `evals/README.md`.
- **`.claude/commands/`** holds the repeatable loops: `/verify` (the CI gate,
  locally, in order), `/prompt-change` (the required loop for editing the coach
  prompt), `/sync-context` (re-syncing this file and `docs/` after a structural
  change). These are committed — they are repo assets, not local settings.

## CI Pipeline

`.github/workflows/ci.yml` runs two jobs.

**`check`**: npm audit (blocking on `--omit=dev`, full scan reporting-only) → format:check → lint → validate:puzzles → validate:messages → validate:context → tsc --noEmit → tsc scripts → test:coverage → build.

CI runs `test:coverage` rather than `test` because the thresholds in
`vitest.config.ts` are a ratchet and a bare `test` run does not evaluate them.
The floors sit just under the measured numbers; raise them as coverage rises
and never lower them to make a red build pass.

`eval:coach` is deliberately **not** in CI: it needs a real API key, costs money
per run, and is non-deterministic. It gates a prompt change, not a merge.

**`e2e`**: npm ci → install chromium → build → `npm run test:e2e`, uploading the Playwright report on failure.

The audit gate is split on purpose: a high-severity advisory in a runtime dependency stops the pipeline, while a dev-only one stays visible without blocking a merge. An unsplit gate held every PR red for three weeks in August 2026 — including the Dependabot PRs carrying the fixes.

## Common Pitfalls

- **i18n key drift**: Always run `npm run validate:messages` before committing. Keys must match across all 4 locale files in `content/messages/`.
- **Coach eligibility**: Not all puzzles support coaching. Check `content/data/coachBasicEligibleIds.json`, `content/data/coachReadyIds.json`, `content/data/variationGroups.json`, and `lib/coach/coachEligibility.ts`.
- **Coach personas are fictional characters**: the five mentors in `lib/coach/personas.ts` are original characters, never real players. No real names (any script), no national flags, no identifying biography, no "you are <person>" instructions, and no persona id named after a person — the id travels in API payloads and analytics. This is a publicity/personality-rights boundary, not style; `tests/lib/coach/personas.test.ts` enforces it and `docs/*/LEGAL_COMPLIANCE.md` section 4 explains it. References to real players elsewhere must stay factual and carry no implied endorsement.
- **Guest coach counters**: `guest_coach_usage` is written only via `service_role` in `lib/coach/guestCoachUsage.ts`. Clients never query it directly.
- **Coach token budget covers reasoning**: `COACH_MAX_TOKENS` (default 2000) is the whole generation budget, and a reasoning model spends hidden reasoning out of it — it is not a reply-length cap, and must never become a hardcoded literal again. It was `400` until 2026-09, and `deepseek-v4-flash` burned all of it on reasoning: `finish_reason: length`, zero visible content, an empty reply on every analysis question. `COACH_THINKING` left unset sends `disabled` to api.deepseek.com and nothing to other hosts (`resolveThinking` in `lib/coach/coachProvider.ts`), so the default is right whichever DeepSeek model name is configured. Every live `eval:coach` run grades `generation-budget` automatically, so a truncation shows up there first.
- **Coach quota refunds**: `createCoachSseStream` refunds a call only when _nothing_ was streamed. A client disconnect surfaces as an error from the upstream iteration, so refunding after delivery would let a caller read the reply and drop the connection to get the call back.
- **Stripe webhook idempotency**: Events are logged in `stripe_events` before processing. Never bypass this.
- **Three-tier storage**: Anonymous users use LocalStorage only. Logged-in users double-write to LocalStorage + IndexedDB queue, then sync to Supabase.
- **Environment variables**: See `.env.example` for the full list. Server-only secrets must NOT use `NEXT_PUBLIC_` prefix.
- **Manual Pro grants**: Email-based grants in `manual_grants` merged in `resolveViewerPlan()` (`lib/entitlementsServer.ts`). Admin endpoints go through `verifyAdmin()` in `lib/admin.ts`, which grants access on _either_ a `ADMIN_USER_IDS` match or an `ADMIN_EMAILS` match — not on the UUID allowlist alone. `/api/admin/verify` additionally takes `ADMIN_PIN`. Keep all server-only.
- **`notFound()` needs an unbuffered segment**: the HTTP status is committed as soon as anything flushes, so a `loading.tsx` above a segment that calls `notFound()` turns the response into a soft 200. There is deliberately no `app/[locale]/loading.tsx`; segments that want one declare it themselves. A page that calls `notFound()` also has its own metadata discarded — the 404 title comes from `app/[locale]/not-found.tsx`.
- **Page titles**: `app/[locale]/layout.tsx` sets `title.template` `"%s — go-daily"`. Metadata strings must _not_ carry the suffix themselves or it renders twice. The home page is the exception: a template does not apply to the page in the same segment as the layout defining it, so `metadata.home.title` is complete on its own.
- **Production rate limiting**: Missing `UPSTASH_REDIS_*` makes `createRateLimiter()` return a stub that throws on first `isLimited()` call. Configure Upstash for real traffic.
- **`next/og` (Satori)**: Avoid `z-index` in OG/Twitter JSX — layer gradients on root wrapper `background` instead. Root OG routes use `runtime = "nodejs"` (not Edge) and are statically prerendered.

## Documentation

Detailed docs are in `docs/{en,zh,ja,ko}/` — 8 pillars covering architecture, API reference, database schema, product specs, operations, project status, legal compliance, and concept. Use `docs/README.md` as the hub. Also see `AGENTS.md` for the full AI agent orientation guide.
