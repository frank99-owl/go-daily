# Product Specifications & Feature Logic

This document defines the behavioral logic of go-daily's core features, synchronized with the current implementation of the entitlement and subscription engines.

## 1. The Entitlement Engine (`lib/entitlements.ts`)

Instead of scattered boolean checks, go-daily uses a centralized **Lookup Table** to manage permissions. This ensures that adding a new tier (e.g., "Lifetime") only requires updating a single constant.

| Feature            | Free Plan              | Pro Plan                     |
| ------------------ | ---------------------- | ---------------------------- |
| **AI Coach Quota** | 3 messages / day       | Unlimited (100/day soft cap) |
| **Puzzle Archive** | Last 30 days + Curated | All 3,000+ Puzzles           |
| **Device Limit**   | 1 Device (Hard cap)    | Unlimited                    |
| **Review Mode**    | Last 20 Mistakes       | Full SM-2 SRS Logic          |
| **Share Cards**    | With Watermark         | No Watermark + Custom Rank   |

### Cache Strategy (Next.js 16)

We utilize the `'use cache'` directive and `cacheTag` for entitlements. When a Stripe webhook updates a subscription, we call `revalidateTag('entitlements:' + userId)` to ensure the UI reflects the new state without a full page reload.

## 2. Spaced Repetition (SRS) Logic (`lib/srs.ts`)

We implement a modified SuperMemo-2 (SM-2) algorithm.

- **Initial State**: Ease Factor 2.5, Interval 0.
- **Quality Mapping**:
  - Incorrect -> 2 (Triggers immediate re-queue)
  - Correct -> 5 (Calculates next interval based on Ease Factor)
- **Scheduling**: Puzzles are queued in `due_date` ascending order. Pro users can clear their backlog to achieve "Inbox Zero" for Go mistakes.

## 3. Subscription Management (`lib/stripe/`)

- **Checkout**: We use Stripe Adaptive Pricing to automatically localize $4.9 USD to the appropriate JPY/KRW equivalent based on the user's IP.
- **Webhook Idempotency**: Every Stripe event is logged in the `stripe_events` table before processing. If an event is re-delivered, the system detects the duplicate and skips processing.
- **Trial Period**: A 7-day trial is mandatory for all new Pro subscriptions. Users must provide a payment method upfront (`payment_method_collection: 'always'`), which significantly increases the trial-to-paid conversion rate.

## 5. Legal & Compliance Display Logic

The system utilizes a "Content-First" legal delivery mechanism.

- **Dynamic Legal Footer**: The footer links to `/legal/[kind]` based on the active locale.
- **Jurisdiction-Specific Routes**:
  - `/ja/legal/tokushoho`: Strictly mandatory for the Japanese market to satisfy the "Act on Specified Commercial Transactions".
  - **Korea PIPA Bridge (Planned)**: A blocking modal for KR-locale users to obtain explicit consent for data residency in Singapore and the USA.
- **Terms Acceptance**: Registration implies consent to the Terms of Service and Privacy Policy. The "Checkout" process includes a secondary confirmation of the Refund Policy for digital goods.
