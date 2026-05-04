# Changelog

All notable changes to go-daily are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/). Versioning adheres to [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Added

- **Upstash Redis rate limiting**: Production requires `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`; `createRateLimiter()` throws on first `isLimited()` call if either is missing when `NODE_ENV === "production"` (deferred from module load to allow `next build` without env vars). Non-production uses an in-memory limiter when Upstash is not configured.
- **PWA icons**: Added 192×192 and 512×512 PNG icons for proper Android/Chrome install prompts. Run `npm run generate:icons` to regenerate from `public/icon.svg`.
- **Localized OG/Twitter images**: Social share images now render in the viewer's locale (zh/en/ja/ko) instead of always English.
- **Centralized env validation**: `lib/env.ts` with Zod-based lazy singletons for Coach, Stripe, Supabase, and Reveal env vars.
- **Error page i18n**: `app/error.tsx`, `app/global-error.tsx`, and `app/not-found.tsx` now support all four locales.
- **Route loading/error boundaries**: `loading.tsx` + `error.tsx` for today, result, review, and puzzles routes, with shared `PageSkeleton` and `PageError` components.
- **Heatmap accessibility**: Added `role="grid"`, `aria-label`, and `role="gridcell"` to the activity heatmap.
- **UserMenu keyboard navigation**: ArrowUp/Down, Home/End key support with auto-focus on open.

### Documentation

- **Public documentation & repo presentation**: Rewrote all four root `README.*` files with CI badge, product/engineering positioning, and role-based links into `docs/`. `docs/README.md` is now a documentation hub (repository map, audience paths, Mermaid pillar diagram, clarified root companions). Added `LICENSE` (all rights reserved). `CONTRIBUTING.md` is the GitHub-default English guide; Chinese moved to `CONTRIBUTING.zh.md` (removed `CONTRIBUTING.en.md`). Added localized **Overview** sections to every locale's `CONCEPT.md` and `ARCHITECTURE.md` for executive readability.
- **Enterprise doc hygiene**: Removed `docs/en/UPGRADE_v1.1.md` (English-only orphan vs. four-locale pillars); v1.1 closure notes and **external communications** phrasing live under [1.1.0] in `CHANGELOG.md`. Stopped tracking `reports/duplicates` and `reports/quality` generator output (aligned with other `reports/` outputs); `docs/README.md` lists local output paths instead of dead links.
- **Docs aligned with code (2026-05)**: Vitest inventory (80 files / 643 tests), CI Node 22, README `engines` (Node 22.5+), `proxy.ts` scope vs `/api` bypass and route-level auth, entitlements modules split out from `lib/puzzle/`, Upstash required in production for `createRateLimiter`, `MemoryRateLimiter` eviction semantics, preflight checklist described as variable (see `productionPreflight.ts`), multilingual `ARCHITECTURE` / `OPERATIONS_QA` / `API_REFERENCE` / `PROJECT_STATUS` updates.
- **Canonical docs sync**: API reference (`/api/health`, `/api/admin/*`, guest coach persistence), database schema (`manual_grants`, `guest_coach_usage`), Vitest inventory (80 files / 643 tests), CONTRIBUTING guidance (`prebuild` vs lint), `PRODUCT_SPECS` SRS path (`lib/puzzle/srs.ts`), manual-grant behavior (`resolveViewerPlan`), and ja/ko product spec §4 (puzzle collections).
- **Repository-wide Markdown sweep**: `POST /api/coach` documented as SSE (`text/event-stream`); pillar `DATABASE_SCHEMA` covers atomic usage RPCs (`0007_atomic_coach_usage_increment.sql`); multilingual `docs/*/CONCEPT.md` Pro bundle text matches entitlement quotas (not “unlimited” coach); `docs/README.md` notes `reports/*.md` is generator output only.
- **Operations QA**: Example test paths now point at `tests/...`; ja/ko gained the §5 test-directory table and `generate:icons` script line aligned with English; `productionPreflight` validates `manual_grants` and `guest_coach_usage` columns.

### Changed

- **`MemoryRateLimiter` size cap**: In-memory rate limiter now enforces a 50,000-entry cap with stale-entry eviction, preventing unbounded memory growth on long-lived serverless instances.
- **Guest IP counter size cap**: `guestCoachUsage.ts` IP counters capped at 10,000 entries with day-rollover cleanup and oldest-key eviction (Map insertion order).
- **Shared body-parsing utility**: All mutation API routes (`/api/coach`, `/api/puzzle/attempt`, `/api/puzzle/reveal`) now use `parseMutationBody()` from `lib/apiHeaders.ts` instead of duplicating Content-Type/Content-Length/JSON-parse logic.
- **Coach service client reuse**: Authenticated coach requests create a single `createServiceClient()` instance and reuse it across `getCoachState()` and `incrementCoachUsage()`.
- **Coach history total character budget**: `MAX_HISTORY_CHARS = 6,000` now limits the total character count of the history array (newest-first truncation), in addition to the existing per-message 2,000-char cap.
- **Optimized API key masking**: `maskKey()` now shows only the first 4 characters and total length (e.g., `sk-a...len:48`) instead of first-4 + last-4, to reduce key exposure in exported logs.
- Documentation structure reorganized into formal project-level architecture.
- Improved multilingual content: natural Japanese/Korean translations replacing mechanical translations.
- Mentoring page content optimized across all four locales.
- **Theme color centralized**: Replaced 53 hardcoded `#00f2ff` occurrences with `var(--color-accent)` CSS variable across 16+ component files.
- **Code splitting**: Lazy-loaded `CoachDialogue`, `ShareCard`, and `BoardShowcase` via `next/dynamic`.
- **SEO hreflang**: Added `buildHreflangAlternates()` helper and `alternates.languages` to all 7 page routes for proper cross-locale SEO.
- **OG locale mapping**: Dynamic Open Graph locale in root layout (`zh→zh_CN`, `en→en_US`, `ja→ja_JP`, `ko→ko_KR`).
- **Font loading**: Added `<link rel="preconnect">` for Google Fonts domains.
- **Static asset caching**: `/avatars/*` now served with `Cache-Control: immutable` for versioned assets.
- **robots.txt**: Removed `/about/` from disallow list; only `/api/` remains blocked.

### Fixed

- **Coach persona selector mobile overflow**: Mentor panel portal now detects viewport overflow and repositions within a 16px margin on narrow screens.
- **promptGuard Unicode test expectations**: Corrected NFKC normalization tests — Cyrillic U+0456 is not mapped to Latin "i" by NFKC; superscript "²" (U+00B2) normalizes to "2".
- **ja.json translation contamination**: Removed Korean and Chinese characters that had leaked into three Japanese UI strings.

### Security

- **promptGuard NFKC normalization**: `guardUserMessage()` and `sanitizeInput()` now apply Unicode NFKC normalization as the first step, collapsing fullwidth and other homoglyph characters to their ASCII equivalents before pattern matching.
- **Stripe webhook payload size limit**: `/api/stripe/webhook` rejects requests with `Content-Length > 1 MB` (HTTP 413) before reading the body, preventing large-payload memory exhaustion.

---

## [1.1.0] - 2026-04-30

### Added

- **AI Coach cost observability**: PostHog server events (`coach_request_completed`, `coach_request_failed`) tracking token usage, latency, and error codes per request.
- **Batch script cost guardrails**: `scripts/geminiSolutionNotes.js` now requires `--confirm-costly-run` flag for large batch operations (`--limit > 10`, `--force`, `--batch-size > 10`, `--concurrency > 4`).
- **Quality report script**: `npm run report:quality` samples 195 puzzles (high-difficulty, random, duplicate-adjacent) and generates a Markdown/JSON quality audit.
- **Duplicate report script**: `npm run report:duplicates` identifies puzzles with identical board positions and classifies them as exact or partial duplicates.
- **Client error reporting**: Browser `error`/`unhandledrejection` handlers report structured errors to `/api/report-error`.
- **Keyboard navigation**: Arrow keys, Enter/Space, R, and Esc shortcuts on the puzzle board.
- **Offline shell**: Service worker caches the app shell for offline access.

### Changed

- **Puzzle data layer refactored**: `getAllSummaries()` now reads from `puzzleIndex.json` (689 KB) instead of loading the full 11 MB `classicalPuzzles.json`. Full puzzle data is lazy-loaded via `Proxy` only when `getPuzzle()` is called.
- **Coach provider returns usage metadata**: `createReply()` now returns `CoachProviderResult` with `usage`, `model`, and `provider` fields instead of a plain string.
- Storage integrity and recovery mechanisms improved.
- Backup/restore functionality for local puzzle progress.

### Removed

- Unused legacy modules cleaned up.

### Notes (external communications)

When describing 1.1.x capabilities in marketing, support, or partner materials, use accurate phrasing:

- **Storage recovery**: Say _integrity check / corruption recovery_, not “anti-tamper” or “forgery-proof.”
- **Error reporting**: Say errors are sent to an internal endpoint and recorded in server logs, not that an administrator is automatically notified by a third-party dashboard.
- **Offline**: Say _basic offline shell_ (network-first HTML, cache-first assets), not that the full dynamic puzzle experience works offline.
- **Keyboard**: Say shortcuts on **today / result** puzzle surfaces, not site-wide hotkeys everywhere.

Implementation-level closure detail for v1.1 now lives in the pillar docs on `main` (`docs/*/ARCHITECTURE.md`, `API_REFERENCE.md`, `DATABASE_SCHEMA.md`, `OPERATIONS_QA.md`).

---

## [1.0.0] - 2026-04-01

### Added

- **Core puzzle engine**: 3,033 curated tsumego puzzles (19x19) with difficulty ratings, tags, and four-language prompts.
- **AI Coach**: DeepSeek-powered streaming coaching (`coachPrompt.ts`, curated explanations as ground truth) with 5 persona mentors (Ke Jie, Lee Sedol, Go Seigen, Iyama Yuta, Shin Jinseo).
- **Multilingual UI**: Full support for Chinese (zh), English (en), Japanese (ja), and Korean (ko).
- **URL-prefixed routing**: `/{locale}/...` pattern for SEO-friendly internationalization (sitemap scales with the puzzle corpus — currently on the order of **12,000+** locale-specific URLs from `sitemap.ts`).
- **Three-state storage**: Anonymous LocalStorage → IndexedDB Queue → Supabase Cloud sync.
- **Stripe integration**: Adaptive pricing (JPY/KRW), 7-day trial, monthly/yearly plans.
- **SM-2 spaced repetition**: Pro users get personalized review schedules.
- **Daily puzzle emails**: Vercel Cron + Resend integration with one-click unsubscribe.
- **Legal compliance**: Privacy policy, terms of service, and refund policy for 10 jurisdictions.
- **Deployment preflight**: 47-point production readiness checklist script.
