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

`past_due` Stripe subscriptions do not keep Pro indefinitely. `lib/entitlements.ts` only treats `past_due` as Pro through `current_period_end + 7 days`; missing or expired period-end data falls back to Free unless an unexpired `manual_grants` row applies. The `/admin` Operations Snapshot reports in-grace versus expired `past_due` counts for follow-up.

### Cache Strategy (Next.js 16)

We utilize the `'use cache'` directive and `cacheTag` for entitlements. When a Stripe webhook updates a subscription, we call `revalidateTag('entitlements:' + userId)` to ensure the UI reflects the new state without a full page reload.

### Manual Pro grants (`manual_grants` / `lib/entitlementsServer.ts`)

Operators can grant Pro by email without Stripe using the `manual_grants` table and `/api/admin/grants`. `resolveViewerPlan()` (`lib/entitlementsServer.ts`) starts from `getViewerPlan()` (Stripe subscription status); if the user is not already Pro, an unexpired manual grant upgrades them to Pro. The grants API authenticates operators via `ADMIN_USER_IDS` (session user UUID allowlist); PIN verification and email allowlists for the admin UI are separate (see `API_REFERENCE`).

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
- **Trial Period**: A 3-day trial is mandatory for all new Pro subscriptions. Users must provide a payment method upfront (`payment_method_collection: 'always'`), which significantly increases the trial-to-paid conversion rate.

## 4. Puzzle Collections & Filtering (`lib/puzzle/puzzleCollections.ts`)

The puzzle library supports tag-based and difficulty-based filtering for browsing:

- **Tags**: `life-death`, `tesuji`, `endgame`, `opening` (defined in `PuzzleTagSchema`).
- **Difficulties**: 1–5 scale. Each puzzle has a single difficulty rating.
- **Collection Pages**: `/puzzles/tags/{tag}` and `/puzzles/difficulty/{level}` render filtered views using the `PuzzleListClient` component.

## 5. Content Quality Tiers

A puzzle's suitability for AI coaching cannot be judged solely by whether it has a correct answer. The shared structure is defined in `types/schemas.ts`: `correct` and `solutionNote` are base fields, while `solutionSequence` and `wrongBranches` are optional deep instructional fields.

The product layers puzzle quality into four tiers:

| Tier              | Criteria                                                                                                  | Product Use                                                                             |
| ----------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `basic-explained` | Correct answer and explanation in 4 languages; not in operation allowlists                                | Daily puzzles, result page explanations, basic review                                   |
| `coach-eligible`  | Passes `checkCoachEligibility()` basic quality gates; available for operations queue                      | Limited basic AI explanations, first puzzle pool, content enhancement candidates        |
| `coach-ready`     | Correct answer, explanation, `solutionSequence`, and `wrongBranches`; approved                            | Full AI Coach active, allows follow-up questions on variations                          |
| `variation-ready` | Duplicate groups or transpositions organized into explicit variation relationships; differences explained | Special topic training, root cause analysis, next recommendation, advanced review paths |

In the implementation, `lib/coach/coachEligibility.ts` returns `qualityTier` and `hasVariationSupport`; `content/data/coachBasicEligibleIds.json` indicates basic explanation access, `content/data/coachReadyIds.json` represents full Coach approval, and `content/data/variationGroups.json` tracks organized variation groups. `getCoachAccess()` checks both data layers and runtime quality gates. Puzzles only count as full AI Coach puzzles if they reach `coach-ready` and are in `coachReadyIds.json`; `variation-ready` also requires entry in the reviewed variation groups. Tiers `basic-explained` / `coach-eligible` can offer static explanations or limited Q&A, but do not promise full variation dialogue.

## 6. The Learning Loop

The target path is `onboarding → first puzzle → result → coach → review → next recommendation`:

| Step                | Feedback for User                                                 | System Basis                                                   |
| ------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------- |
| Onboarding          | Suitable training intensity, tag entries, and today's goal        | Training level preference, locale, auth state                  |
| First puzzle        | Clear tag, difficulty, active turn, instant move feedback         | Puzzle index, daily selection, board rules                     |
| Result              | Pass/fail, correct sequence, shape explanation, whether to review | `correct`, `solutionNote`, attempt record                      |
| Coach               | Q&A capability boundaries; full Q&A only on approved puzzles      | `qualityTier`, quotas, approval list, persona                  |
| Review              | Last mistake reason, review goal, next SRS time                   | Attempt history, `reviewSrs.ts`                                |
| Next recommendation | Next best puzzle instead of purely random selection               | Difficulty, tags, SRS expiration, recent errors, content tiers |

The core metrics of this loop are first puzzle completion rate, continuation rate from the result page, next-day return rate after Coach use, mistake review completion rate, and Pro upsell conversion point quality.

