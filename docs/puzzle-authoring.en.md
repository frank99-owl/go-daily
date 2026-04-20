# Puzzle Authoring Workflow

> 中文版：[puzzle-authoring.md](./puzzle-authoring.md)

Three things you'll get out of this doc:

1. What a puzzle needs from zero to shipped
2. Three authoring paths — hand-written curated · bulk SGF import · future sources
3. How to validate locally so nothing dirty ships

## What a puzzle needs

Minimum fields (every puzzle):

| Field          | Type                 | Meaning                                                                                            |
| -------------- | -------------------- | -------------------------------------------------------------------------------------------------- |
| `id`           | string               | Globally unique. Curated: `YYYY-MM-DD` or `ld-001`; imports get a prefixed format like `cho-e-001` |
| `boardSize`    | `9 \| 13 \| 19`      | Board size                                                                                         |
| `stones`       | `Stone[]`            | Starting position. 0-indexed coords, `(0,0)` is top-left                                           |
| `toPlay`       | `"black" \| "white"` | Whose move                                                                                         |
| `correct`      | `Coord[]`            | Accepted **first-move** solutions (supports multiple)                                              |
| `tag`          | `PuzzleTag`          | `life-death` / `tesuji` / `endgame` / `opening`                                                    |
| `difficulty`   | `1..5`               | 1 = easiest                                                                                        |
| `prompt`       | `LocalizedText`      | Four-language prompt (zh/en/ja/ko)                                                                 |
| `solutionNote` | `LocalizedText`      | Four-language explanation — **ground truth for the AI coach**                                      |

Optional but recommended (especially for curated):

| Field              | Notes                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------- |
| `solutionSequence` | Full variation — powers the "Play solution" button on the result page                   |
| `wrongBranches`    | Common wrong moves + refutations — feeds the coach richer grounding                     |
| `isCurated`        | `true` (default when omitted) = full coach treatment; `false` = library-only, coach off |
| `source`           | Attribution label, e.g. `"Cho Chikun · Life & Death · Elementary"`                      |
| `date`             | `YYYY-MM-DD`; imports use the placeholder `"2026-04-18"`                                |

Full schema: [`data-schema.en.md`](./data-schema.en.md).

## Path A: Hand-write a curated puzzle

A curated puzzle = full 4-language explanation, AI coach enabled, eligible for the daily rotation. This is the path most of Frank's own puzzles will take.

### Steps

1. **Design the position** — sketch on paper / SGF editor. Pin down initial stones and the correct first move.
2. **Record coordinates**. Internal system is **0-indexed `(x, y)` from top-left**. The R17 star point on a 19×19 is `(x=15, y=2)`. SGF letter mapping: a=0, b=1, ..., s=18.
3. **Add an entry to `content/curatedPuzzles.ts`**:

```ts
// content/curatedPuzzles.ts
import type { Puzzle } from "@/types";

export const CURATED_PUZZLES: Puzzle[] = [
  {
    id: "2026-05-01",
    date: "2026-05-01",
    boardSize: 19,
    stones: [
      { x: 2, y: 2, color: "black" },
      { x: 3, y: 2, color: "black" },
      // ...
    ],
    toPlay: "black",
    correct: [
      { x: 2, y: 1 }, // primary solution
      { x: 1, y: 2 }, // equivalent variation (if any)
    ],
    solutionSequence: [
      { x: 2, y: 1, color: "black" },
      { x: 3, y: 1, color: "white" },
      { x: 4, y: 2, color: "black" },
    ],
    wrongBranches: [
      {
        userWrongMove: { x: 4, y: 4 },
        refutation: [
          { x: 5, y: 5, color: "white" },
          { x: 5, y: 4, color: "black" },
        ],
        note: {
          zh: "白五五挡住后黑无法做活。",
          en: "White's shoulder hit at 5-5 prevents black from making two eyes.",
          ja: "白の5-5のカタツキで黒は二眼が作れない。",
          ko: "백의 5-5 어깨짚기로 흑은 두 눈을 낼 수 없다.",
        },
      },
    ],
    isCurated: true,
    tag: "life-death",
    difficulty: 2,
    prompt: {
      zh: "黑先活",
      en: "Black to play and live",
      ja: "黒先活",
      ko: "흑선활",
    },
    solutionNote: {
      zh: "关键是 2-1 的『虎口』，让白无法夺眼。",
      en: "The vital point is the 2-1 'tiger's mouth' — it denies White the eye-gouging move.",
      ja: "2-1 の急所（虎の口）が要。白の眼取りを許さない。",
      ko: "2-1 급소(호구)가 포인트 — 백의 눈 빼앗기를 막는다.",
    },
    source: "Frank · 2026 spring", // optional
  },
];
```

The data entry layer (`content/puzzles.ts` / `content/puzzles.server.ts`) automatically aggregates `curatedPuzzles.ts` with `importedPuzzles.json`. You do not need to merge manually.

4. **Run the validator**:

```bash
npm run validate:puzzles
# ✓ Validated 1210 puzzles (0 curated, 1210 library)
```

5. **Smoke test locally**:

```bash
npm run dev
# Open http://localhost:3000/puzzles/2026-05-01
```

6. **`npm run build` before shipping** — the `prebuild` hook re-runs validation automatically.

