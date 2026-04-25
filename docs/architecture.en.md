# Architecture Overview

> Chinese version: [architecture.md](./architecture.md)

A single-page tour of how go-daily is organised: where the layer boundaries are, how data flows, and who calls whom.

## Stack at a glance

| Layer      | Choice                                                            | Notes                                                                    |
| ---------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Framework  | Next.js 16 (App Router, Turbopack)                                | All App Router; server components by default, `"use client"` is explicit |
| Language   | TypeScript strict                                                 | `tsconfig.json` has strict on; `noImplicitAny` etc. follow               |
| UI         | React 19 + Tailwind v4 + Framer Motion                            | Tailwind v4's new `@theme` syntax lives in `app/globals.css`             |
| Icons      | lucide-react                                                      | Shuffle / ChevronLeft / ChevronRight / Play / Check in use               |
| LLM        | DeepSeek `deepseek-chat` (OpenAI-compatible SDK)                  | Proxied through `app/api/coach/route.ts`                                 |
| Auth       | Supabase Auth (OAuth + magic link)                                | `lib/supabase/` client/server/middleware/service layers                  |
| DB         | Supabase Postgres + RLS                                           | profiles / attempts / subscriptions / user_devices / srs_cards           |
| Storage    | localStorage (anonymous) + IndexedDB queue + Supabase (logged-in) | `lib/syncStorage.ts` unifies three runtime states                        |
| Analytics  | PostHog                                                           | `lib/posthog/` client init + typed event wrappers                        |
| Monitoring | Sentry + Vercel Analytics + Speed Insights                        | `sentry.*.config.ts` + `instrumentation.ts`                              |
| Emails     | Resend                                                            | `lib/email.ts` HTTP API (Welcome, daily cron, payment failed notices)    |

