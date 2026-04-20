# Contributing Guide

> Chinese version: [CONTRIBUTING.md](./CONTRIBUTING.md)

---

## Table of Contents

1. [Local Development Quickstart](#1-local-development-quickstart)
2. [npm Scripts Reference](#2-npm-scripts-reference)
3. [Project Structure](#3-project-structure)
4. [Code Style](#4-code-style)
5. [Adding Puzzles](#5-adding-puzzles)
6. [Adding Translations](#6-adding-translations)
7. [Submitting a Pull Request](#7-submitting-a-pull-request)
8. [Testing](#8-testing)

---

## 1. Local Development Quickstart

### Prerequisites

| Tool    | Version                     |
| ------- | --------------------------- |
| Node.js | ≥ 20                        |
| npm     | ≥ 10 (bundled with Node.js) |

### Steps

```bash
# 1. Clone the repository
git clone <repo-url>
cd go-daily

# 2. Install dependencies
npm install

# 3. Create a local environment file (needed for AI coach)
cp .env.example .env.local
# Edit .env.local and fill in DEEPSEEK_API_KEY

# 4. Start the development server (Turbopack, hot-reload)
npm run dev
# Visit http://localhost:3000
```

> **The app works without `DEEPSEEK_API_KEY`** — all features work normally; the AI coach panel will simply show "service unavailable".

### Recommended VS Code Extensions

- **Tailwind CSS IntelliSense** — autocomplete for `@theme` tokens
- **ESLint** — real-time error highlighting on save
- **Prettier** — formatting (config in `.prettierrc`)

---

## 2. npm Scripts Reference

| Command                    | Description                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------ |
| `npm run dev`              | Start development server (Turbopack, port 3000)                                                  |
| `npm run build`            | Production build (automatically triggers `validate:puzzles`)                                     |
| `npm run start`            | Start the production server (requires a prior `build`)                                           |
| `npm run lint`             | Run ESLint                                                                                       |
| `npm run validate:puzzles` | Validate integrity of all puzzle data                                                            |
| `npm run format`           | Prettier formatting on all files                                                                 |
| `npm run format:check`     | Prettier format check (for CI)                                                                   |
| `npm run test`             | Vitest unit tests + component tests + API tests                                                  |
| `npm run import:puzzles`   | Bulk-import puzzles from SGF files (see [puzzle-authoring.en.md](./docs/puzzle-authoring.en.md)) |

---

## 3. Project Structure

```
go-daily/
├── app/                  # Next.js App Router pages and API
│   ├── api/coach/        # AI Coach Route Handler (zod-validated)
│   ├── developer/        # Developer page
│   ├── puzzles/          # Puzzle library and [id] dynamic route
│   ├── result/           # Result page
│   ├── review/           # Review page
│   ├── stats/            # Stats page
│   └── today/            # Daily puzzle page
├── components/           # Shared UI components
├── content/
│   ├── messages/         # 4-locale translation JSON files
│   ├── puzzles.ts        # Environment-aware data entry (auto server/client switch)
│   ├── puzzles.server.ts # Server-side full data loader
│   ├── curatedPuzzles.ts # Hand-written curated puzzles
│   ├── data/             # Large data files (auto-generated JSON)
│   │   ├── puzzleIndex.json      # Lightweight client-side index
│   │   ├── importedPuzzles.json  # Bulk-imported puzzles
│   │   └── puzzleLibrary.json    # Full puzzle library
│   └── games/            # Historical game record SGF data
├── docs/                 # Project documentation (bilingual CN/EN)
├── lib/                  # Utilities (i18n, storage, coach, goRules, sgf, rateLimit, etc.)
├── scripts/              # Build scripts (validation, import)
├── types/                # Global TypeScript type definitions + zod schemas
├── public/               # Static assets
└── proxy.ts              # i18n cookie → header forwarding
```

For a full architecture walkthrough, see [docs/architecture.en.md](./docs/architecture.en.md).

---

## 4. Code Style

### TypeScript

- **strict mode** (`tsconfig.json`); no `any` (add a comment if unavoidable)
- Path alias: `@/*` maps to the project root — avoid `../../../` relative paths
- Type definitions are centralized in `types/index.ts`, not scattered across files
- New zod schemas go in `types/schemas.ts`

### React

- Code that uses browser APIs (`localStorage`, `sessionStorage`, `window`) must only run client-side:
  - In files marked `"use client"`
  - Or inside `useEffect` (skipped during server-side rendering)
- Pure functions (e.g. `lib/puzzleStatus.ts`) must not import `window` — this keeps them unit-testable

### i18n

- All UI strings accessed via the `t` object from `useLocale()`
- Puzzle `prompt` / `solutionNote` fields always use `localized(text, locale)` — never direct indexing
- Adding a translation key requires updating all 4 locale files

### Styling

- Use Tailwind v4 `@theme` tokens (defined in `app/globals.css`)
- No inline `style={{}}` except for dynamically computed values (e.g. canvas dimensions)
- Prefer existing design tokens for colors and spacing

---

## 5. Adding Puzzles

### Manual (Curated Puzzles)

1. Add a `Puzzle` object to `content/curatedPuzzles.ts`
2. Run `npm run validate:puzzles` to validate
3. See [docs/puzzle-authoring.en.md](./docs/puzzle-authoring.en.md) for field details

### Bulk Import (SGF)

```bash
# Put SGF files in scripts/sgf/
npm run import:puzzles
```

Output is written to `content/data/importedPuzzles.json` (auto-generated banner — don't edit by hand).

Bulk-imported puzzles should have `isCurated: false` (disables the AI coach to prevent hallucination).

---

## 6. Adding Translations

1. Add the new key to `content/messages/en.json` (the type authority)
2. Add the corresponding translation to `zh.json`, `ja.json`, and `ko.json`
3. TypeScript will enforce a consistent structure across all locale files at compile time

See [docs/i18n.en.md](./docs/i18n.en.md) for details.

---

## 7. Submitting a Pull Request

1. Branch off `main`: `git checkout -b feat/my-feature`
2. Make your changes locally and verify that all of the following pass:
   ```bash
   npm run format:check       # Prettier formatting check passes
   npm run lint               # no ESLint errors
   npm run test               # all tests green (49/49)
   npm run validate:puzzles   # puzzle data validates
   npm run build              # production build succeeds
   ```
3. Open a PR with a description covering:
   - What changed
   - Why it changed
   - How to test it (screenshots or step-by-step instructions)

---

## 8. Testing

The project uses **Vitest** for unit tests, covering core pure functions, components, and API:

```bash
npm run test       # run all tests
npm run test:watch # watch mode
```

Current test files:

| File                                      | Coverage                                       |
| ----------------------------------------- | ---------------------------------------------- |
| `lib/board.test.ts`                       | `coordEquals` / `isInBounds` / `starPoints`    |
| `lib/judge.test.ts`                       | Correct / wrong / multi-correct verdicts       |
| `lib/goRules.test.ts`                     | Capture logic (single, group, no self-capture) |
| `lib/sgf.test.ts`                         | SGF coord parsing, branch skipping             |
| `lib/puzzleOfTheDay.test.ts`              | Daily rotation algorithm                       |
| `lib/storage.test.ts`                     | localStorage I/O and serialization             |
| `tests/api/coach.test.ts`                 | Coach API validation, rate limiting, errors    |
| `tests/components/CoachDialogue.test.tsx` | CoachDialogue rendering and interaction        |
| `tests/components/GoBoard.test.tsx`       | GoBoard canvas rendering and click coordinates |

---

_Related docs: [docs/architecture.en.md](./docs/architecture.en.md) · [docs/puzzle-authoring.en.md](./docs/puzzle-authoring.en.md) · [docs/i18n.en.md](./docs/i18n.en.md)_
