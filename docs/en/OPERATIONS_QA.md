# Operations, Deployment & Quality Assurance

This document describes the production lifecycle of go-daily, from environment configuration to quality validation.

## 1. Production Stack

- **Hosting**: Vercel (Region: `iad1` - US East)
- **Database**: Supabase (Region: `ap-southeast-1` - Singapore)
- **Rate Limiting**: Upstash Redis (Region: `ap-southeast-1` - Singapore)
- **DNS & CDN**: Cloudflare (Proxy enabled)
- **Observability**: Sentry (Errors) + PostHog (Events) + Vercel Speed Insights

## 2. Environment Configuration

Configuration is managed via Vercel Environment Variables. The most critical toggles are:

- `NEXT_PUBLIC_IS_COMMERCIAL`: Set to `true` to enable Stripe elements and the `/pricing` page.
- `COACH_MODEL`: Defaults to `deepseek-chat`. Verified against api.deepseek.com on 2026-09-16: `deepseek-chat`, `deepseek-v4-flash`, `deepseek-reasoner` and `deepseek-flash` all resolve to `deepseek-flash`; `deepseek-chat` has thinking off by default and the other three have it on. `/models` does not list these aliases, but all of them work — `deepseek-chat` is not retired.
- `COACH_MAX_TOKENS`: Total generation budget per reply, default `2000` (range 256–16000). A reasoning model's hidden reasoning is charged against this budget, so it is not a reply-length cap — the system prompt controls length. Until 2026-09 it was hardcoded to `400`: `deepseek-v4-flash` spent all 400 on reasoning, finished with `length`, and produced no visible content.
- `COACH_THINKING`: DeepSeek's thinking switch, `enabled` or `disabled`. **When unset, the endpoint decides: `api.deepseek.com` gets `disabled` automatically, any other host gets nothing** (so a non-DeepSeek endpoint never receives an unknown parameter). That makes the default correct whichever DeepSeek name `COACH_MODEL` holds. Set `enabled` only deliberately, because: the prompt already carries the accepted answer, wrong branches and solution note, so hidden reasoning mostly re-derives known answers. Measured with thinking on, "why was my move wrong?" used 1.5k–2k+ reasoning tokens, took ~10s, and was cut off about half the time; with it off, ~200 tokens, ~2s, and the coach eval passes 16/16. DeepSeek also documents that thinking mode ignores `temperature`. The fallback endpoint uses its own `COACH_FALLBACK_THINKING`, does not inherit the primary's, and when unset gets the same host-based default for its own host.
- **No monthly token budget is implemented.** `COACH_MONTHLY_TOKEN_BUDGET`, which earlier versions of this document described, does not exist in the code. Coach spend is bounded only by per-user daily/monthly quotas (`lib/coach/coachQuota.ts`), guest counters, and rate limiting — there is no global billing cap, so set usage alerts in the model provider's console.
- After changing any of the above, run `npm run eval:coach -- --live`; the report records reasoning tokens, total tokens, latency and `finish_reason` per case.
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`: **Required in production** — when `NODE_ENV === "production"` and either is missing, `createRateLimiter()` returns a stub whose first `isLimited()` call throws (see `lib/rateLimit.ts`; this deferral allows `next build` without Upstash credentials). In **development**, omit both to use `MemoryRateLimiter` (single-process only).

### OG & Twitter preview images (`next/og`)

- **Where**: `app/opengraph-image.tsx`, `app/twitter-image.tsx` (site defaults), and `app/[locale]/opengraph-image.tsx` (locale-specific artwork).
- **Runtime**: Root OG/Twitter files set `export const runtime = "nodejs"` with `ImageResponse` so Next.js **prerenders them as static routes** at build time and avoids Edge-runtime warnings about static generation.
- **Satori markup**: The renderer does **not** support `z-index`; build layered backgrounds on the **outer wrapper’s `background`** instead of stacking absolutely positioned overlays.

## 3. Deployment Preflight (`scripts/productionPreflight.ts`)

Before any production push, run the following command. The script emits a variable checklist (required env vars, key-shape checks, optional live Supabase column probes, optional Stripe price probes — see `scripts/productionPreflight.ts` for the authoritative list):

```bash
npm run preflight:prod -- --stripe-mode=live
```

This script checks:

- Stripe Live Key validity.
- Supabase table and RLS presence.
- External DNS/SMTP health for Resend.
- Consistency of localized message keys.

## 4. Quality Assurance Plan

### Automated Coverage (Vitest)

We maintain 111 Vitest files with 996 test cases, plus 14 Playwright end-to-end specs (2026-08-24), covering:

- **Logic**: `tests/lib/puzzle/srs.test.ts`, `tests/lib/entitlements.test.ts`.
- **UI**: `tests/components/GoBoard.test.tsx`, `tests/app/TodayClient.test.tsx`.
- **API**: `tests/api/stripeWebhook.test.ts`.
- **End-to-end**: `e2e/locale-routing.spec.ts`, `e2e/daily-puzzle.spec.ts`, `e2e/site-health.spec.ts` — run with `npm run test:e2e` against a production build, as their own CI job.

### Manual Acceptance Checklist (Critical Paths)

1.  **Cross-Device Consistency**: Solve a puzzle on desktop, check phone within 5s.
2.  **Trial Conversion**: Run a full Stripe Checkout in test mode with a 3-day trial.
3.  **Locale SEO**: Validate `sitemap.xml` includes **12,000+** locale-specific entries (grows with `content/data/puzzleIndex.json`), with correct `hreflang` alternates.
4.  **Coach Guardrail**: Attempt a prompt injection (e.g., "forget previous instructions") to verify `promptGuard.ts` interceptors. `promptGuard.ts` applies Unicode NFKC normalization plus common Cyrillic/Greek confusable folding before pattern matching, so fullwidth and lookalike bypasses (e.g., `ＳＹＳＴｅｍ: ignore all`) are blocked too, and it carries zh/ja/ko patterns as well as English ones. Check both directions: ordinary Go questions must get through — "How do I get to 1 dan?", "Is there a system for counting liberties?" — because an over-broad pattern once rejected all of them. A rejection shows a localized message and the offending message is removed from the conversation rather than left to be resent.
5.  **Coach Topic Scope**: Ask something unrelated to Go (the weather, a coding question). The coach must decline in one in-character sentence and steer back to the position, never answer it and never reply with nothing.
6.  **Mobile Viewport**: On a <768px viewport (real device or WebKit touch emulation), confirm no horizontal overflow, the hamburger menu works, the board shrinks into the screen, taps place stones, and vertical scrolls starting on the board never place one; desktop (≥768px) rendering must match the baseline.

## 5. Test Organization

Tests mirror the source tree under `tests/`:

| Directory           | Scope                  | Examples                                                              |
| ------------------- | ---------------------- | --------------------------------------------------------------------- |
| `tests/lib/`        | Core library logic     | `puzzle/srs.test.ts`, `entitlements.test.ts`, `coachProvider.test.ts` |
| `tests/components/` | React components       | `GoBoard.test.tsx`, `Nav.test.tsx`, `ShareCard.test.tsx`              |
| `tests/api/`        | API route handlers     | `stripeWebhook.test.ts`, `coach.test.ts`, `puzzleRandom.test.ts`      |
| `tests/app/`        | Page-level integration | `TodayClient.test.tsx`, `StatsClient.test.tsx`                        |
| `tests/scripts/`    | Build/audit scripts    | `auditPuzzles.test.ts`, `queueContent.test.ts`                        |

Run tests with:

```bash
npm run dev               # Start dev server
npm run build             # Production build (includes prebuild validation)
npm run start             # Start production server
npm run lint              # Run ESLint
npm run test              # Run all tests
npm run test:watch        # Watch mode
npm run test:coverage     # With coverage report (target: 70%+)
npm run format            # Format code with Prettier
npm run format:check      # Check formatting without writing
npm run import:puzzles    # Import tsumego puzzles
npm run sync:puzzle-index # Sync puzzle index
npm run validate:puzzles  # Validate puzzle data
npm run validate:messages # Validate i18n message keys
npm run preflight:prod    # Run production preflight checks
npm run audit:puzzles     # Audit puzzle quality
npm run report:duplicates # Report duplicate puzzles
npm run report:quality    # Report puzzle quality metrics
npm run queue:content     # Queue content generation
npm run gemini:solutions  # Generate solution notes (Gemini)
npm run mimo:solutions    # Generate solution notes (MiMo)
npm run supabase:health   # Check Supabase health
npm run email:smoketest   # Run email smoketest
npm run generate:icons    # Regenerate PWA icons from public/icon.svg
```

## 6. Pre-Launch Compliance Audit

Compliance requires manual verification across external dashboards.

### Stripe (Payments & Tax)

- [ ] **Account Verification**: Ensure your identity and bank details are fully verified for JPY/KRW payouts.
- [ ] **Stripe Tax**: Enable tax calculation for Japan (JCT) and relevant US states.
- [ ] **Public Info**: Update "Public Details" to match the disclosures in `tokushoho/page.tsx`.

### Resend & Supabase (Communications)

- [ ] **Domain Verification**: SPF/DKIM records must be green in Resend to ensure legal delivery of invoices.
- [ ] **Sender Identity**: Update the Supabase Auth "Sender" to your custom domain (`support@go-daily.app`).

### Privacy & Governance

- [ ] **PIPA Consent**: (Manual check) Verify the sequential PIPA consent flow triggers before login for ko locale.
- [ ] **Sentry PII Filter**: Run a test coaching dialogue and verify in the Sentry dashboard that no email or PII is visible in the breadcrumbs.
