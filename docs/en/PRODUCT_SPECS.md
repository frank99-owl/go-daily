# Product Specifications & Feature Logic

This document defines the behavioral logic of go-daily's core features, synchronized with the current implementation of the entitlement and subscription engines.

## 1. The Entitlement Engine (`lib/entitlements.ts`)

Instead of scattered boolean checks, go-daily uses a centralized **Lookup Table** to manage permissions. This ensures that adding a new tier (e.g., "Lifetime") only requires updating a single constant.

| Feature            | Free Plan                  | Pro Plan                    |
| ------------------ | -------------------------- | --------------------------- |
| **AI Coach Quota** | 3 messages / day, 20/month | 10 messages / day, 50/month |
| **Puzzle Archive** | Last 30 days + Curated     | All 3,000+ Puzzles          |
| **Device Limit**   | 1 Device (Hard cap)        | Unlimited                   |
| **Review Mode**    | Last 20 Mistakes           | Full SM-2 SRS Logic         |
| **Share Cards**    | (Planned, not implemented) | (Planned, not implemented)  |

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

## 4. Puzzle Collections & Filtering (`lib/puzzle/puzzleCollections.ts`)

The puzzle library supports tag-based and difficulty-based filtering for browsing:

- **Tags**: `life-death`, `tesuji`, `endgame`, `opening` (defined in `PuzzleTagSchema`).
- **Difficulties**: 1–5 scale. Each puzzle has a single difficulty rating.
- **Collection Pages**: `/puzzles/tags/{tag}` and `/puzzles/difficulty/{level}` render filtered views using the `PuzzleListClient` component.

## 5. Legal & Compliance Display Logic

The system utilizes an Apple-style "Unified Pillar" legal delivery mechanism.

- **Dynamic Legal Footer**: The footer links to three core pillars: `/legal/privacy`, `/legal/terms`, and `/legal/refund`.
- **Integrated Disclosures**:
  - **Japan Tokushoho**: Integrated directly into the Terms of Service.
  - **Taiwan CPA**: Integrated directly into the Terms of Service.
  - **UK/EU DMCCA**: Integrated into the Refund Policy.
- **Content Delivery**: All legal texts are content-driven from `app/[locale]/legal/_content.ts`.
