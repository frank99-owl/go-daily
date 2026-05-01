# Changelog

All notable changes to go-daily are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/). Versioning adheres to [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Changed

- Documentation structure reorganized into formal project-level architecture.
- Improved multilingual content: natural Japanese/Korean translations replacing mechanical translations.
- Mentoring page content optimized across all four locales.

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

---

## [1.0.0] - 2026-04-01

### Added

- **Core puzzle engine**: 3,033 curated tsumego puzzles (19x19) with difficulty ratings, tags, and four-language prompts.
- **AI Coach (Socratic)**: DeepSeek-powered coaching with 5 persona mentors (Ke Jie, Lee Sedol, Go Seigen, Iyama Yuta, Shin Jinseo).
- **Multilingual UI**: Full support for Chinese (zh), English (en), Japanese (ja), and Korean (ko).
- **URL-prefixed routing**: `/{locale}/...` pattern for SEO-friendly internationalization (4,800+ indexable URLs).
- **Three-state storage**: Anonymous LocalStorage → IndexedDB Queue → Supabase Cloud sync.
- **Stripe integration**: Adaptive pricing (JPY/KRW), 7-day trial, monthly/yearly plans.
- **SM-2 spaced repetition**: Pro users get personalized review schedules.
- **Daily puzzle emails**: Vercel Cron + Resend integration with one-click unsubscribe.
- **Legal compliance**: Privacy policy, terms of service, and refund policy for 10 jurisdictions.
- **Deployment preflight**: 47-point production readiness checklist script.
