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
│  app/         Routes · page components (Server / Client)      │
│  components/  Reusable UI units (GoBoard · ShareCard · Nav …) │
│  lib/         Pure logic (board · judge · storage · i18n …)   │
│  content/     Data (puzzles.ts · messages/*.json)             │
│  types/       Type definitions (Puzzle · AttemptRecord · …)   │
│  scripts/     Build / authoring tools                         │
└──────────────────────────────────────────────────────────────┘
```

**Dependency direction**: `app` → `components` → `lib` → `types`/`content`. Going the other way is off-limits.

## Route map

| Route           | Server component            | Client component                   | Role                                                                                 |
| --------------- | --------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------ |
| `/`             | `app/page.tsx`              | `app/TodayClient.tsx`              | Daily puzzle — calls `getPuzzleForDate(todayLocalKey())`, hands off to `TodayClient` |
| `/puzzles`      | `app/puzzles/page.tsx`      | `app/puzzles/PuzzleListClient.tsx` | Full library with filter / sort / search                                             |
| `/puzzles/[id]` | `app/puzzles/[id]/page.tsx` | reuses `TodayClient`               | Open a specific puzzle; `generateStaticParams()` covers the full `PUZZLES` array     |
| `/result`       | `app/result/page.tsx`       | `app/result/ResultClient.tsx`      | Verdict banner, solution playback, AI coach, share card                              |
| `/review`       | `app/review/page.tsx`       | `app/review/ReviewClient.tsx`      | Mistake notebook — `attempted` status, newest first                                  |
| `/stats`        | `app/stats/page.tsx`        | `app/stats/StatsClient.tsx`        | Streak · accuracy · total · heatmap                                                  |
| `/api/coach`    | `app/api/coach/route.ts`    | —                                  | LLM proxy (POST JSON)                                                                |

**Server vs Client convention**: `page.tsx` stays minimal — "fetch puzzle · build props · hand to Client". The heavy lifting is in `*Client.tsx`. Because everything that touches `localStorage` or preferences must be client-side, the interactive pages are all client components.

## Core data flow

### Playing a puzzle (move → judge → result page)

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
 ResultClient reads URL id → PUZZLES.find → renders
       ├─ getAttemptFor(id)       // latest (verdict banner)
       └─ getAttemptsFor(id)      // full history (attempt count, tally)
```

### Daily rotation (date → index → puzzle)

`lib/puzzleOfTheDay.ts` uses a "date → index" scheme:

1. `todayLocalKey()` returns local `YYYY-MM-DD`
2. `getPuzzleForDate(date)` computes the day offset vs. `ROTATION_ANCHOR` (`2026-04-18`)
3. `offset % PUZZLES.length` gives a stable puzzle per calendar day

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

| Module                      | Path                               | One-liner                                                           |
| --------------------------- | ---------------------------------- | ------------------------------------------------------------------- |
| Full library                | `content/puzzles.ts`               | Exports `PUZZLES` · `getPuzzleById()` · `getCuratedPuzzles()`       |
| Imported corpus (generated) | `content/data/importedPuzzles.ts`  | Produced by `scripts/importTsumego.ts` — do not hand-edit           |
| Types                       | `types/index.ts`                   | `Puzzle` / `AttemptRecord` / `PuzzleStatus` / `Locale` etc.         |
| localStorage I/O            | `lib/storage.ts`                   | `loadAttempts` / `saveAttempt` / `getAttemptFor` / `getAttemptsFor` |
| Status derivation           | `lib/puzzleStatus.ts`              | Pure functions over attempts                                        |
| Judge                       | `lib/judge.ts`                     | One-line lookup into `puzzle.correct[]`                             |
| Daily rotation              | `lib/puzzleOfTheDay.ts`            | `getPuzzleForDate` + `todayLocalKey`                                |
| Random picker               | `lib/random.ts`                    | `pickRandomPuzzle(pool: "all"│"unattempted"│"wrong")`               |
| Board geometry              | `lib/board.ts`                     | `isInBounds` / `isOccupied` / `starPoints`                          |
| Localized text              | `lib/i18n.tsx`                     | `localized(text, locale)` with en→zh→ja→ko fallback                 |
| i18n context                | `lib/i18n.tsx`                     | `LocaleProvider` + `useLocale()` · persists to `go-daily.locale`    |
| Coach prompt factory        | `lib/coachPrompt.ts`               | Builds the 4-language system prompt · injects board + solution note |
| Board renderer              | `components/GoBoard.tsx`           | Canvas 2D · HiDPI · auto-crops busy 19×19 corners                   |
| Coach UI                    | `components/CoachDialogue.tsx`     | Chat · writes to `sessionStorage` keyed by puzzleId + locale        |
| Share card                  | `components/ShareCard.tsx`         | 1080×1080 PNG + Web Share                                           |
| Status badge                | `components/PuzzleStatusBadge.tsx` | Tri-state dot: solved / attempted / unattempted                     |

## Styling system

Tailwind v4, with `@theme` declared centrally in `app/globals.css`. Components access tokens via `bg-[color:var(--color-accent)]` or `bg-[color:var(--color-accent)]/10`.

Palette (Go-themed warm):

| Token                           | Value                 | Purpose                    |
| ------------------------------- | --------------------- | -------------------------- |
| `--color-board`                 | `#e8c594`             | Board wood fill            |
| `--color-board-2`               | `#d4a76a`             | Board grid lines           |
| `--color-accent`                | `#0d9488`             | Primary accent (teal)      |
| `--color-success`               | `#16a34a`             | Correct ✓                  |
| `--color-warn`                  | `#ef4444`             | Wrong ✗                    |
| `--color-ink` / `--color-ink-2` | `#1a1a1a` / `#4a4a4a` | Text (primary / secondary) |
| `--color-paper`                 | `#faf9f4`             | Page background            |
| `--color-line`                  | `#e4e2d6`             | Dividers                   |

Fonts: Inter (Latin) + Playfair Display (display serif) + system CJK fallback chain.

## Build & scripts

| Command                    | Purpose                                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| `npm run dev`              | Local dev server (Turbopack)                                                              |
| `npm run build`            | Production build. The `prebuild` hook runs `validate:puzzles` first                       |
| `npm run lint`             | ESLint (flat config · Next.js + TypeScript rules)                                         |
| `npm run import:puzzles`   | Pulls the top 100 problems from sanderland/tsumego into `content/data/importedPuzzles.ts` |
| `npm run validate:puzzles` | Hard-error check: duplicate IDs / out-of-bounds / missing locales / invalid enums         |
| `npm run format`           | Prettier formatting on all files                                                          |
| `npm run format:check`     | Prettier format check (for CI)                                                            |
| `npm run test`             | Vitest unit tests (board / judge / goRules / sgf)                                         |

**Key design**: `prebuild → validate:puzzles` is a deploy safety net. Any dirty data that would cause 404s or crashes is caught at `npm run build`, never shipped.

## Further reading

- Authoring workflow → [`puzzle-authoring.en.md`](./puzzle-authoring.en.md)
- Data schema → [`data-schema.en.md`](./data-schema.en.md)
- Path to 1k / 10k puzzles → [`extensibility.en.md`](./extensibility.en.md)
- i18n mechanics → [`i18n.en.md`](./i18n.en.md)
- Coach details → [`ai-coach.en.md`](./ai-coach.en.md)
- Local dev · contributing → [`../CONTRIBUTING.en.md`](../CONTRIBUTING.en.md)
