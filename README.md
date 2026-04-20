# go-daily

> One Go puzzle a day — with a Socratic AI coach in **中 / EN / 日 / 한**.

![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript)
![Tailwind](https://img.shields.io/badge/Tailwind-v4-06b6d4?logo=tailwindcss)
![DeepSeek](https://img.shields.io/badge/DeepSeek-chat-4c6ef5)

A small vibe-coding project by [Frank](https://github.com/frank99-owl): every day serves up one Go (围棋 / 囲碁 / 바둑) problem, you tap the vital point, and if you're stuck, the AI walks you through the shape like a Socratic tutor — it asks questions, doesn't just dump answers.

The whole thing is zero-backend: no accounts, no database, your streak lives in `localStorage`.

## What's in v1

- **Daily puzzle** — one problem per calendar day, rotating through a local library
- **Canvas Go board** — responsive 9×9 / 13×13 / 19×19 rendering, hover ghost stone, HiDPI crisp
- **4-language AI coach** — 中文 / English / 日本語 / 한국어, switches the whole UI + coach reply language in one click
- **Socratic, on-demand coach** — the coach only speaks when you ask; it's grounded on a ground-truth solution note so it doesn't hallucinate
- **Library + review** — 1210 puzzles across 5 difficulty levels with a browseable library and dedicated review mode for mistakes
- **Streak + history** — consecutive-day correct streak, accuracy %, per-puzzle record
- **Share card** — 1080×1080 PNG of today's board + result, one-tap download or Web Share

## Tech

|           |                                                              |
| --------- | ------------------------------------------------------------ |
| Framework | Next.js 16 (App Router, Turbopack) + React 19                |
| Language  | TypeScript strict                                            |
| Styling   | Tailwind CSS v4 (`@theme`)                                   |
| Motion    | Framer Motion 12                                             |
| Icons     | lucide-react                                                 |
| LLM       | DeepSeek `deepseek-chat` via the OpenAI-compatible SDK       |
| Board     | Canvas 2D, ~200 lines, no Go library                         |
| Storage   | `localStorage` (attempts) + `sessionStorage` (coach history) |

## Project layout

```
app/
  layout.tsx              · LocaleProvider, fonts, Nav
  globals.css             · Tailwind v4 @theme (board wood palette + teal accent)
  page.tsx + TodayClient  · daily puzzle screen
  result/                 · judgment, solution reveal, coach, share card
  stats/                  · streak / accuracy / history
  api/coach/route.ts      · LLM proxy (8KB cap, 10 req/min/IP, history trimmed to 6 turns, zod-validated)
components/
  GoBoard                 · canvas board + click-to-play + hover ghost
  CoachDialogue           · on-demand chat, sessionStorage per puzzle+locale
  ShareCard               · off-screen canvas → PNG / Web Share
  Nav · LanguageToggle · PuzzleHeader
lib/
  board · judge · storage · puzzleOfTheDay · i18n · coachPrompt · rateLimit
content/
  puzzles.ts              · ⭐ environment-aware entry: server reads full data, client reads light index
  puzzles.server.ts       · server-side full data loader
  data/
    puzzleIndex.json      · light client-side index (summaries only)
    importedPuzzles.json  · bulk-imported puzzles (auto-generated)
    puzzleLibrary.json    · full puzzle library (auto-generated)
  messages/{zh,en,ja,ko}.json
  curatedPuzzles.ts       · hand-written curated puzzles
types/
  index.ts                · Puzzle / AttemptRecord / CoachMessage / Locale
  schemas.ts              · zod runtime schemas (shared by API + validator)
```

## Local development

```bash
cp .env.example .env.local
# Open .env.local and paste your own DeepSeek API key
#   DEEPSEEK_API_KEY=sk-...

npm install
npm run dev
```

Open `http://localhost:3000`.

## Environment variables

| Name                   | Required | Default                       | Where                                                                         |
| ---------------------- | -------- | ----------------------------- | ----------------------------------------------------------------------------- |
| `DEEPSEEK_API_KEY`     | yes      | —                             | `.env.local` locally · Vercel → Project → Environment Variables in production |
| `NEXT_PUBLIC_SITE_URL` | no       | `https://go-daily.vercel.app` | Used for canonical URLs, sitemap, and robots                                  |
| `RATE_LIMIT_WINDOW_MS` | no       | `60000` (60s)                 | Rate-limit time window in milliseconds                                        |
| `RATE_LIMIT_MAX`       | no       | `10`                          | Max requests per window per IP                                                |

`.env*` is gitignored by default; `.env.example` is the only env file that gets committed.

## Adding new puzzles

Curated puzzles are hand-written in `content/curatedPuzzles.ts`. Each entry needs:

- `stones[]` — the starting position (coords 0-indexed from the top-left)
- `correct[]` — one or more accepted solution points
- `prompt` and `solutionNote` in **all four locales**

For bulk imports, place SGF files in `scripts/sgf/` and run `npm run import:puzzles`. This outputs to `content/data/importedPuzzles.json`.

The data entry layer (`content/puzzles.ts`) aggregates curated and imported sources. On the server, full puzzle data is loaded via `content/puzzles.server.ts`; on the client, only a lightweight index (`content/data/puzzleIndex.json`) is fetched.

The coach receives `solutionNote[locale]` as ground truth, so write it carefully — the model is instructed not to invent new tactics beyond what's in the note.

## Deploy

This repo is wired for Vercel. Import the GitHub repo, set `DEEPSEEK_API_KEY` in the project's environment variables, configure `NEXT_PUBLIC_SITE_URL` to your production domain, and every push to `main` ships.

## Known limitations (v1)

- **LLM is a coach, not a judge.** DeepSeek reads the provided solution note and paraphrases it in the student's language — it can hallucinate variations the note doesn't cover. For v2, integrating KataGo would give objective ground truth.
- **No capture / ko logic.** The board doesn't simulate captures; puzzles are chosen so the solution is a single vital point rather than a capture sequence.
- **One timezone, one puzzle.** The daily switch is local-midnight, so crossing timezones may show you the same puzzle or skip ahead a day.
- **Rate limiting is in-memory only.** The current `MemoryRateLimiter` works for a single instance but does not share state across Vercel serverless instances. Persistent rate limiting (Redis / KV) is planned for production scale.

---

© 2026 Frank.
