# Architecture Overview

> 中文版：[architecture.md](./architecture.md)

A single-page tour of how go-daily is organised: where the layer boundaries are, how data flows, and who calls whom.

## Stack at a glance

| Layer     | Choice                                                    | Notes                                                                    |
| --------- | --------------------------------------------------------- | ------------------------------------------------------------------------ |
| Framework | Next.js 16 (App Router, Turbopack)                        | All App Router; server components by default, `"use client"` is explicit |
| Language  | TypeScript strict                                         | `tsconfig.json` has strict on; `noImplicitAny` etc. follow               |
| UI        | React 19 + Tailwind v4 + Framer Motion                    | Tailwind v4's new `@theme` syntax lives in `app/globals.css`             |
| Icons     | lucide-react                                              | Shuffle / ChevronLeft / ChevronRight / Play / Check in use               |
| LLM       | DeepSeek `deepseek-chat` (OpenAI-compatible SDK)          | Proxied through `app/api/coach/route.ts`                                 |
| State     | `localStorage` (attempts) + `sessionStorage` (coach chat) | Zero backend · no accounts                                               |

## Layered layout

```
┌──────────────────────────────────────────────────────────────┐
│  proxy.ts      Request forwarding (i18n cookie → header)      │
│  app/          Routes · page components (Server / Client)      │
│  components/   Reusable UI units (GoBoard · ShareCard · Nav …) │
│  lib/          Pure logic (board · judge · storage · i18n …)   │
│  content/      Data (puzzles.ts · puzzles.server.ts ·          │
│                messages/*.json · data/*.json · games/)           │
│  types/        Type definitions (Puzzle · AttemptRecord · …)   │
│  scripts/      Build / authoring tools                         │
└──────────────────────────────────────────────────────────────┘
```

**Dependency direction**: `proxy` → `app` → `components` → `lib` → `types`/`content`. Going the other way is off-limits.

## Route map

| Route           | Server component            | Client component                   | Role                                                                                 |
| --------------- | --------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------ |
| `/`             | `app/page.tsx`              | `HeroSection` + `BoardShowcase`    | Landing page — parallax scroll + AlphaGo Game 4 demo                                 |
| `/today`        | `app/today/page.tsx`        | `app/TodayClient.tsx`              | Daily puzzle — async `getPuzzleForDate(todayLocalKey())`, hands off to `TodayClient` |
| `/puzzles`      | `app/puzzles/page.tsx`      | `app/puzzles/PuzzleListClient.tsx` | Full library — async summary fetch, filter / sort / search                           |
| `/puzzles/[id]` | `app/puzzles/[id]/page.tsx` | reuses `TodayClient`               | Open a specific puzzle; `generateStaticParams()` covers all library IDs              |
| `/result`       | `app/result/page.tsx`       | `app/result/ResultClient.tsx`      | Verdict banner, solution playback, AI coach, share card                              |
| `/review`       | `app/review/page.tsx`       | `app/review/ReviewClient.tsx`      | Mistake notebook — `attempted` status, newest first                                  |
| `/stats`        | `app/stats/page.tsx`        | `app/stats/StatsClient.tsx`        | Streak · accuracy · total · heatmap                                                  |
| `/developer`    | `app/developer/page.tsx`    | —                                  | Developer page                                                                       |
| `/api/coach`    | `app/api/coach/route.ts`    | —                                  | LLM proxy (POST JSON, zod schema validated)                                          |

**Server vs Client convention**: `page.tsx` stays minimal — "async fetch puzzle · build props · hand to Client". The heavy lifting is in `*Client.tsx`. Because everything that touches `localStorage` or preferences must be client-side, the interactive pages are all client components.

## Core data flow

### Playing a puzzle (move → judge → result page)

Entry point is `/today` (daily puzzle) or `/puzzles/[id]` (a specific puzzle):

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
       ↓                    ← lib/storage.ts, append to localStorage
 router.push(`/result?id=${puzzle.id}`)
       ↓
 ResultClient reads URL id → getPuzzle(id) → renders
       ├─ getAttemptFor(id)       // latest (verdict banner)
       └─ getAttemptsFor(id)      // full history (attempt count, tally)