## Layered layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  proxy.ts       Next.js middleware: locale negotiation + 308 redirect│
│                  + Supabase session refresh                            │
│  app/           Routes · page components (Server / Client)             │
│  components/    Reusable UI units (GoBoard · ShareCard · Nav ·         │
│                 LocalizedLink …)                                       │
│  lib/           Pure logic (board · judge · storage · i18n ·           │
│                 syncStorage · localePath · deviceRegistry ·            │
│                 mergeOnLogin …)                                        │
│  content/       Data (puzzles.ts · puzzles.server.ts ·                 │
│                 messages/*.json · data/*.json · games/)                │
│  types/         Type definitions (Puzzle · AttemptRecord · …)          │
│  scripts/       Build / authoring tools (validatePuzzles ·             │
│                 importTsumego · auditPuzzles · queueContent ·          │
│                 supabaseHealthcheck)                                   │
│  supabase/      Database migrations (migrations/*.sql)                 │
└──────────────────────────────────────────────────────────────────────┘
```

**Dependency direction**: `proxy` → `app` → `components` → `lib` → `types`/`content`. Going the other way is off-limits.

## Route map

All user-facing pages live under `/{locale}/...`. The root `/` is redirected by middleware to the negotiated locale (e.g. `/en`).

| Route                    | Role                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------- |
| `/{locale}/`             | Landing page — parallax scroll + AlphaGo Game 4 demo                                |
| `/{locale}/today`        | Daily puzzle — async fetch for today, hands off to `TodayClient`                    |
| `/{locale}/puzzles`      | Full library — async summary fetch, filter / sort / search                          |
| `/{locale}/puzzles/[id]` | Open a specific puzzle; curated SSG, rest ISR (24h)                                 |
| `/{locale}/result`       | Verdict banner, solution playback, AI coach, share card                             |
| `/{locale}/review`       | Review queue — Pro server-side SRS due cards; Free latest 20 mistakes + upgrade CTA |
| `/{locale}/stats`        | Streak · accuracy · total · heatmap                                                 |
| `/{locale}/about`        | About page (formerly developer page)                                                |
| `/api/coach`             | LLM proxy (POST JSON, zod schema validated)                                         |
| `/api/report-error`      | Client error reporting endpoint (buffered + retried); logs and forwards to Sentry   |
| `/api/stripe/checkout`   | Stripe Checkout Session creation (server-side redirect)                             |
| `/api/stripe/portal`     | Stripe Customer Portal Session creation                                             |
| `/api/stripe/webhook`    | Stripe Webhook receiver (signature verification + idempotency)                      |
| `/auth/callback`         | OAuth / magic link callback: exchange code for session                              |
| `/manifest.webmanifest`  | Dynamic localised PWA manifest (negotiated locale)                                  |

**Server vs Client convention**: `page.tsx` stays minimal — "async fetch puzzle · build props · hand to Client". The heavy lifting is in `*Client.tsx`. Because everything that touches `localStorage` or browser APIs must be client-side, the interactive pages are all client components.

## Core data flow

### Playing a puzzle (move → judge → result page)

Entry point is `/{locale}/today` (daily puzzle) or `/{locale}/puzzles/[id]` (a specific puzzle):

```
 User clicks board (GoBoard onPlay)
       ↓
 TodayClient.setPending(coord)
       ↓
 User clicks "Confirm" → TodayClient.submit()
       ↓
 judgeMove(puzzle, move)   ← lib/judge.ts, checks puzzle.correct[]
       ↓
 saveAttempt({ puzzleId, date, userMove, correct, solvedAtMs })
       ↓                    ← lib/storage.ts (anonymous) or lib/syncStorage.ts (logged-in)
 router.push(`/{locale}/result?id=${puzzle.id}`)
       ↓
 ResultClient reads URL id → getPuzzle(id) → renders
       ├─ getAttemptFor(id)       // latest (verdict banner)
       └─ getAttemptsFor(id)      // full history (attempt count, tally)
```

### Logged-in user sync flow

```
 User logs in (OAuth callback)
       ↓
 registerDevice(userId)     ← lib/deviceRegistry.ts
       ↓
 Check device access (free users limited to 1 device)
       ↓
 planMerge(local, remote)   ← lib/mergeOnLogin.ts
       ↓
 If conflict → UI prompts user (merge / keep-local / keep-remote)
       ↓
 applyMergeDecision() → sync()  ← lib/syncStorage.ts
       ↓
 Dual-write (IndexedDB queue + exponential backoff retry)
```

### Daily rotation (date → index → puzzle)

`lib/puzzleOfTheDay.ts` uses a "date → index" scheme:

1. `todayLocalKey()` returns local `YYYY-MM-DD`
2. `getPuzzleForDate(date)` computes the day offset vs. `ROTATION_ANCHOR` (`2026-04-18`)
3. `offset % libraryLength` gives a stable puzzle per calendar day

**We no longer match on `puzzle.date`** — imported puzzles share a placeholder date, so it shouldn't drive the schedule. Pure modular arithmetic; wraps automatically once we exhaust the library.

### Reading history (`/stats` and `/review`)

Every page shares the same pipeline:

```
loadAttempts()                    // lib/storage.ts
     ↓
AttemptRecord[]  (append-only timeline)
     ↓
Derived views (per-component useMemo):
  - getStatusFor(id, list)        → solved / attempted / unattempted
  - getHistoryFor(id, list)       → { history, total, correct, wrong }
  - computeStatusTallies(ids, list)
  - lastAttemptMsMap(list)
  - computeStreak / computeAccuracy
```

Key contract: `lib/puzzleStatus.ts` **never imports `window`**. Every function is a pure `AttemptRecord[] → X`. That makes it SSR-safe and unit-testable.

## Module map

| Module                      | Path                                 | One-liner                                                                                            |
| --------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Data entry (env-aware)      | `content/puzzles.ts`                 | `getPuzzle()` / `getAllSummaries()` — server reads full, client reads index                          |
| Server full data            | `content/puzzles.server.ts`          | Loads full `Puzzle[]` from `data/*.json`; server-only                                                |
| Client light index          | `content/data/puzzleIndex.json`      | `PuzzleSummary[]` for list / review pages                                                            |
| Imported corpus (generated) | `content/data/classicalPuzzles.json` | Produced by `scripts/generateKatagoPuzzles.ts` — do not hand-edit                                    |
| Full library (generated)    | `content/data/classicalPuzzles.json` | Aggregated complete puzzle library JSON                                                              |
| Curated puzzles             | `content/curatedPuzzles.ts`          | Hand-written curated puzzles, aggregated by `puzzles.server.ts`                                      |
| Game record data            | `content/games/leeAlphagoG4.ts`      | Lee Sedol vs AlphaGo Game 4 SGF + metadata ("divine move")                                           |
| Types                       | `types/index.ts`                     | `Puzzle` / `AttemptRecord` / `PuzzleStatus` / `Locale` etc.                                          |
| zod schema                  | `types/schemas.ts`                   | Runtime validation schemas shared by API + validatePuzzles                                           |
| Rate limiter                | `lib/rateLimit.ts`                   | `RateLimiter` interface + `MemoryRateLimiter` / `UpstashRateLimiter` auto-switch                     |
| Site URL                    | `lib/siteUrl.ts`                     | Reads `NEXT_PUBLIC_SITE_URL` for canonical / sitemap / robots                                        |
| localStorage I/O            | `lib/storage.ts`                     | `loadAttempts` / `saveAttempt` / `getAttemptFor` / `getAttemptsFor`                                  |
| Sync storage                | `lib/syncStorage.ts`                 | Anonymous passthrough / logged-in dual-write (localStorage + IndexedDB → Supabase)                   |
| Login merge                 | `lib/mergeOnLogin.ts`                | Pure functions: local vs remote diff analysis, decision matrix, merge apply                          |
| Device identity             | `lib/deviceId.ts`                    | per-browser UUID + UA parsing into friendly label                                                    |
| Device registry             | `lib/deviceRegistry.ts`              | Free-plan single-device limit evaluation + `user_devices` I/O                                        |
| Attempt dedup key           | `lib/attemptKey.ts`                  | `${puzzleId}-${solvedAtMs}` canonical dedup key                                                      |
| Client IP                   | `lib/clientIp.ts`                    | Extract real IP from CF-Connecting-IP / X-Forwarded-For / X-Real-IP                                  |
| i18n URL helpers            | `lib/localePath.ts`                  | `localePath()` / `stripLocalePrefix()` / `negotiateLocaleFromHeader()`                               |
| Server translation helper   | `lib/metadata.ts`                    | `getMessages(locale)` — for server components / `generateMetadata`                                   |
| i18n context                | `lib/i18n.tsx`                       | `LocaleProvider` (receives `initialLocale`) + `useLocale()`                                          |
| Localized link              | `components/LocalizedLink.tsx`       | `next/link` wrapper that auto-prefixes href with current locale                                      |
| Locale middleware           | `proxy.ts`                           | URL locale detection → negotiation → 308 redirect + `x-locale` header + Supabase refresh             |
| Supabase client             | `lib/supabase/client.ts`             | Browser-side Supabase client (RLS-protected)                                                         |
| Supabase server             | `lib/supabase/server.ts`             | For Server Components / Route Handlers (cookie read/write)                                           |
| Supabase middleware         | `lib/supabase/middleware.ts`         | `refreshSupabaseSession()` — refresh token in middleware                                             |
| Supabase service            | `lib/supabase/service.ts`            | Service-role client (bypasses RLS, server-only)                                                      |
| PostHog client              | `lib/posthog/client.ts`              | `initPostHog()` + `posthog` instance                                                                 |
| PostHog events              | `lib/posthog/eventTypes.ts`          | Shared typed event map for client and server tracking                                                |
| PostHog server capture      | `lib/posthog/server.ts`              | Sends Stripe webhook subscription events; no-ops when the PostHog key is absent                      |
| Status derivation           | `lib/puzzleStatus.ts`                | Pure functions over attempts                                                                         |
| Judge                       | `lib/judge.ts`                       | One-line lookup into `puzzle.correct[]`                                                              |
| Daily rotation              | `lib/puzzleOfTheDay.ts`              | `getPuzzleForDate` + `todayLocalKey`                                                                 |
| Random picker               | `lib/random.ts`                      | `pickRandomPuzzle(pool: "all"│"unattempted"│"wrong")`                                                |
| Board geometry              | `lib/board.ts`                       | `isInBounds` / `isOccupied` / `starPoints`                                                           |
| Go rules engine             | `lib/goRules.ts`                     | `playMove`: place, capture (single/group), self-capture check                                        |
| SGF parser                  | `lib/sgf.ts`                         | `parseSgfMoves`: SGF string → coordinate sequence                                                    |
| Snapshot builder            | `lib/gameSnapshots.ts`               | `buildSnapshots`: generate per-move board snapshots from SGF                                         |
| Localized text              | `lib/i18n.tsx`                       | `localized(text, locale)` with en→zh→ja→ko fallback                                                  |
| Coach prompt factory        | `lib/coachPrompt.ts`                 | Builds the 4-language system prompt · injects board + solution note                                  |
| Coach quota windows         | `lib/coachQuota.ts`                  | Free natural-month / Pro billing-anchor-month window math (31-day short-month rollback)              |
| Coach runtime assembly      | `lib/coachState.ts`                  | `getCoachState()`: timezone + usage aggregation + device limit + entitlements                        |
| Coach provider abstraction  | `lib/coachProvider.ts`               | `CoachProvider` interface + `ManagedOpenAICompatibleCoachProvider` (BYOK extension seam)             |
| Entitlements                | `lib/entitlements.ts`                | `ViewerPlan` / `Entitlements` / `getEntitlements()` (guest/free/pro single source of truth)          |
| SRS scheduling              | `lib/srs.ts`                         | SM-2 ease / interval / due_date calculation                                                          |
| SRS server queue repair     | `lib/reviewSrs.ts`                   | `/review` rebuilds missing `srs_cards` from attempts and reads due cards                             |
| Device registry             | `lib/deviceRegistry.ts`              | `evaluateDeviceAccess()` / `registerDevice()`: free single-device enforcement and gating             |
| Login merge                 | `lib/mergeOnLogin.ts`                | `planMerge()` / `applyMergeDecision()`: local vs remote attempts merge + user decision               |
| Board renderer              | `components/GoBoard.tsx`             | Canvas 2D · HiDPI · auto-crop · dark/classic dual theme                                              |
| Landing Hero                | `components/HeroSection.tsx`         | Parallax scroll · locale-aware typography · background image                                         |
| Board showcase              | `components/BoardShowcase.tsx`       | Scroll-driven animation · AlphaGo Game 4 "divine move" demo                                          |
| Demo board                  | `components/DemoGameBoard.tsx`       | Historical game move-by-move replay · phase transitions                                              |
| Custom cursor               | `components/GlobalCursor.tsx`        | Global custom mouse cursor (neon cyan glow)                                                          |
| Coach UI                    | `components/CoachDialogue.tsx`       | Chat · writes to `sessionStorage` keyed by `go-daily.coach.${puzzleId}.${locale}`                    |
| Auth prompt card            | `components/AuthPromptCard.tsx`      | Shared by `/login` and the homepage reminder; email UI gated by `NEXT_PUBLIC_ENABLE_EMAIL_LOGIN`     |
| Homepage login reminder     | `components/HomeLoginReminder.tsx`   | Anon + homepage + first-time: 3s smooth reveal; Esc / backdrop / close; prefers-reduced-motion aware |
| Share card                  | `components/ShareCard.tsx`           | 1080×1080 PNG + Web Share                                                                            |
| Dynamic share image         | `app/opengraph-image.tsx`            | Next `ImageResponse` generated 1200×630 OG / Twitter image                                           |
| Status badge                | `components/PuzzleStatusBadge.tsx`   | Tri-state dot: solved / attempted / unattempted                                                      |

## Styling system

Tailwind v4, with `@theme` declared centrally in `app/globals.css`. Components access tokens via `bg-[color:var(--color-accent)]` or `bg-[color:var(--color-accent)]/10`.

Palette (dark Go theme):

| Token             | Value                       | Purpose                      |
| ----------------- | --------------------------- | ---------------------------- |
| `--color-board`   | `#1f1611`                   | Board dark wood fill         |
| `--color-board-2` | `rgba(0, 242, 255, 0.28)`   | Board grid lines (neon cyan) |
| `--color-stone-b` | `#0a0a0a`                   | Black stones                 |
| `--color-stone-w` | `#eeeae0`                   | White stones (warm white)    |
| `--color-accent`  | `#00f2ff`                   | Primary accent (neon cyan)   |
| `--color-success` | `#22c55e`                   | Correct ✓                    |
| `--color-warn`    | `#ff3366`                   | Wrong ✗ (neon red)           |
| `--color-ink`     | `#edeae2`                   | Primary text                 |
| `--color-ink-2`   | `rgba(237, 234, 226, 0.55)` | Secondary text               |
| `--color-paper`   | `#0a0a0a`                   | Page background (near-black) |
| `--color-line`    | `rgba(255, 255, 255, 0.08)` | Dividers                     |
| `--color-linen`   | `#e3dccb`                   | Warm light text              |
| `--color-earth`   | `#4a3728`                   | Warm brown                   |

GoBoard supports a `boardStyle` prop (`"dark"` / `"classic"`):

- `dark`: dark wood board + neon cyan grid lines (Landing page, daily puzzle default)
- `classic`: traditional wood-coloured board (library page retains original look)

Fonts: Inter (Latin) + Playfair Display (display serif) + Zhi Mang Xing (Chinese calligraphy) + Yuji Syuku (Japanese brush/calligraphy) + Gowun Batang (Korean) + system CJK fallback chain.

## Build & scripts

| Command                     | Purpose                                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `npm run dev`               | Local dev server (Turbopack)                                                                                  |
| `npm run build`             | Production build. The `prebuild` hook runs `validate:puzzles` first                                           |
| `npm run lint`              | ESLint (flat config · Next.js + TypeScript rules)                                                             |
| `npm run import:puzzles`    | Pulls the top 100 problems from public domain sources into `content/data/classicalPuzzles.json`               |
| `npm run sync:puzzle-index` | Regenerate `content/data/puzzleIndex.json` from canonical `PUZZLES`                                           |
| `npm run validate:puzzles`  | Hard-error check: duplicate IDs / out-of-bounds / missing locales / invalid enums (zod schema + custom rules) |
| `npm run audit:puzzles`     | Content QA report: curated runway, coach readiness, index consistency                                         |
| `npm run queue:content`     | Build ranked coach-ready / curated-runway candidate queues                                                    |
| `npm run supabase:health`   | Supabase connection health check                                                                              |
| `npm run format`            | Prettier formatting on all files                                                                              |
| `npm run format:check`      | Prettier format check (for CI)                                                                                |
| `npm run test`              | Vitest unit tests (544 tests / 68 files)                                                                      |

**Key design**: `prebuild → validate:puzzles` is a deploy safety net. Any dirty data that would cause 404s or crashes is caught at `npm run build`, never shipped.

**Build strategy**:

- Curated puzzle detail pages (`/{locale}/puzzles/[id]`) are SSG at build time
- All other puzzle detail pages use ISR with `revalidate = 86400` (24h)
- Static page count reduced from ~4,900 to ~300 for faster builds

## Further reading

- Authoring workflow → [`puzzle-authoring.en.md`](./puzzle-authoring.en.md)
- Data schema → [`data-schema.en.md`](./data-schema.en.md)
- Path to 1k / 10k puzzles → [`extensibility.en.md`](./extensibility.en.md)
- i18n mechanics → [`i18n.en.md`](./i18n.en.md)
- Coach details → [`ai-coach.en.md`](./ai-coach.en.md)
- Local dev · contributing → [`../CONTRIBUTING.en.md`](../CONTRIBUTING.en.md)
