# Operations, Deployment & Quality Assurance

This document describes the production lifecycle of go-daily, from environment configuration to quality validation.

## 1. Production Stack

- **Hosting**: Vercel (Region: `iad1` - US East)
- **Database**: Supabase (Region: `ap-southeast-1` - Singapore)
- **DNS & CDN**: Cloudflare (Proxy enabled)
- **Observability**: Sentry (Errors) + PostHog (Events) + Vercel Speed Insights

## 2. Environment Configuration

Configuration is managed via Vercel Environment Variables. The most critical toggles are:

- `NEXT_PUBLIC_IS_COMMERCIAL`: Set to `true` to enable Stripe elements and the `/pricing` page.
- `COACH_MODEL`: Defaults to `deepseek-chat`. Can be swapped to `deepseek-reasoner` for higher accuracy.
- `COACH_MONTHLY_TOKEN_BUDGET`: Hard application-level limit to prevent billing spikes.

## 3. Deployment Preflight (`scripts/productionPreflight.ts`)

Before any production push, run the following command to validate 47 critical configuration points:

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

We maintain ~570 tests covering:

- **Logic**: `lib/srs.test.ts`, `lib/entitlements.test.ts`.
- **UI**: `components/GoBoard.test.tsx`, `app/TodayClient.test.tsx`.
- **API**: `tests/api/stripeWebhook.test.ts`.

### Manual Acceptance Checklist (Critical Paths)

1.  **Cross-Device Consistency**: Solve a puzzle on desktop, check phone within 5s.
2.  **Trial Conversion**: Run a full Stripe Checkout in test mode with a 7-day trial.
3.  **Locale SEO**: Validate `sitemap.xml` contains all 4,800+ entries and `hreflang` alternates.
4.  **Coach Guardrail**: Attempt a prompt injection (e.g., "forget previous instructions") to verify `promptGuard.ts` interceptors.

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

- [ ] **PIPA Consent**: (Manual check) Verify the Korea-specific consent modal (planned) displays the correct recipient name for overseas transfers.
- [ ] **Sentry PII Filter**: Run a test coaching dialogue and verify in the Sentry dashboard that no email or PII is visible in the breadcrumbs.
