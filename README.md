# go-daily

> One Go puzzle a day — with a Socratic AI coach in **中 / EN / 日 / 한**.

[中文 →](README.zh.md) | [日本語 →](README.ja.md) | [한국어 →](README.ko.md)

![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript)
![Tailwind](https://img.shields.io/badge/Tailwind-v4-06b6d4?logo=tailwindcss)
![DeepSeek](https://img.shields.io/badge/DeepSeek-chat-4c6ef5)
![Supabase](https://img.shields.io/badge/Supabase-auth%2Bdb-3ecf8e?logo=supabase)

A small project by [Frank](https://github.com/frank99-owl): every day serves up one Go (围棋 / 囲碁 / 바둑) problem, you tap the vital point, and if you're stuck, the AI walks you through the shape like a Socratic tutor — it asks questions, doesn't just dump answers.

### Planning & agent context

- **[`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md)** — single entry for **current phase**, completion status, and pitfalls (read this first for large changes).
- **[`docs/phase2-next-steps.md`](docs/phase2-next-steps.md)** — execution and acceptance criteria for Stripe, entitlements, and the paywall.
- **[`AGENTS.md`](AGENTS.md)** — short pointer for AI coding agents.

## What's live

- **Daily puzzle** — one problem per calendar day, rotating through a local library
- **Canvas Go board** — responsive 9x9 / 13x13 / 19x19 rendering, hover ghost stone, HiDPI crisp
- **4-language UI** — Chinese / English / Japanese / Korean via URL-based routing (`/zh/...`, `/en/...`); default locale is English
- **Socratic, on-demand coach** — the coach only speaks when you ask; grounded on a ground-truth solution note so it doesn't hallucinate
- **Library + review** — 1,110+ puzzles across 5 difficulty levels with a browseable library and dedicated review mode for mistakes
- **Streak + history** — consecutive-day correct streak, accuracy %, per-puzzle record (localStorage when anonymous, Supabase when logged in)
- **Share card** — 1080x1080 PNG of today's board + result, one-tap download or Web Share
- **Auth + cross-device sync** — Supabase OAuth (Google, etc.) with automatic attempt history sync
- **Paywall & Subscriptions** — Stripe Checkout/Portal integration, free-tier device & quota limits, and Pro entitlements are fully wired
- **Spaced Repetition (SRS)** — Pro users get SM-2 spaced repetition for their mistakes in the review mode
- **Emails** — Transactional (welcome, payment failed) and daily cron emails powered by Resend

## Tech

|            |                                                                   |
| ---------- | ----------------------------------------------------------------- |
| Framework  | Next.js 16 (App Router, Turbopack) + React 19                     |
| Language   | TypeScript strict                                                 |
| Styling    | Tailwind CSS v4 (`@theme`)                                        |
| Motion     | Framer Motion 12                                                  |
| Icons      | lucide-react                                                      |
| LLM        | DeepSeek `deepseek-chat` via the OpenAI-compatible SDK            |
| Board      | Canvas 2D, ~200 lines, no Go library                              |
| Auth + DB  | Supabase (Auth + Postgres + RLS)                                  |
| Analytics  | PostHog (product analytics)                                       |
| Monitoring | Sentry (error tracking) + Vercel Analytics + Speed Insights       |
| Emails     | Resend (transactional & cron)                                     |
| Storage    | localStorage (anonymous) / Supabase (logged-in) + IndexedDB queue |

## Project layout

```
app/
  [locale]/               # URL-based i18n: /zh/, /en/, /ja/, /ko/
    today/                # daily puzzle
    puzzles/              # library list + [id] detail
    result/               # judgment, solution reveal, coach, share card
    review/               # wrong-answer review
    stats/                # streak / accuracy / history
    about/                # about page (formerly developer page)
  api/
    coach/route.ts        # LLM proxy (8KB cap, 10 req/min/IP)
    report-error/route.ts # client error reporting endpoint
  auth/callback/route.ts  # OAuth callback handler
  manifest.ts             # dynamic localized PWA manifest
  layout.tsx              # root layout (PostHogProvider, html lang)
components/
  GoBoard                 # canvas board + click-to-play + hover ghost
  CoachDialogue           # on-demand chat
  ShareCard               # off-screen canvas -> PNG / Web Share
  LocalizedLink           # locale-aware next/link wrapper
  Nav / LanguageToggle / PuzzleHeader
lib/
  localePath.ts           # locale negotiation, URL prefix/strip helpers
  metadata.ts             # server-side translation helper for generateMetadata
  supabase/               # client.ts / server.ts / middleware.ts / service.ts
  posthog/                # client.ts / events.ts
  syncStorage.ts          # localStorage + IndexedDB queue + Supabase sync
  mergeOnLogin.ts         # anon -> authed data merge planning
  deviceId.ts             # per-browser UUID + UA description
  deviceRegistry.ts       # free-plan single-device paywall
  attemptKey.ts           # canonical dedup key for attempts
  clientIp.ts             # IP extraction (CF-Connecting-IP, X-Forwarded-For)
  board / judge / storage / puzzleOfTheDay / i18n / coachPrompt / rateLimit
content/
  puzzles.ts              # environment-aware entry: server reads full data, client reads light index
  puzzles.server.ts       # server-side full data loader
  data/
    puzzleIndex.json      # light client-side index (summaries only)
    classicalPuzzles.json  # public domain collections (auto-generated)
    classicalPuzzles.json    # full puzzle library (auto-generated)
  messages/{zh,en,ja,ko}.json
  curatedPuzzles.ts       # hand-written curated puzzles
types/
  index.ts                # Puzzle / AttemptRecord / CoachMessage / Locale
  schemas.ts              # zod runtime schemas (shared by API + validator)
supabase/
  migrations/*.sql     # DB schema: profiles, attempts, subscriptions, stripe_events, user_devices
```

## Local development

```bash
cp .env.example .env.local
# Open .env.local and fill in the required keys (see Environment Variables below)

npm install
npm run dev
```

Open `http://localhost:3000`. The middleware will redirect `/` to your negotiated locale (e.g. `/en`).

## Environment variables

| Name                            | Required | Default                    | Where                                                        |
| ------------------------------- | -------- | -------------------------- | ------------------------------------------------------------ |
| `DEEPSEEK_API_KEY`              | yes      | —                          | `.env.local` locally / Vercel Project Settings in production |
| `NEXT_PUBLIC_SITE_URL`          | no       | `https://go-daily.app`     | Canonical URLs, sitemap, and robots                          |
| `NEXT_PUBLIC_SUPABASE_URL`      | yes\*    | —                          | Supabase project URL (auth + database)                       |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes\*    | —                          | Supabase publishable key (safe in browser with RLS)          |
| `SUPABASE_SERVICE_ROLE_KEY`     | yes\*    | —                          | Supabase secret key (server-only, bypasses RLS)              |
| `NEXT_PUBLIC_POSTHOG_KEY`       | no       | —                          | PostHog project API key (write-only, safe in browser)        |
| `NEXT_PUBLIC_POSTHOG_HOST`      | no       | `https://us.i.posthog.com` | PostHog ingest host                                          |
| `NEXT_PUBLIC_SENTRY_DSN`        | no       | —                          | Sentry DSN (write-only error ingest)                         |
| `RATE_LIMIT_WINDOW_MS`          | no       | `60000` (60s)              | Rate-limit time window in milliseconds                       |
| `RATE_LIMIT_MAX`                | no       | `10`                       | Max requests per window per IP                               |
| `UPSTASH_REDIS_REST_URL`        | no       | —                          | Upstash Redis URL (persistent rate limiting)                 |
| `UPSTASH_REDIS_REST_TOKEN`      | no       | —                          | Upstash Redis token                                          |
| `COACH_MODEL`                   | no       | `deepseek-chat`            | AI coach model identifier (OpenAI-compatible)                |
| `STRIPE_SECRET_KEY`             | no       | —                          | Stripe server-side secret key (Phase 2)                      |
| `STRIPE_WEBHOOK_SECRET`         | no       | —                          | Stripe webhook signing secret (Phase 2)                      |
| `STRIPE_PRO_MONTHLY_PRICE_ID`   | no       | —                          | Stripe Pro monthly Price ID (Phase 2)                        |
| `STRIPE_PRO_YEARLY_PRICE_ID`    | no       | —                          | Stripe Pro yearly Price ID (Phase 2)                         |
| `STRIPE_TRIAL_DAYS`             | no       | `7`                        | Stripe trial length in days (Phase 2)                        |

\*Supabase vars are required for auth and cloud sync. The app works without them in anonymous-only mode.

`.env*` is gitignored by default; `.env.example` is the only env file that gets committed.

### Production deployment notes

- **Rate limiting** uses `MemoryRateLimiter` by default. When `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are configured, it automatically switches to `UpstashRateLimiter`.
- **Model name** is controlled by the optional `COACH_MODEL` env variable (defaults to `deepseek-chat`).
- **Analytics / Speed Insights** are wired in via `@vercel/analytics` and `@vercel/speed-insights` (zero-config on Vercel).
- **PostHog** and **Sentry** are now configured. Set the corresponding env vars to enable.
- **CSP headers** are configured in `next.config.ts` for production security, including Stripe domains for Phase 2.

## Adding new puzzles

Curated puzzles are hand-written in `content/curatedPuzzles.ts`. Each entry needs:

- `stones[]` — the starting position (coords 0-indexed from the top-left)
- `correct[]` — one or more accepted solution points
- `prompt` and `solutionNote` in **all four locales**

For bulk imports, place SGF files in `scripts/sgf/` and run `npm run import:puzzles`. This outputs to `content/data/classicalPuzzles.json`.

The data entry layer (`content/puzzles.ts`) aggregates curated and imported sources. On the server, full puzzle data is loaded via `content/puzzles.server.ts`; on the client, only a lightweight index (`content/data/puzzleIndex.json`) is fetched.

The coach receives `solutionNote[locale]` as ground truth, so write it carefully — the model is instructed not to invent new tactics beyond what's in the note.

## Testing

```bash
npm run test          # 544 tests across 68 files (Vitest)
npm run test:watch    # watch mode
```

## Deploy

Production domain: **go-daily.app** (Cloudflare DNS -> Vercel).

Import the GitHub repo into Vercel, set the required environment variables, and every push to `main` ships.

**Build strategy**:

- Curated puzzle detail pages (`/puzzles/[id]`) are SSG at build time
- All other puzzle detail pages use ISR with 24h revalidation
- Static page count reduced from ~4,900 to ~300 for faster builds

## Known limitations

- **LLM is a coach, not a judge.** DeepSeek reads the provided solution note and paraphrases it — it can hallucinate variations the note doesn't cover.
- **No capture / ko logic.** The board doesn't simulate captures; puzzles are chosen so the solution is a single vital point.
- **One timezone, one puzzle.** The daily switch is local-midnight, so crossing timezones may show you the same puzzle or skip ahead.

---

(C) 2026 Frank.
