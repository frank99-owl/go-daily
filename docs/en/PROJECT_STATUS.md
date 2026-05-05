# go-daily Project Status & Roadmap

**Generated At**: May 6, 2026
**Repository HEAD**: `8103dd7`
**Status**: v2.7 Codebase Optimization Edition

---

## 1. Phase 2 Completion Summary

All subscription-related logic (Stripe, Entitlements, Multi-device Sync) has been implemented and audited. The legal framework now supports 10+ global jurisdictions to pass Stripe verification.

## 2. Architectural Audit

- **Consistency**: All logic in `lib/` (SRS, Auth, Coach) is now 100% aligned with the documentation.
- **Paths**: Implemented a global **Footer** with multi-jurisdiction legal routes, resolving the 404 gap.
- **UI Logic**: Fixed layout overlap issues on `Today` and `Random` pages by optimizing the vertical breathing room (`pb-24`).

## 3. Recent Progress (v2.8)

- **Upstash Redis Rate Limiting**: Production uses Upstash Redis for cross-instance rate limiting. When `NODE_ENV === "production"`, missing `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` makes `createRateLimiter()` return a stub that throws on the first rate-limit check (dev omits both vars and uses `MemoryRateLimiter`).
- **PWA Icons**: 192×192 and 512×512 PNG icons added for Android/Chrome install prompts.
- **Localized OG Images**: Social share images now render in the viewer's locale (zh/en/ja/ko).
- **ja.json Translation Fix**: Removed Korean/Chinese character contamination from 3 Japanese UI strings.
- **Centralized Env Validation**: `lib/env.ts` with Zod-based lazy singletons replacing scattered `process.env` reads.
- **Error Page i18n**: All error boundaries (`error.tsx`, `global-error.tsx`, `not-found.tsx`) now support 4 locales.
- **Theme Centralization**: 53 hardcoded `#00f2ff` color references replaced with `var(--color-accent)` CSS variable.
- **Code Splitting**: `CoachDialogue`, `ShareCard`, `BoardShowcase` lazy-loaded via `next/dynamic`.
- **SEO Hreflang**: `buildHreflangAlternates()` helper with `alternates.languages` on all page routes.
- **Accessibility**: Heatmap ARIA semantics (`role="grid"`, `aria-label`), UserMenu keyboard navigation (Arrow keys, Home/End).
- **Route Boundaries**: `loading.tsx` + `error.tsx` for today, result, review, and puzzles routes.
- **Test Suite**: 82 test files, 658 test cases covering logic, UI, and API layers.
- **Guest coach persistence**: `guest_coach_usage` in Supabase stores anonymous coach message counts per device/day (`service_role` only); IP caps stay in-memory for abuse control.
- **Board module**: Core logic consolidated into four modules (`board.ts`, `goRules.ts`, `judge.ts`, `sgf.ts`); legacy `boardDisplay.ts` removed.
- **Documentation sync**: API reference covers `/api/health`, `/api/admin/*`, and `/api/auth/device`; includes **`POST /api/coach` as Server-Sent Events** and Postgres **RPC** usage increments; database docs include entitlement-aware `user_devices`, `manual_grants`, `guest_coach_usage`, and **`0007_atomic_coach_usage_increment.sql`** notes; multilingual **`CONCEPT.md`** Pro wording matches entitlement quotas (**not** “unlimited” coach — see **`PRODUCT_SPECS`**); README/docs index aligned with the nine-domain layout.

## 3b. Recent Improvements (v1.1 Hardening)

- **Memory-safe rate limiting**: `MemoryRateLimiter` (50k entry cap) and guest IP counters (10k cap) now evict stale entries to prevent unbounded memory growth on serverless instances.
- **Shared body parsing**: All mutation API routes use `parseMutationBody()` from `lib/apiHeaders.ts` — single source of truth for CSRF, Content-Type, size, and JSON validation.
- **Unicode prompt injection defense**: `promptGuard.ts` applies NFKC normalization to collapse fullwidth and homoglyph characters before pattern matching.
- **Coach UX improvements**: Retry button on generic errors, animated thinking indicator, skeleton loading on mentor switch.
- **Stripe webhook hardening**: 1 MB payload size limit (HTTP 413) before body read.
- **GoBoard disabled state**: Board renders at 50% opacity when non-interactive.

## 4. Immediate Next Steps (Phase 3)

1. **Production Smoke Checks**: Verify DNS/SMTP and Stripe Live Webhooks.
2. **Full Coach Rollout**: Continue bulk-approving remaining puzzles for Pro usage.
3. **Content Depth**: Expand beyond 19×19 life-and-death into 9×9/13×13 and opening/endgame categories.

---

For strategic depth, see [docs/en/CONCEPT.md](docs/en/CONCEPT.md).