```

> `getPuzzle(id)` is an async function exported from `content/puzzles.ts`: on the server it reads full data via `puzzles.server.ts`; on the client it queries the lightweight `puzzleIndex.json`.

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

Key contract: `lib/puzzleStatus.ts` **never imports `window`**. Every function is a pure `AttemptRecord[] → X`. That makes it SSR-safe, unit-testable, and reusable inside server components (not that we do so today).

## Module map

| Module                      | Path                                | One-liner                                                                         |
| --------------------------- | ----------------------------------- | --------------------------------------------------------------------------------- |
| Data entry (env-aware)      | `content/puzzles.ts`                | `getPuzzle()` / `getAllSummaries()` — server reads full, client reads index       |
| Server full data            | `content/puzzles.server.ts`         | Loads full `Puzzle[]` from `data/*.json`; server-only                             |
| Client light index          | `content/data/puzzleIndex.json`     | `PuzzleSummary[]` for list / review pages                                         |
| Imported corpus (generated) | `content/data/importedPuzzles.json` | Produced by `scripts/importTsumego.ts` — do not hand-edit                         |
| Full library (generated)    | `content/data/puzzleLibrary.json`   | Aggregated complete puzzle library JSON                                           |
| Curated puzzles             | `content/curatedPuzzles.ts`         | Hand-written curated puzzles, aggregated by `puzzles.server.ts`                   |
| Game record data            | `content/games/leeAlphagoG4.ts`     | Lee Sedol vs AlphaGo Game 4 SGF + metadata ("divine move")                        |
| Types                       | `types/index.ts`                    | `Puzzle` / `AttemptRecord` / `PuzzleStatus` / `Locale` etc.                       |
| zod schema                  | `types/schemas.ts`                  | Runtime validation schemas shared by API + validatePuzzles                        |
| Rate limiter                | `lib/rateLimit.ts`                  | `RateLimiter` interface + `MemoryRateLimiter` implementation                      |
| Site URL                    | `lib/siteUrl.ts`                    | Reads `NEXT_PUBLIC_SITE_URL` for canonical / sitemap / robots                     |
| localStorage I/O            | `lib/storage.ts`                    | `loadAttempts` / `saveAttempt` / `getAttemptFor` / `getAttemptsFor`               |
| Status derivation           | `lib/puzzleStatus.ts`               | Pure functions over attempts                                                      |
| Judge                       | `lib/judge.ts`                      | One-line lookup into `puzzle.correct[]`                                           |
| Daily rotation              | `lib/puzzleOfTheDay.ts`             | `getPuzzleForDate` + `todayLocalKey`                                              |
| Random picker               | `lib/random.ts`                     | `pickRandomPuzzle(pool: "all"│"unattempted"│"wrong")`                             |
| Board geometry              | `lib/board.ts`                      | `isInBounds` / `isOccupied` / `starPoints`                                        |
| Go rules engine             | `lib/goRules.ts`                    | `playMove`: place, capture (single/group), self-capture check                     |
| SGF parser                  | `lib/sgf.ts`                        | `parseSgfMoves`: SGF string → coordinate sequence                                 |
| Snapshot builder            | `lib/gameSnapshots.ts`              | `buildSnapshots`: generate per-move board snapshots from SGF                      |
| Localized text              | `lib/i18n.tsx`                      | `localized(text, locale)` with en→zh→ja→ko fallback                               |
| i18n context                | `lib/i18n.tsx`                      | `LocaleProvider` + `useLocale()` · persists to `go-daily.locale`                  |
| i18n proxy                  | `proxy.ts`                          | cookie `go-daily.locale` → `x-locale` header, eliminates SSR flash                |
| Coach prompt factory        | `lib/coachPrompt.ts`                | Builds the 4-language system prompt · injects board + solution note               |
| Board renderer              | `components/GoBoard.tsx`            | Canvas 2D · HiDPI · auto-crop · dark/classic dual theme                           |
| Landing Hero                | `components/HeroSection.tsx`        | Parallax scroll · locale-aware typography · background image                      |
| Board showcase              | `components/BoardShowcase.tsx`      | Scroll-driven animation · AlphaGo Game 4 "divine move" demo                       |
| Demo board                  | `components/DemoGameBoard.tsx`      | Historical game move-by-move replay · phase transitions                           |
| Custom cursor               | `components/GlobalCursor.tsx`       | Global custom mouse cursor (neon cyan glow)                                       |
| Coach UI                    | `components/CoachDialogue.tsx`      | Chat · writes to `sessionStorage` keyed by `go-daily.coach.${puzzleId}.${locale}` |
| Share card                  | `components/ShareCard.tsx`          | 1080×1080 PNG + Web Share                                                         |
| Status badge                | `components/PuzzleStatusBadge.tsx`  | Tri-state dot: solved / attempted / unattempted                                   |

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

Fonts: Inter (Latin) + Playfair Display (display serif) + Zhi Mang Xing (Chinese calligraphy) + Klee One (Japanese) + Gowun Batang (Korean) + system CJK fallback chain.

## Build & scripts

| Command                    | Purpose                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `npm run dev`              | Local dev server (Turbopack)                                                                                  |
| `npm run build`            | Production build. The `prebuild` hook runs `validate:puzzles` first                                           |
| `npm run lint`             | ESLint (flat config · Next.js + TypeScript rules)                                                             |
| `npm run import:puzzles`   | Pulls the top 100 problems from sanderland/tsumego into `content/data/importedPuzzles.json`                   |
| `npm run validate:puzzles` | Hard-error check: duplicate IDs / out-of-bounds / missing locales / invalid enums (zod schema + custom rules) |
| `npm run format`           | Prettier formatting on all files                                                                              |
| `npm run format:check`     | Prettier format check (for CI)                                                                                |
| `npm run test`             | Vitest unit tests (board / judge / goRules / sgf / puzzleOfTheDay / storage + API + components)               |

**Key design**: `prebuild → validate:puzzles` is a deploy safety net. Any dirty data that would cause 404s or crashes is caught at `npm run build`, never shipped. The validator now uses zod schema as its first type-check layer, then custom semantic rules on top.

## Further reading

- Authoring workflow → [`puzzle-authoring.en.md`](./puzzle-authoring.en.md)
- Data schema → [`data-schema.en.md`](./data-schema.en.md)
- Path to 1k / 10k puzzles → [`extensibility.en.md`](./extensibility.en.md)
- i18n mechanics → [`i18n.en.md`](./i18n.en.md)
- Coach details → [`ai-coach.en.md`](./ai-coach.en.md)
- Local dev · contributing → [`../CONTRIBUTING.en.md`](../CONTRIBUTING.en.md)
