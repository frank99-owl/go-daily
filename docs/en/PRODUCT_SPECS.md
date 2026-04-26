# Product Specifications & Feature Logic

This document defines the behavioral logic of go-daily's core features, synchronized with the current implementation of the entitlement and subscription engines.

## 1. The Entitlement Engine (`lib/entitlements.ts`)

Instead of scattered boolean checks, go-daily uses a centralized **Lookup Table** to manage permissions. This ensures that adding a new tier (e.g., "Lifetime") only requires updating a single constant.

| Feature            | Free Plan              | Pro Plan                     |
| ------------------ | ---------------------- | ---------------------------- |
| **AI Coach Quota** | 3 messages / day       | Unlimited (100/day soft cap) |
| **Puzzle Archive** | Last 30 days + Curated | All 1,210+ Puzzles           |
| **Device Limit**   | 2 Devices (Hard cap)   | Unlimited                    |
| **Review Mode**    | Last 20 Mistakes       | Full SM-2 SRS Logic          |
| **Share Cards**    | With Watermark         | No Watermark + Custom Rank   |

### Cache Strategy (Next.js 16)

We utilize the `'use cache'` directive and `cacheTag` for entitlements. When a Stripe webhook updates a subscription, we call `revalidateTag('entitlements:' + userId)` to ensure the UI reflects the new state without a full page reload.

## 2. Spaced Repetition (SRS) Logic (`lib/srs.ts`)

We implement a modified SuperMemo-2 (SM-2) algorithm.

- **Initial State**: Ease Factor 2.5, Interval 0.
- **Quality Mapping**:
  - Incorrect -> 0 (Reset interval)
  - Correct (> 60s) -> 3
  - Correct (15s-60s) -> 4
  - Correct (< 15s) -> 5
- **Scheduling**: Puzzles are queued in `due_date` ascending order. Pro users can clear their backlog to achieve "Inbox Zero" for Go mistakes.

## 3. Subscription Management (`lib/stripe/`)

- **Checkout**: We use Stripe Adaptive Pricing to automatically localize $4.9 USD to the appropriate JPY/KRW equivalent based on the user's IP.
- **Webhook Idempotency**: Every Stripe event is logged in the `stripe_events` table before processing. If an event is re-delivered, the system detects the duplicate and skips processing.
- **Trial Period**: A 7-day trial is mandatory for all new Pro subscriptions. Users must provide a payment method upfront (`payment_method_collection: 'always'`), which significantly increases the trial-to-paid conversion rate.

## 4. AI Coach Eligibility (`lib/coach/`)

Not every puzzle is ready for AI coaching. A puzzle must pass two checks:

1.  **Approved ID**: Must exist in `coachEligibleIds.json` (Approved by an admin/script).
2.  **Solution Note**: Must have a valid `solutionNote` in the user's current locale.
    If a user clicks the Coach on an ineligible puzzle, the UI gracefully falls back to a "Solution Reveal" mode.
