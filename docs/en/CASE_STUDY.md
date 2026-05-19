# go-daily Case Study

**Date:** 2026-05-19
**Status:** Internal launch-readiness case study. Not a public launch announcement.

## Summary

go-daily is a daily Go tsumego learning product built around one focused puzzle per day, localized in Chinese, English, Japanese, and Korean. The product combines a habit-oriented puzzle flow, spaced review, account sync, and streaming DeepSeek AI coaching constrained by curated puzzle explanations, board metadata, user quotas, and safety guards.

The project goal is not to make a broad AI chatbot for Go. It is to turn short daily practice into a reliable learning loop: onboarding, first puzzle, result explanation, coach-assisted understanding, review, and next recommendation.

## Product Problem

Go learners often stop practicing because the feedback loop is weak. A puzzle app can show whether a move is right or wrong, but users still need to understand why the vital point works, what failed in their wrong move, and when to revisit the pattern.

go-daily addresses that problem with three constraints:

- Keep the session small enough for daily repetition.
- Use AI only where puzzle context and content quality support it.
- Treat review and next recommendation as first-class product surfaces, not afterthoughts.

## Current Product Surface

- Daily puzzle flow with locale-prefixed routing.
- Four-language UX: Chinese, English, Japanese, and Korean.
- Streaming AI coach with personas, quotas, prompt-injection guardrails, and content-tier eligibility.
- Spaced repetition review for logged-in users.
- Supabase Auth and Postgres with RLS.
- Stripe subscription infrastructure for Pro features.
- Production smoke checks, message validation, linting, typechecking, and Vitest coverage.

## Architecture

The app uses Next.js 16 App Router and React 19. Core business logic is organized into nine domains under `lib/`: auth, board, coach, i18n, posthog, puzzle, storage, stripe, and supabase.

Key architectural decisions:

- Locale-aware routing under `app/[locale]/`.
- Zod schemas as the shared type source of truth.
- RLS-backed Supabase tables for user data.
- A three-tier persistence model: LocalStorage, IndexedDB queue, then Supabase sync.
- A stable attempt dedup key: `puzzleId-solvedAtMs`.
- Server-only boundaries for Stripe, service-role Supabase, and coach state.

## AI Coaching Boundary

The coach is designed as a constrained learning assistant. It receives the puzzle context needed for explanation, recent short history, and a selected persona style. It should not receive account secrets, payment identifiers, emails, device IDs, or unrestricted raw user data.

The current safety and cost controls include:

- Prompt guard before puzzle lookup, quota writes, and model calls.
- Request body and conversation history limits.
- Fixed model output token limit and timeout.
- Guest and signed-in quota enforcement.
- Usage rollback when upstream model construction or streaming fails.
- PostHog server-side event scrubbing and hashed distinct IDs.
- Sentry scrubbing for emails, URL query/hash values, tokens, secrets, API keys, cookies, and authorization headers.

## Content Quality Model

The puzzle corpus currently contains 3033 puzzles. All are 19x19, with a heavy concentration in tesuji and mid-level difficulty. Content audit reports show that all puzzles have basic explanations, but only the first approved batch should be treated as full AI coach-ready content.

The product uses these working tiers:

- `basic-explained`: usable for daily puzzle flow and static explanation.
- `coach-eligible`: passes basic quality gates and can enter the content operations queue.
- `coach-ready`: has approved solution sequence and wrong-branch support.
- `variation-ready`: related positions are organized into teachable variations.

As of this launch-readiness pass, the current approved coach-ready set is 20 puzzles. The rest should not be marketed as complete AI variation coaching.

## Launch Readiness

Phase 3 first-pass work has produced:

- Content quality baseline and editing workflow.
- Learning loop improvements across onboarding, result, recommendation, review, stats, and coach dialogue.
- Commercial copy audit to remove unverifiable claims.
- Funnel event map for activation, retention, coach usage, and conversion.
- Production smoke preflight.
- AI safety, cost, Sentry, and PostHog privacy hardening.
- Launch checklist, revenue experiments, user interview script, and 30/60/90 roadmap.

On May 19, 2026, the approved production release window passed: Vercel Production redeploy succeeded, Resend real-send smoke succeeded, Stripe live $1 payment/refund smoke succeeded, and final live preflight passed with **123 pass / 0 warn / 0 fail**.

Public release actions remain intentionally separate. Pushing code, creating a GitHub release, public announcements, or external user outreach require explicit approval.

## Validation Commands

Recommended local checks before a release-review commit:

```bash
npm run validate:messages
npm run lint
npx tsc --noEmit
npx prettier --check README.md README.zh.md docs/README.md docs/zh/*.md docs/en/*.md
```

For deeper release windows, add:

```bash
npm run preflight:prod
npm run build
```

Live Supabase, Stripe, Resend, DNS, and production payment checks should only run inside an approved release window. The May 19, 2026 window has already verified Resend, Stripe live payment/refund, Vercel Production, and Supabase remote checks.

## Lessons

- AI coaching is only credible when content quality and product boundaries are explicit.
- A large puzzle count is less valuable than a reliable learning loop and review cadence.
- Public product copy must describe delivered features, not implied learning outcomes.
- Launch readiness is a sequence of reversible checks, not a single deployment event.
