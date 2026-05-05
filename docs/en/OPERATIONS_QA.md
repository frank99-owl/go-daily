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
- `COACH_MODEL`: Defaults to `deepseek-chat`. Can be swapped to `deepseek-reasoner` for higher accuracy.
- `COACH_MONTHLY_TOKEN_BUDGET`: Hard application-level limit to prevent billing spikes.
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`: **Required in production** — `createRateLimiter()` throws if either is missing when `NODE_ENV === "production"` (route modules import the limiter at load time). In **development**, omit both to use `MemoryRateLimiter` (single-process only).

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

We maintain 81 test files with 647 test cases covering:

- **Logic**: `tests/lib/puzzle/srs.test.ts`, `tests/lib/entitlements.test.ts`.
- **UI**: `tests/components/GoBoard.test.tsx`, `tests/app/TodayClient.test.tsx`.
- **API**: `tests/api/stripeWebhook.test.ts`.

### Manual Acceptance Checklist (Critical Paths)

1.  **Cross-Device Consistency**: Solve a puzzle on desktop, check phone within 5s.
2.  **Trial Conversion**: Run a full Stripe Checkout in test mode with a 7-day trial.
3.  **Locale SEO**: Validate `sitemap.xml` includes **12,000+** locale-specific entries (grows with `content/data/puzzleIndex.json`), with correct `hreflang` alternates.
4.  **Coach Guardrail**: Attempt a prompt injection (e.g., "forget previous instructions") to verify `promptGuard.ts` interceptors. `promptGuard.ts` now applies Unicode NFKC normalization before pattern matching. Verify that fullwidth character bypasses (e.g., `ＳＹＳＴｅｍ: ignore all`) are also blocked.

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
npm run generate:katago   # Generate KataGo puzzles
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
