# go-daily Project Status & Roadmap

**Generated At**: May 19, 2026
**Repository HEAD**: `main` (production configuration and smoke results documented)
**Status**: Phase 3 first pass complete; production configuration and release-window smoke passed; pending GitHub release / public launch approval

---

## 1. Current Baseline

go-daily now has a daily Go puzzle database, 4-locale i18n support, streaming AI coaching powered by DeepSeek, SRS review, Supabase state synchronization, Stripe subscriptions, and multi-jurisdictional legal pages. The focus of the current phase is no longer just adding base features, but organizing these capabilities into a sustainable learning system that drives user retention and conversion.

Latest verification results:

- **Puzzle Validation**: `npm run validate:puzzles` passed, currently at **3033** puzzles.
- **i18n Validation**: `npm run validate:messages` passed, aligning **4 locales × 499 key paths**.
- **P2-C Targeted Tests**: `npm run test -- tests/api/health.test.ts tests/app/sitemap.test.ts tests/app/pwaShell.test.ts tests/api/report-error.test.ts tests/api/stripeWebhook.test.ts tests/api/stripeCheckoutPortal.test.ts tests/api/dailyEmailCron.test.ts tests/scripts/productionPreflight.test.ts tests/scripts/emailSmoketest.test.ts` passed, **9 test files, 66 test cases**.
- **Lint & Type Check**: Both `npm run lint` and `npx tsc --noEmit` passed.
- **P2-D Targeted Tests**: `npm run test -- tests/lib/promptGuard.test.ts tests/api/coach.test.ts tests/lib/posthog/eventTypes.test.ts tests/lib/posthog/server.test.ts` passed, **4 test files, 66 test cases**; expanded suite running `npm run test -- tests/lib/promptGuard.test.ts tests/api/coach.test.ts tests/lib/posthog/eventTypes.test.ts tests/lib/posthog/server.test.ts lib/sentryScrubber.test.ts` passed, **5 test files, 79 test cases**. P2-D has been committed as `32f98c4 security: harden coach guard and telemetry privacy`.
- **Production Live Preflight**: `npm run preflight:prod -- --check-remote --stripe-mode=live` passed with **123 pass / 0 warn / 0 fail**; remote Supabase tables/columns, Stripe live prices, and local production boundaries are all aligned.
- **Email Smoke Test**: Resend production API key rotated and online; `npm run email:smoketest -- --check-remote` passed; `go-daily.app` domain, SPF, and DKIM verified; real email smoke sent successfully.
- **Payment Smoke Test**: Stripe live $1 payment smoke succeeded, followed by a successful refund; Stripe event `pending_webhooks=0`.
- **Production Deployment**: Vercel Production redeployed successfully, and `https://go-daily.app` aliased to the new deployment; `/api/health` returned 200 with Supabase check `ok`; `/en/pricing` returned 200.
- **Production Build**: `npm run build` passed under Next.js **16.2.6**, generating **131** static pages.

## 2. Completed Capabilities