### Easiest gotchas

- **Flipped axes**: internal `(x, y)` = column, row, starting top-left. Don't write "bottom-up".
- **`correct` filled but `solutionSequence` empty**: coach still works (has `solutionNote`), but the result page's "Play solution" button won't animate.
- **Missing a locale**: if any `prompt` / `solutionNote` entry is an empty string, the validator blocks. `localized()` has a fallback chain so the UI won't crash, but the validator still enforces coverage.
- **Duplicate ID**: validator reports the first and second index where the collision happened.

## Path B: Bulk SGF import

That's how the current `content/data/importedPuzzles.json` (100 Cho Chikun beginner life-and-death problems) was populated.

### Command

```bash
npm run import:puzzles
```

Under the hood, `scripts/importTsumego.ts`:

1. Pulls from GitHub `sanderland/tsumego` (MIT), collection `Cho Chikun Encyclopedia Life And Death - Elementary`
2. Takes the first 100, converts SGF coords to `(x, y)`
3. Writes `content/data/importedPuzzles.json` (do not edit by hand)

### Design conventions

- All imports land with `isCurated: false` — no hand-authored 4-language `solutionNote`, so the coach is gated off (see the conditional render in `ResultClient.tsx`) to prevent hallucination.
- `prompt` is a generic template: "Black to play — find the vital point".
- `solutionNote` is generic: "Classical life-and-death problem. Tap 'View solution'…" — shown on the result page but the coach never reads it (it's gated off).
- `source` carries attribution.

### Changing the source collection

Want a different collection? Edit the constants at the top of `scripts/importTsumego.ts`:

```ts
const COLLECTION = "Cho Chikun Encyclopedia Life And Death - Elementary";
const CATEGORY = "1a. Tsumego Beginner";
const HOW_MANY = 100;
```

Other collections are browsable at [sanderland/tsumego](https://github.com/sanderland/tsumego) under `problems/`.

## Path C: Future new sources

If you plug in a new source later (OGS games, Frank's own SGF folder, some API) — follow the importTsumego shape:

1. New `scripts/importX.ts`, reads source, maps to `Puzzle[]`
2. Writes to its own file `content/data/importedX.json` (do-not-edit convention)
3. Register the new data source in `content/puzzles.server.ts`:

```ts
// content/puzzles.server.ts
import importedXPuzzles from "./data/importedX.json";

// Merge during aggregation
const ALL_PUZZLES: Puzzle[] = [
  ...curatedPuzzles,
  ...importedPuzzles,
  ...importedXPuzzles, // new source
];
```

4. Add a `package.json` script (e.g. `"import:ogs": "tsx scripts/importOgs.ts"`)
5. **Do**: give IDs a distinct prefix to avoid collisions (`cho-e-001` vs `ogs-2024-001`) — the validator will catch them, but readable IDs matter.

**Do not**:

- Append other sources directly into `content/data/importedPuzzles.json` — that file is auto-generated and will be clobbered next import run.
- Skip the validator on commit. You might get away with it solo, but CI/deployment will blow up.

## Validator rules

`scripts/validatePuzzles.ts` first checks with a `zod` schema for basic type validity, then runs custom semantic rules:

| Rule               | What it catches                                                 |
| ------------------ | --------------------------------------------------------------- |
| `id`               | Duplicate or empty                                              |
| `boardSize`        | Not 9 / 13 / 19                                                 |
| `difficulty`       | Not integer 1..5                                                |
| `tag`              | Outside the allowed enum                                        |
| `toPlay`           | Not black / white                                               |
| `correct`          | Empty array or out-of-bounds coord                              |
| `stones`           | Out-of-bounds / overlapping / invalid color                     |
| `solutionSequence` | Out-of-bounds / invalid color (if present)                      |
| `wrongBranches`    | Refutation out-of-bounds / missing note locale                  |
| `prompt`           | Any of the four locales empty                                   |
| `solutionNote`     | Any of the four locales empty (only when `isCurated !== false`) |

**Not checked** (left to human review):

- Difficulty calibration accuracy
- Tag correctness
- Whether the solution actually works out — that takes Go skill, not mechanical checks
- Translation quality

## Common troubleshooting

| Symptom                                           | Likely cause                                                                                                                          |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run build` fails with `✗ 1 issue(s)`         | Run `npm run validate:puzzles` to see the detailed report                                                                             |
| New curated puzzle doesn't show in `/puzzles`     | Check `content/puzzles.server.ts` has correctly aggregated the curated source; restart dev server                                     |
| Coach mentions things not in the solution         | `solutionNote` is too thin; the coach can only ground on it plus `solutionSequence` + `wrongBranches`                                 |
| Switching to Japanese shows English solution text | `localized()` fallback kicked in — that means `solutionNote.ja` is empty. The validator should've blocked this; something bypassed it |
| Result page has no "View solution" button         | Current logic: `showAnswer` only renders when `correct` is non-empty. Make sure `correct[]` is populated                              |

## Further reading

- [`data-schema.en.md`](./data-schema.en.md) — per-field semantics
- [`i18n.en.md`](./i18n.en.md) — writing-style notes for translations
- [`ai-coach.en.md`](./ai-coach.en.md) — how `solutionNote` flows into the coach
