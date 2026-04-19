# Data Schema Reference

> Chinese version: [data-schema.md](./data-schema.md)

---

## Table of Contents

1. [Puzzle](#1-puzzle)
2. [AttemptRecord](#2-attemptrecord)
3. [CoachMessage](#3-coachmessage)
4. [Helper Types](#4-helper-types)
5. [Client-Side Storage Keys](#5-client-side-storage-keys)
6. [Coordinate System](#6-coordinate-system)
7. [Effect of `isCurated`](#7-effect-of-iscurated)

---

## 1. Puzzle

Source: `types/index.ts` · Data: `content/puzzles/index.ts`

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | ✅ | Globally unique. Daily puzzles use `YYYY-MM-DD`; library puzzles use `<tag>-<n>` e.g. `ld1-0` |
| `date` | `string` | ✅ | Local date `YYYY-MM-DD`, used for daily rotation |
| `boardSize` | `9 \| 13 \| 19` | ✅ | Board size |
| `stones` | `Stone[]` | ✅ | Pre-placed stones for the starting position; no overlaps allowed |
| `toPlay` | `"black" \| "white"` | ✅ | Who plays next |
| `correct` | `Coord[]` | ✅ | Accepted correct first-move points for judging; must be non-empty |
| `solutionSequence` | `Stone[]` | — | Full correct variation sequence (multi-step), used for result-page animation |
| `wrongBranches` | `WrongBranch[]` | — | Common wrong-move branches with refutation sequences, for AI coach reference |
| `isCurated` | `boolean` | — | Defaults to `true`; when explicitly `false`, disables AI coach and hides the curated badge |
| `tag` | `PuzzleTag` | ✅ | `"life-death" \| "tesuji" \| "endgame" \| "opening"` |
| `difficulty` | `1..5` | ✅ | Integer; 1 = easiest |
| `prompt` | `LocalizedText` | ✅ | 4-locale puzzle description e.g. `{ zh:"黑先活", en:"Black to live", ja:"…", ko:"…" }` |
| `solutionNote` | `LocalizedText` | ✅* | 4-locale ground-truth explanation fed to the AI coach (\* validator skips content check when `isCurated === false`) |
| `source` | `string` | — | Optional source note (SGF filename, book, etc.) |

### 1.1 Stone

```ts
type Stone = Coord & { color: "black" | "white" };
// i.e. { x: number; y: number; color: "black" | "white" }
```

### 1.2 WrongBranch

```ts
interface WrongBranch {
  userWrongMove: Coord;   // The incorrect move the student might play
  refutation: Stone[];    // Opponent's refutation sequence
  note: LocalizedText;    // 4-locale explanation (AI coach reference)
}
```

---

## 2. AttemptRecord

One record is **appended** after every move submission on the client side — records are never overwritten.

| Field | Type | Description |
|---|---|---|
| `puzzleId` | `string` | Matches `Puzzle.id` |
| `date` | `string` | Local date `YYYY-MM-DD` |
| `userMove` | `Coord \| null` | The move played; null for abandoned / invalid submissions |
| `correct` | `boolean` | Whether the move was correct |
| `solvedAtMs` | `number` | Unix timestamp in milliseconds (submission time) |

**Design principle**: append-only, never mutate. Multiple records per puzzle are intentional — they enable:
- Honest accuracy statistics
- Streak calculation
- Per-day activity heatmap

---

## 3. CoachMessage

Stored in `sessionStorage`; lifetime is tied to the browser tab — cleared on close.

| Field | Type | Description |
|---|---|---|
| `role` | `"user" \| "assistant"` | Message author |
| `content` | `string` | Message text (capped at 2000 chars server-side) |
| `ts` | `number` | Client-side timestamp (display only; ignored by server) |

**sessionStorage key**: `coach-${puzzleId}-${locale}`  
Each (puzzle × locale) pair is stored independently so switching language doesn't mix conversations.

---

## 4. Helper Types

```ts
// Four supported locales
type Locale = "zh" | "en" | "ja" | "ko";

// A text string in all four locales
type LocalizedText = Record<Locale, string>;

// Coordinate (0-indexed, origin at top-left)
type Coord = { x: number; y: number };

// Stone color
type Color = "black" | "white";

// Puzzle category tags
type PuzzleTag = "life-death" | "tesuji" | "endgame" | "opening";

// Three-state completion status (derived from AttemptRecord[], never persisted)
type PuzzleStatus = "solved" | "attempted" | "unattempted";
```

`PuzzleStatus` is a **pure-function result** (`lib/puzzleStatus.ts`) — it is never stored directly.  
Derivation rules:
- `solved` → at least one record with `correct: true`
- `attempted` → has records, all `correct: false`
- `unattempted` → no records

---

## 5. Client-Side Storage Keys

| Storage | Key | Content | Lifetime |
|---|---|---|---|
| `localStorage` | `go-daily.attempts` | `AttemptRecord[]` JSON | Permanent (until manually cleared) |
| `localStorage` | `go-daily.locale` | `Locale` string | Permanent |
| `sessionStorage` | `coach-${puzzleId}-${locale}` | `CoachMessage[]` JSON | Tab close clears it |

> **No localStorage size guard**: each record is ~100 bytes. 100k records ≈ 10 MB, which approaches the 5–10 MB browser limit. At scale, a rolling-trim strategy is needed (see [extensibility.en.md](./extensibility.en.md)).

---

## 6. Coordinate System

```
(0,0) ──── x ────► (boardSize-1, 0)
  │
  y
  │
  ▼
(0, boardSize-1)
```

- Origin **(0, 0)** is the **top-left corner**
- `x` increases to the right; `y` increases downward
- All coordinates are **0-indexed integers** in the range `[0, boardSize-1]`
- This differs from SGF notation (letter-encoded, variable origin) — the import script handles the conversion

---

## 7. Effect of `isCurated`

| Behaviour | `isCurated === true` (or omitted) | `isCurated === false` |
|---|---|---|
| AI Coach | ✅ Enabled | ❌ Disabled (button hidden) |
| Library "Curated" badge | ✅ Shown | ❌ Hidden |
| `solutionNote` validation | ✅ All 4 locales must be non-empty | ⚠️ Content check skipped (field must still exist) |
| Result page solution note | ✅ Displayed | Not displayed / gracefully omitted |

**When to set `isCurated: false`**: bulk-imported SGF puzzles typically lack hand-reviewed solution notes. Enabling the AI coach on those would cause it to treat an empty string as ground truth, leading to hallucination. Marking them `false` lets you safely ingest large puzzle sets without degrading the curated-puzzle experience.

---

*Related docs: [architecture.en.md](./architecture.en.md) · [puzzle-authoring.en.md](./puzzle-authoring.en.md) · [extensibility.en.md](./extensibility.en.md)*