- **Upstash Redis Rate Limiting**: Production uses Upstash Redis for cross-instance rate limiting. When `NODE_ENV === "production"` and Upstash credentials (`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`) are missing, `createRateLimiter()` returns a stub whose first `isLimited()` call throws (allowing `next build` to complete without Upstash; dev ignores both and uses `MemoryRateLimiter`).
- **PWA Icons**: 192×192 and 512×512 PNG icons added for Android/Chrome install prompts.
- **Localized OG Images**: Social share images now render in the viewer's locale (zh/en/ja/ko).
- **ja.json Translation Fix**: Removed Korean/Chinese character contamination from 3 Japanese UI strings.
- **Centralized Env Validation**: `lib/env.ts` with Zod-based lazy singletons replacing scattered `process.env` reads.
- **Error Page i18n**: All error boundaries (`error.tsx`, `global-error.tsx`, `not-found.tsx`) now support 4 locales.
- **Theme Centralization**: 53 hardcoded `#00f2ff` color references replaced with `var(--color-accent)` CSS variable.
- **Code Splitting**: `CoachDialogue`, `ShareCard`, `BoardShowcase` lazy-loaded via `next/dynamic`.
- **P1 Learning Loop First Pass**: Completed onboarding first-puzzle loop, result error understanding, next-recommendation routing, review/stats insights, and restrained CoachDialogue upgrades.
- **P2-A Commercial Copy Audit**: First pass complete; product, pricing, Coach, Review, Stats, and public document entitlements descriptions updated to avoid unsubstantiated claims.
- **P2-B Funnel & Events**: First pass complete; PostHog event naming and triggers for activation, retention, and conversion established.
- **P2-C Production Smoke**: First pass complete and verified on the May 19, 2026 release window: Resend remote real-send, Stripe live payment/refund, Vercel production redeploy, and Supabase remote checks all passed.
- **P2-D AI Security & Cost**: First pass complete; promptGuard red-teaming reinforced, Coach cost controls added, and Sentry/PostHog privacy audited (no external systems modified, no real events sent, no secrets exposed).
- **P2-E Release Materials**: Local first pass complete, including `LAUNCH_CHECKLIST`, README polishing, English case study, revenue experiment plan, user interview scripts, and 30/60/90-day roadmap.
- **SEO hreflang**: `buildHreflangAlternates()` helper adds `alternates.languages` to all page routes.
- **Accessibility**: Heatmap ARIA semantics (`role="grid"`, `aria-label`), UserMenu keyboard navigation (Arrow keys, Home/End).
- **Route Boundaries**: `loading.tsx` + `error.tsx` for today, result, review, and puzzles routes.
- **Guest coach persistence**: `guest_coach_usage` in Supabase stores anonymous coach message counts per device/day (`service_role` only); IP caps stay in-memory for abuse control.
- **Board module**: Core logic consolidated into four modules (`board.ts`, `goRules.ts`, `judge.ts`, `sgf.ts`); legacy `boardDisplay.ts` removed.
- **Documentation sync**: API reference covers `/api/health`, `/api/admin/*`, and `/api/auth/device`; includes **`POST /api/coach` as Server-Sent Events** and Postgres **RPC** usage increments; **admin**: `/api/admin/verify` uses `ADMIN_EMAILS` + `ADMIN_PIN`, while **`/api/admin/grants` uses `ADMIN_USER_IDS`**; database docs include entitlement-aware `user_devices`, `manual_grants`, `guest_coach_usage`, and **`0007_atomic_coach_usage_increment.sql`** notes; multilingual **`CONCEPT.md`** Pro wording matches entitlement quotas (**not** “unlimited” coach — see **`PRODUCT_SPECS`**); README/docs index aligned with the nine-domain layout; `docs/README.md` states public-disclosure hygiene for secrets.

## 3. Content Quality Status

The latest content audit reports are stored under `reports/*/latest.md` and the P0-D local audit check lists (generated on May 18, 2026).

- **Database Structure**: All 3033 puzzles are 19×19; difficulty 3 represents 46.5%, and difficulty 4 represents 35.1%; the primary tag is `tesuji` (1822 puzzles, 60.1%), followed by `life-death` (1187 puzzles), with `endgame` and `opening` having 12 puzzles each.
- **Content Explanation**: Bulk audit shows that all 3033 puzzles have reached the `explained` level, with no missing fields, missing correct answers, or obvious placeholder explanations; 190 explanations exceed 500 characters and require verification to ensure they are not overly repetitive or verbose.
- **Coach Completeness**: Coach data files are split into `coachBasicEligibleIds.json` (3033), `coachReadyIds.json` (20), and `variationGroups.json` (0 groups); `getCoachAccess()` layers these with runtime checks. P0-D completed the integration of `solutionSequence` and `wrongBranches` for 20 puzzles; the remaining **3013** puzzles should not be considered "full AI Coach puzzles" merely because they have text explanations.
- **Quality Sampling**: A subset of 195 puzzles has been flagged for review; puzzles outside the initial P0-D batch generally lack `solutionSequence` and `wrongBranches`. High-difficulty puzzles, adjacent duplicates, and random samples need continued reinforcement.
- **Duplicate Puzzles**: Found 89 partially duplicate groups (containing 243 puzzles); no completely duplicate groups exist. Duplicate groups are usually transposition cases with different explanations, which should be merged into variations or tagged as related practices rather than simply deleted.

## 4. Content Enhancement Roadmap