## 7. AI Security & Cost Boundaries

Coach request security and cost controls are shared by `/api/coach`, `lib/promptGuard.ts`, `lib/coach/*`, `lib/rateLimit.ts`, and observability wrappers:

- **Prompt Injection Defense**: User messages pass through `guardUserMessage()` first. Detection checks include NFKC normalization, Cyrillic/Greek homoglyph folding, zero-width space removal, compact string matching, and keyword density checks. Injected requests are rejected before querying puzzles, quota deduction, or calling models.
- **Request and Context Budget**: The Coach POST request body is limited to 8 KB; conversation history keeps up to 6 rounds, with a character budget of 6,000 (trimmed to 2,000 per message); upstream model `max_tokens` is fixed at 400 with a 25-second timeout.
- **Quotas and Rate Limiting**: Global IP rate limiting is handled by `createRateLimiter()`, where production without Upstash throws 503 on first limit check. Guests have device daily/monthly caps plus IP daily caps; logged-in users check/increment daily/monthly quotas atomically via Postgres RPCs to avoid concurrent bypass.
- **Deduction and Rollback**: Quota usage is deducted before streaming model responses to prevent users from terminating connections to evade counts; deductions are rolled back on upstream construction or stream failures. Malformed requests, promptGuard flags, unavailable puzzles, or insufficient quota will not invoke the model.
- **Cost Observability**: Server-side PostHog only logs model name, provider, latency, and token count; it never logs user input, AI replies, SGF sequences, or internal IDs. If the provider does not return usage, it is flagged as `usageAvailable=false`.

## 8. Funnel & Events

PostHog events are divided into activation, retention, coach, and conversion categories, with the single source of truth defined in `lib/posthog/eventTypes.ts`. Clients send events via `track()`, and servers via `captureServerEvent()`. Tests use mock wrappers to avoid actual network calls.

| Category   | Event                                                                                                               | Low-sensitivity Properties                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Activation | `onboarding_started`, `first_move_played`, `first_puzzle_completed`, `result_viewed`, `next_recommendation_clicked` | `locale`, `source`, `level`, `tag`, `difficulty`, `contentTier`, `result`, `recommendationType` |
| Retention  | `review_page_viewed`, `review_item_opened`, `stats_page_viewed`, `review_recommendation_viewed`                     | `locale`, `source`, `plan`, `tag`, `difficulty`, `result`, `recommendationType`                 |
| Coach      | `coach_opened`, `coach_prompt_clicked`, `coach_response_completed`, `coach_error_shown`, `coach_quota_state_seen`   | `locale`, `source`, `contentTier`, `result`, `promptKey`                                        |
| Conversion | `pricing_viewed`, `checkout_click`, `upsell_viewed`, `upsell_cta_clicked`                                           | `locale`, `source`, `plan`, `interval`                                                          |

Privacy Boundaries: Event properties never send raw SGF files, free-text user inputs, AI replies, email addresses, user IDs, Stripe customer/subscription IDs, device IDs, or reveal tokens. The server-side PostHog `distinctId` uses a SHA-256 derivation to prevent exposing database or payment system IDs. `captureServerEvent()` checks for sensitive keys and values before sending, blocking the event and logging a low-sensitivity warning if triggered.

## 9. Legal & Compliance Display Logic

The system utilizes an Apple-style "Unified Pillar" legal delivery mechanism.

- **Dynamic Legal Footer**: The footer links to three core pillars: `/legal/privacy`, `/legal/terms`, and `/legal/refund`.
- **Integrated Disclosures**:
  - **Japan Tokushoho**: Integrated directly into the Terms of Service.
  - **Taiwan CPA**: Integrated directly into the Terms of Service.
  - **UK/EU DMCCA**: Integrated into the Refund Policy.
- **Content Delivery**: All legal texts are content-driven from `app/[locale]/legal/_content.ts`.

## 10. Accessibility & Route Boundaries

- **Heatmap ARIA**: The activity heatmap uses `role="grid"` with `aria-label` on the container and `role="gridcell"` with descriptive `aria-label` on each day cell.
- **UserMenu Keyboard Navigation**: The dropdown menu supports ArrowUp/Down to cycle items, Home/End to jump to first/last, Escape to close, and auto-focuses the first item on open.
- **Route Loading/Error States**: Key routes (today, result, review, puzzles) have `loading.tsx` (skeleton UI) and `error.tsx` (localized error boundary with retry) files. Shared components: `PageSkeleton` and `PageError`.
- **Theme via CSS Variable**: All accent color usage references `var(--color-accent)` (defined in `globals.css`) instead of hardcoded hex values, enabling future theme customization.
