# Data Schema Reference

> Chinese version: [data-schema.md](./data-schema.md)

---

## Table of Contents

1. [Puzzle](#1-puzzle)
2. [AttemptRecord](#2-attemptrecord)
3. [CoachMessage](#3-coachmessage)
4. [Helper Types](#4-helper-types)
5. [Client-Side Storage Keys](#5-client-side-storage-keys)
6. [Supabase Database Tables](#6-supabase-database-tables)
7. [Coordinate System](#7-coordinate-system)
8. [Effect of `isCurated`](#8-effect-of-iscurated)

---

## 1. Puzzle

Type definitions: `types/index.ts`
Runtime validation: `types/schemas.ts` (zod)
Curated data: `content/curatedPuzzles.ts`
Generated data: `content/data/classicalPuzzles.json`, `content/data/classicalPuzzles.json`
Aggregation entry: `content/puzzles.ts` (env-aware) / `content/puzzles.server.ts` (server full data)

| Field              | Type                 | Required | Description                                                                                                         |
| ------------------ | -------------------- | -------- | ------------------------------------------------------------------------------------------------------------------- |
| `id`               | `string`             | ✅       | Globally unique. Daily puzzles use `YYYY-MM-DD`; library puzzles use `<tag>-<n>` e.g. `ld1-0`                       |
| `date`             | `string`             | ✅       | Local date `YYYY-MM-DD`; imported puzzles use placeholder `"2026-04-18"`; **not used for daily rotation**           |
| `boardSize`        | `9 \| 13 \| 19`      | ✅       | Board size                                                                                                          |
| `stones`           | `Stone[]`            | ✅       | Pre-placed stones for the starting position; no overlaps allowed                                                    |
| `toPlay`           | `"black" \| "white"` | ✅       | Who plays next                                                                                                      |
| `correct`          | `Coord[]`            | ✅       | Accepted correct first-move points for judging; must be non-empty                                                   |
| `solutionSequence` | `Stone[]`            | —        | Full correct variation sequence (multi-step), used for result-page animation                                        |
| `wrongBranches`    | `WrongBranch[]`      | —        | Common wrong-move branches with refutation sequences, for AI coach reference                                        |
| `isCurated`        | `boolean`            | —        | Defaults to `true`; when explicitly `false`, disables AI coach and hides the curated badge                          |
| `tag`              | `PuzzleTag`          | ✅       | `"life-death" \| "tesuji" \| "endgame" \| "opening"`                                                                |
| `difficulty`       | `1..5`               | ✅       | Integer; 1 = easiest                                                                                                |
| `prompt`           | `LocalizedText`      | ✅       | 4-locale puzzle description e.g. `{ zh:"Black to live", en:"Black to live", ja:"…", ko:"…" }`                       |
| `solutionNote`     | `LocalizedText`      | ✅\*     | 4-locale ground-truth explanation fed to the AI coach (\* validator skips content check when `isCurated === false`) |
| `source`           | `string`             | —        | Optional source note (SGF filename, book, etc.)                                                                     |

### 1.1 Stone

```ts
type Stone = Coord & { color: "black" | "white" };
// i.e. { x: number; y: number; color: "black" | "white" }
```

### 1.2 WrongBranch

```ts
interface WrongBranch {
  userWrongMove: Coord; // The incorrect move the student might play
  refutation: Stone[]; // Opponent's refutation sequence
  note: LocalizedText; // 4-locale explanation (AI coach reference)
}
```

### 1.3 PuzzleSummary (lightweight index)

`content/data/puzzleIndex.json` stores `PuzzleSummary[]`, containing only the minimal fields needed for list pages:

```ts
type PuzzleSummary = {
  id: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  source: string;
  date: string;
  prompt: LocalizedText;
  isCurated: boolean;
  boardSize: 9 | 13 | 19;
  tag: PuzzleTag;
};
```

The client-side library and review pages only consume `PuzzleSummary`, never loading full `Puzzle` data.

---

## 2. AttemptRecord

One record is **appended** after every move submission on the client side — records are never overwritten.

| Field        | Type            | Description                                               |
| ------------ | --------------- | --------------------------------------------------------- |
| `puzzleId`   | `string`        | Matches `Puzzle.id`                                       |
| `date`       | `string`        | Local date `YYYY-MM-DD`                                   |
| `userMove`   | `Coord \| null` | The move played; null for abandoned / invalid submissions |
| `correct`    | `boolean`       | Whether the move was correct                              |
| `solvedAtMs` | `number`        | Unix timestamp in milliseconds (submission time)          |

**Design principle**: append-only, never mutate. Multiple records per puzzle are intentional — they enable:

- Honest accuracy statistics
- Streak calculation
- Per-day activity heatmap

**Dedup key**: `${puzzleId}-${solvedAtMs}` (`lib/attemptKey.ts`), used for local backup merge and cloud sync deduplication.

---

## 3. CoachMessage

Stored in `sessionStorage`; lifetime is tied to the browser tab — cleared on close.

| Field     | Type                    | Description                                             |
| --------- | ----------------------- | ------------------------------------------------------- |
| `role`    | `"user" \| "assistant"` | Message author                                          |
| `content` | `string`                | Message text (capped at 2000 chars server-side)         |
| `ts`      | `number`                | Client-side timestamp (display only; ignored by server) |

**sessionStorage key**: `go-daily.coach.${puzzleId}.${locale}`
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

| Storage          | Key                                    | Content                | Lifetime                           |
| ---------------- | -------------------------------------- | ---------------------- | ---------------------------------- |
| `localStorage`   | `go-daily.attempts`                    | `AttemptRecord[]` JSON | Permanent (until manually cleared) |
| `localStorage`   | `go-daily.locale`                      | `Locale` string        | Permanent                          |
| `localStorage`   | `go-daily.device-id`                   | per-browser UUID       | Permanent                          |
| `sessionStorage` | `go-daily.coach.${puzzleId}.${locale}` | `CoachMessage[]` JSON  | Tab close clears it                |

Logged-in users additionally use:

| Storage      | Key                      | Content                         | Description                     |
| ------------ | ------------------------ | ------------------------------- | ------------------------------- |
| IndexedDB    | `go-daily.sync.queue.v1` | Pending `AttemptRecord[]`       | `lib/syncStorage.ts` queue      |
| localStorage | `go-daily.sync.failed`   | Last sync failure ISO timestamp | Used for UI sync status display |

> **No localStorage size guard**: each record is ~100 bytes. 100k records ≈ 10 MB, which approaches the 5–10 MB browser limit. At scale, a rolling-trim strategy is needed (see [extensibility.en.md](./extensibility.en.md)).

---

## 6. Supabase Database Tables

Schema defined in `supabase/migrations/*.sql`.

### 6.1 profiles

| Field                      | Type          | Description                                      |
| -------------------------- | ------------- | ------------------------------------------------ |
| `user_id`                  | `uuid` PK     | References `auth.users(id)`                      |
| `locale`                   | `text`        | User preferred locale (zh/en/ja/ko)              |
| `timezone`                 | `text`        | Timezone, default UTC                            |
| `kyu_rank`                 | `integer`     | Go strength rank (optional)                      |
| `display_name`             | `text`        | Display name (optional)                          |
| `email_opt_out`            | `boolean`     | Email opt-out                                    |
| `welcome_email_sent_at`    | `timestamptz` | Welcome email sent time; prevents duplicates     |
| `daily_email_last_sent_on` | `date`        | Most recent daily puzzle email send date         |
| `email_unsubscribe_token`  | `text`        | Unique unsubscribe-link token (random UUID text) |
| `deleted_at`               | `timestamptz` | Soft-delete marker                               |
| `created_at`               | `timestamptz` | Created at                                       |
| `updated_at`               | `timestamptz` | Updated at                                       |

**RLS**: Users can only read/write their own profile.

### 6.2 attempts

| Field                 | Type           | Description                       |
| --------------------- | -------------- | --------------------------------- |
| `id`                  | `bigserial` PK | Auto-increment primary key        |
| `user_id`             | `uuid`         | References `auth.users(id)`       |
| `puzzle_id`           | `text`         | Puzzle ID                         |
| `date`                | `text`         | Local date YYYY-MM-DD             |
| `user_move_x`         | `integer`      | User move X (nullable)            |
| `user_move_y`         | `integer`      | User move Y (nullable)            |
| `correct`             | `boolean`      | Whether correct                   |
| `duration_ms`         | `integer`      | Time spent solving (ms, optional) |
| `client_solved_at_ms` | `bigint`       | Client Unix millisecond timestamp |
| `created_at`          | `timestamptz`  | Server record time                |

**Constraint**: `UNIQUE (user_id, puzzle_id, client_solved_at_ms)` — prevents duplicate writes.
**RLS**: Users can only SELECT/INSERT their own attempts (append-only, no update/delete).

### 6.3 coach_usage

| Field     | Type      | Description                 |
| --------- | --------- | --------------------------- |
| `user_id` | `uuid`    | References `auth.users(id)` |
| `day`     | `date`    | Date                        |
| `count`   | `integer` | Usage count for the day     |

**RLS**: Users can only read their own usage. Writes via service_role.

**Monthly quota**: no separate month table — monthly count = `SUM(count)` over the current month window on `day`.

- Free → user-timezone **natural month** (prefers `profiles.timezone`, falls back to browser TZ, then UTC).
- Pro → **billing-anchor month** (from `subscriptions.first_paid_at` / `coach_anchor_day`).

Window implementation in `lib/coachQuota.ts`; runtime assembly in `lib/coachState.ts`.

### 6.4 subscriptions

| Field                    | Type          | Description                                                                                                          |
| ------------------------ | ------------- | -------------------------------------------------------------------------------------------------------------------- |
| `user_id`                | `uuid` PK     | References `auth.users(id)`                                                                                          |
| `stripe_customer_id`     | `text`        | Stripe Customer ID                                                                                                   |
| `stripe_subscription_id` | `text`        | Stripe Subscription ID                                                                                               |
| `plan`                   | `text`        | Subscription plan identifier                                                                                         |
| `status`                 | `text`        | active / trialing / etc.                                                                                             |
| `current_period_end`     | `timestamptz` | Current Stripe period end time                                                                                       |
| `cancel_at_period_end`   | `boolean`     | Whether cancelling at period end                                                                                     |
| `trial_end`              | `timestamptz` | Trial end time                                                                                                       |
| `first_paid_at`          | `timestamptz` | **First real paid invoice timestamp**; stays `null` during trial. Written by the `invoice.paid` webhook on first hit |
| `coach_anchor_day`       | `integer`     | `1..31`, extracted from `first_paid_at`. Drives Pro's monthly Coach quota window                                     |
| `updated_at`             | `timestamptz` | Updated time                                                                                                         |

**Writes**: Only via Stripe webhook + service_role.
**RLS**: Users can only read their own subscription.

**Anchor write rules**:

- `first_paid_at` is only written on the **first real paid charge** (`invoice.paid` with amount > 0). Existing values are never overwritten.
- `coach_anchor_day` is derived from the day-of-month of `first_paid_at`. Yearly subscribers use the same anchor to reset Coach monthly quota each calendar month.
- Anchor `31` on short months rolls back to the last day of that month (implemented in `getBillingAnchoredMonthWindow` inside `lib/coachQuota.ts`).
- `invoice.payment_failed` writes local `status = 'past_due'`, so `entitlements` downgrades immediately; a later successful payment event restores the current Stripe status.

### 6.5 srs_cards

Phase 2 SRS review scheduling table.

| Field              | Type          | Description                      |
| ------------------ | ------------- | -------------------------------- |
| `user_id`          | `uuid`        | References `auth.users(id)`      |
| `puzzle_id`        | `text`        | Puzzle ID                        |
| `ease_factor`      | `numeric`     | Memory ease factor (default 2.5) |
| `interval_days`    | `integer`     | Interval in days                 |
| `due_date`         | `date`        | Due review date                  |
| `last_reviewed_at` | `timestamptz` | Last review time                 |

**RLS**: Users have full CRUD.

**Write rules**: the logged-in browser best-effort upserts after saving an attempt; Pro `/review` replays `attempts.client_solved_at_ms` from oldest to newest to repair missing `srs_cards`, then shows only cards where `due_date <= today`. A first-time correct answer does not create a card; a wrong answer creates an immediately due card; correct reviews advance the existing card by SM-2 intervals.

### 6.6 stripe_events

Webhook idempotency ledger.

| Field                   | Type          | Description                                                        |
| ----------------------- | ------------- | ------------------------------------------------------------------ |
| `id`                    | `text` PK     | Stripe event ID                                                    |
| `event_type`            | `text`        | Event type                                                         |
| `received_at`           | `timestamptz` | Received time                                                      |
| `processed_at`          | `timestamptz` | Successful processing time; non-null duplicates can be skipped     |
| `processing_started_at` | `timestamptz` | Current processing claim time; used for concurrent webhook backoff |
| `last_error`            | `text`        | Last processing failure summary                                    |

**RLS**: No public read access (`SELECT using (false)`). Writes via service_role only.

### 6.7 user_devices

Free-plan single-device limit.

| Field        | Type          | Description                 |
| ------------ | ------------- | --------------------------- |
| `user_id`    | `uuid`        | References `auth.users(id)` |
| `device_id`  | `text`        | per-browser UUID            |
| `first_seen` | `timestamptz` | First seen time             |
| `last_seen`  | `timestamptz` | Last active time            |
| `user_agent` | `text`        | Browser UA string           |

**PK**: `(user_id, device_id)`
**RLS**: Users can only read/write their own devices.

---

## 7. Coordinate System

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

## 8. Effect of `isCurated`

| Behaviour                 | `isCurated === true` (or omitted)  | `isCurated === false`                             |
| ------------------------- | ---------------------------------- | ------------------------------------------------- |
| AI Coach                  | ✅ Enabled                         | ❌ Disabled (button hidden)                       |
| Library "Curated" badge   | ✅ Shown                           | ❌ Hidden                                         |
| `solutionNote` validation | ✅ All 4 locales must be non-empty | ⚠️ Content check skipped (field must still exist) |
| Result page solution note | ✅ Displayed                       | Not displayed / gracefully omitted                |

**When to set `isCurated: false`**: bulk-imported SGF puzzles typically lack hand-reviewed solution notes. Enabling the AI coach on those would cause it to treat an empty string as ground truth, leading to hallucination. Marking them `false` lets you safely ingest large puzzle sets without degrading the curated-puzzle experience.

---

_Related docs: [architecture.en.md](./architecture.en.md) · [puzzle-authoring.en.md](./puzzle-authoring.en.md) · [extensibility.en.md](./extensibility.en.md)_