1. **Establish Tiered Facts**: Explicitly categorize puzzles into `basic-explained`, `coach-eligible`, `coach-ready`, and `variation-ready` tiers. Currently, the entire database serves as `coach-eligible` candidates; the initial 20 puzzles in P0-D are approved as `coach-ready`. Most other puzzles lack target sequences and wrong branches.
2. **Prioritize High-Value Content**: Manually or semi-automatically generate `solutionSequence` and `wrongBranches` for difficulty 4-5 puzzles, duplicate groups, and scarce tags (`endgame` / `opening`), routing them in small batches for review.
3. **Turn Duplicates into Assets**: Convert duplicate groups with different explanations into "transposition / variation" assets, preserving instructional differences; only remove them if they offer zero unique value.
4. **Control Structural Skew**: Prioritize adding 9×9/13×13 beginner paths, endgame, and opening topics to avoid further concentrating the database on 19×19 intermediate tesuji.
5. **Use Reports to Drive Queues**: Utilize `audit:puzzles` to track overall distribution, `report:quality` to check depth, `report:duplicates` to convert duplicates into variations, and `queue:content` to output verified candidates for launch.

## 5. Learning Loop Design

The first pass of P1-A through P1-E has been implemented. The current baseline guides new users from onboarding to their first puzzle, explains errors on the result page, recommends the next step, and provides review/stats insights. CoachDialogue has been optimized to adapt to puzzle tiers, quotas, and failures.

The next phase of the product will organize the user experience around: `onboarding → first puzzle → result → coach → review → next recommendation`:

- **Onboarding**: Gather training level and goals, and offer a clear entrance for "what to do today" rather than introducing features.
- **First puzzle**: Keep friction low; provide clear tag, difficulty, and instant move feedback.
- **Result**: Not just showing correct/wrong, but explaining "why this move works / why that error fails" and suggesting the next action.
- **Coach**: Emphasize full AI Coaching only on approved `coach-ready` puzzles; offer restricted static explanations on `basic-explained` puzzles to prevent AI hallucination.
- **Review**: Send mistakes to the SRS, highlighting the previous error point and the target goal during reviews.
- **Next recommendation**: Drive the next puzzle by difficulty, tag, recent errors, and SRS expiration to build a sustainable daily training habit.

## 6. Recent Improvements (v1.1 Hardening)

- **Memory-safe rate limiting**: `MemoryRateLimiter` (50k entry cap) and guest IP counters (10k cap) now evict stale entries to prevent unbounded memory growth on serverless instances.
- **Shared body parsing**: Core JSON mutation routes (`/api/coach`, `/api/auth/device`, `/api/puzzle/attempt`, `/api/puzzle/reveal`) use `parseMutationBody()` from `lib/apiHeaders.ts` (defaults **2 KB** body unless the route overrides—coach **8 KB**, reveal **3 KB**). Other routes (e.g. Stripe checkout) use same-origin checks and route-specific JSON parsing.
- **Unicode prompt injection defense**: `promptGuard.ts` applies NFKC normalization plus common Cyrillic/Greek confusable folding before pattern matching.
- **Coach UX improvements**: Retry button on generic errors, animated thinking indicator, skeleton loading on mentor switch.
- **Stripe webhook hardening**: 1 MB payload size limit (HTTP 413) before body read.
- **GoBoard disabled state**: Board renders at 50% opacity when non-interactive.

## 7. Phase 3 First Pass Completion Status

The first pass of Phase 3 is complete: P0 content quality baseline, P1 learning loop, P2 release/growth/operations materials, and production smoke are all delivered. The production environment is verified, leaving GitHub release, public launch announcements, and subsequent real-user validation.

Immediate Next Steps:

1. **GitHub Release Approval**: Verify this documentation diff, tag names, and release notes, then push the tag and create the GitHub release.
2. **Refine Next Coach Batch**: Continue refining 20-50 high-value puzzles from `queue:content` / `plan:content-batch` to complete `solutionSequence` and `wrongBranches` and push them to the approved list.
3. **Real-User Validation**: Run small-scale validation according to [USER_INTERVIEW_SCRIPT.md](USER_INTERVIEW_SCRIPT.md) and [REVENUE_EXPERIMENTS.md](REVENUE_EXPERIMENTS.md). Direct authorization is required before contacting users, emailing, taking payments, or publishing waitlists.
4. **Production Observation**: Retain old Resend / Stripe keys for 24-48 hours to monitor stability before cleaning them up to avoid premature revocation.

External actions requiring separate approval from Frank: `git push`, creating/updating PRs, creating GitHub releases, DNS/Cloudflare changes, Supabase production changes, public launch announcements, and outgoing email/marketing campaigns.

---

For further details, please refer to [docs/en/CONCEPT.md](docs/en/CONCEPT.md).
