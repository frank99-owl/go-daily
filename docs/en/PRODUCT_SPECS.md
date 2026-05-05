# Product Specifications & Feature Logic

This document defines the behavioral logic of go-daily's core features, synchronized with the current implementation of the entitlement and subscription engines.

## 1. The Entitlement Engine (`lib/entitlements.ts`)

Instead of scattered boolean checks, go-daily uses a centralized **Lookup Table** to manage permissions. This ensures that adding a new tier (e.g., "Lifetime") only requires updating a single constant.

| Feature            | Guest (No Login)   | Free Plan            | Pro Plan                       |
| ------------------ | ------------------ | -------------------- | ------------------------------ |
| **AI Coach Quota** | 3 / day, 5 / month | 10 / day, 30 / month | **50+ / day · 1,000+ / month** |
| **Device Limit**   | —                  | 1 device             | 3 devices                      |
| **Cloud Sync**     | None               | Single-device        | Multi-device                   |
| **Ads**            | Enabled            | Enabled              | Disabled                       |

Public-facing docs round **Pro** limits this way; authoritative counters live only in `lib/entitlements.ts`.

Beyond device quotas: guest coach requests also enforce an extra **per–IP-address daily cap** on the server (currently **20** requests per UTC calendar day in `GUEST_IP_DAILY_LIMIT`, `guestCoachUsage.ts`). IP counts live in **Upstash** when `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are set; otherwise they use an in-process `Map` (10k-key cap, oldest-key eviction after day rollover). This does not change the per-device counts in the table above.

Logged-in browsers register or refresh their `user_devices` row through `POST /api/auth/device`. That endpoint resolves Stripe subscription state plus `manual_grants` before applying the Free or Pro device limit.

### Cache Strategy (Next.js 16)

We utilize the `'use cache'` directive and `cacheTag` for entitlements. When a Stripe webhook updates a subscription, we call `revalidateTag('entitlements:' + userId)` to ensure the UI reflects the new state without a full page reload.

### Manual Pro grants (`manual_grants` / `lib/entitlementsServer.ts`)

Operators can grant Pro by email without Stripe using the `manual_grants` table and `/api/admin/grants`. `resolveViewerPlan()` (`lib/entitlementsServer.ts`) starts from `getViewerPlan()` (Stripe subscription status); if the user is not already Pro, an unexpired manual grant upgrades them to Pro.

## 2. Spaced Repetition (SRS) Logic (`lib/puzzle/srs.ts`)

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

## 6. Accessibility & Route Boundaries

- **Heatmap ARIA**: The activity heatmap uses `role="grid"` with `aria-label` on the container and `role="gridcell"` with descriptive `aria-label` on each day cell.
- **UserMenu Keyboard Navigation**: The dropdown menu supports ArrowUp/Down to cycle items, Home/End to jump to first/last, Escape to close, and auto-focuses the first item on open.
- **Route Loading/Error States**: Key routes (today, result, review, puzzles) have `loading.tsx` (skeleton UI) and `error.tsx` (localized error boundary with retry) files. Shared components: `PageSkeleton` and `PageError`.
- **Theme via CSS Variable**: All accent color usage references `var(--color-accent)` (defined in `globals.css`) instead of hardcoded hex values, enabling future theme customization.
