# Extensibility Guide

> Chinese version: [extensibility.md](./extensibility.md)

---

## Table of Contents

1. [Scale-Phase Overview](#1-scale-phase-overview)
2. [Scaling Puzzle Data](#2-scaling-puzzle-data)
3. [Scaling the Daily Rotation](#3-scaling-the-daily-rotation)
4. [Scaling Client-Side Storage](#4-scaling-client-side-storage)
5. [Build & Deployment Scaling](#5-build--deployment-scaling)
6. [Scaling the AI Coach](#6-scaling-the-ai-coach)
7. [Scaling i18n](#7-scaling-i18n)
8. [Extensibility Checklist](#8-extensibility-checklist)

---

## 1. Scale-Phase Overview

| Phase | Puzzle Count | Primary Bottleneck | Recommended Action |
|---|---|---|---|
| **Current** | ~100 | None | Keep as-is |
| **Phase A** | 100 → 1 000 | First-load JS bundle (full import) | Split files + lazy load |
| **Phase B** | 1 000 → 10 000 | `generateStaticParams` timeout; localStorage near limit | Database + API; IndexedDB |
| **Phase C** | 10 000+ | Client-side search/filter cannot handle it | Server-side search (full-text index); CDN board images |

---

## 2. Scaling Puzzle Data

### 2.1 Current Architecture

```
content/puzzles/index.ts
  └─ export const PUZZLES: Puzzle[] = [...]  // full array baked into JS bundle at build time
```

All pages import every puzzle statically via `import { PUZZLES } from "@/content/puzzles"`.

### 2.2 Phase A (~1 000 puzzles): Group by File

**Goal**: Keep bundle manageable; easier to maintain in parallel.

```
content/puzzles/
  life-death/
    ld1.ts   ld2.ts  ...
  tesuji/
    ts1.ts   ...
  index.ts   // lazy aggregation: export const PUZZLES = [...ld1, ...ld2, ...]
```

`PUZZLES` is still a single complete array at build time, but each tag file is independent and easy to work on concurrently.

For lazy-loading the library page:

```ts
// app/puzzles/page.tsx
import dynamic from "next/dynamic";
const PuzzleListClient = dynamic(() => import("./PuzzleListClient"), { ssr: false });
```

### 2.3 Phase B (~10 000 puzzles): External Data Source

**Goal**: Break free from JS bundle limits; enable incremental updates.

Recommended approach:

1. **SQLite + Turso** (edge database, zero ops):
   - One row per puzzle; store full JSON or split into columns
   - Next.js Route Handler provides `/api/puzzles?tag=&difficulty=&page=` paginated endpoint
   - Library page switches to client-side paginated fetch

2. **Replace `generateStaticParams` with ISR**:
   ```ts
   // app/puzzles/[id]/page.tsx
   export const revalidate = 86400; // regenerate daily
   // no longer enumerates full PUZZLES; use fallback: "blocking"
   ```

3. **Full-text search**: [Fuse.js](https://fusejs.io/) (client-side, fine up to ~5 000 puzzles) or [MeiliSearch](https://www.meilisearch.com/) (server-side).

### 2.4 Bulk Import

Use `scripts/importTsumego.ts` (`npm run import:puzzles`) to generate puzzles from SGF files in bulk.  
Set `isCurated: false` on imported puzzles to disable the AI coach and prevent hallucination.  
See [puzzle-authoring.en.md](./puzzle-authoring.en.md) for details.

---

## 3. Scaling the Daily Rotation

### 3.1 Current Algorithm

```ts
// lib/puzzleOfTheDay.ts
const ANCHOR = new Date("2026-04-18");
const dayIndex = Math.floor((today - ANCHOR) / 86_400_000);
const puzzle = PUZZLES[dayIndex % PUZZLES.length];
```

- Deterministic: given a date, every client computes the same puzzle with no network call.
- 100 puzzles cycle every ~3.3 months.

### 3.2 Scaling to 1 000+ Puzzles

No algorithm change needed — the longer `PUZZLES.length` automatically extends the cycle.

Notes:
- The **array order determines display order**. Shuffle puzzles before inserting in bulk (add a Fisher–Yates shuffle in `scripts/importTsumego.ts`).
- For "no repeats within N days", the library must contain at least N puzzles.

### 3.3 Server-Side Scheduling (Phase B+)

For an editorial "daily curated pick" workflow:
1. Add a nullable `scheduledDate` column to the database.
2. `GET /api/daily` queries for `scheduledDate = today`.
3. An editorial backend pre-schedules the next 7 daily puzzles.

---

## 4. Scaling Client-Side Storage

### 4.1 Current Implementation

`localStorage["go-daily.attempts"]` → `AttemptRecord[]` JSON  
~100 bytes per record; 100 records ≈ 10 KB; 10 000 records ≈ 1 MB.

### 4.2 Phase A (~1 000 records): Rolling Trim

Add to `lib/storage.ts`:

```ts
const MAX_RECORDS = 2000;

export function saveAttempt(record: AttemptRecord): void {
  const all = loadAttempts();
  all.push(record);
  const trimmed = all.length > MAX_RECORDS
    ? all.slice(all.length - MAX_RECORDS)
    : all;
  window.localStorage.setItem(KEY, JSON.stringify(trimmed));
}
```

> ⚠️ Trimming affects long-term stats accuracy (streak, overall accuracy). Consider only trimming records that are both `correct: true` and older than 180 days.

### 4.3 Phase B (10 000+ records): Migrate to IndexedDB

Use the [idb](https://github.com/jakearchibald/idb) library (3 KB gzip):

```ts
import { openDB } from "idb";
const db = await openDB("go-daily", 1, {
  upgrade(db) {
    const store = db.createObjectStore("attempts", { autoIncrement: true });
    store.createIndex("puzzleId", "puzzleId");
    store.createIndex("date", "date");
  },
});
```

Keep the same function signatures as `lib/storage.ts` — components don't need to change.

### 4.4 Cloud Sync (Optional)

To support cross-device sync (e.g. Clerk + Supabase):
- On login: `POST /api/sync` uploads local records; backend merges by deduplication.
- On app load: `GET /api/attempts` overwrites local with the merged set.

---

## 5. Build & Deployment Scaling

### 5.1 `generateStaticParams` Hot Spot

Current:

```ts
// app/puzzles/[id]/page.tsx
export async function generateStaticParams() {
  return PUZZLES.map((p) => ({ id: p.id }));
}
```

1 000 puzzles → ~1–2 min build time to generate 1 000 static pages — acceptable.  
10 000 puzzles → switch to ISR (see Section 2.3).

### 5.2 Image Assets

Board thumbnails (PNG/WebP) can go in `public/boards/` and use Next.js `<Image>` for automatic optimization.  
At larger scale, use a CDN (Cloudflare Images / Vercel Blob).

### 5.3 `prebuild` Validation

```json
"prebuild": "npm run validate:puzzles"
```

Once data moves to a database in Phase B, the validation script needs to connect to the database instead of importing a file.

---

## 6. Scaling the AI Coach

### 6.1 Current Limitations

| Limitation | Description |
|---|---|
| Rate limiting | In-process `Map`; resets on restart; not shared across instances |
| Model | `deepseek-chat`, hard-coded |
| Multi-instance deployment | Each Vercel serverless instance has its own rate-limit counter |

### 6.2 Phase A: Persistent Rate Limiting

Replace the `hits: Map` with [Upstash Redis](https://upstash.com/):

```ts
import { Redis } from "@upstash/redis";
const redis = Redis.fromEnv();

async function rateLimited(ip: string): Promise<boolean> {
  const key = `rl:${ip}:${Math.floor(Date.now() / 60_000)}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 120);
  return count > RATE_LIMIT_MAX;
}
```

### 6.3 Phase B: Configurable Model

The model name is hard-coded in `app/api/coach/route.ts`.  
Switch to an environment variable:

```
COACH_MODEL=deepseek-chat          # default
COACH_MODEL=deepseek-reasoner      # for harder puzzles
```

Route Handler reads:

```ts
const model = process.env.COACH_MODEL ?? "deepseek-chat";
```

---

## 7. Scaling i18n

See [i18n.en.md](./i18n.en.md) for the full guide. Key extensibility points:

- **Add a new locale**: create `content/messages/<locale>.json`, register it in `DICTS` in `lib/i18n.tsx`, and add the value to `Locale` in `types/index.ts`.
- **Add a new translation key**: add it to `en.json`. TypeScript's `type Messages = typeof en` immediately requires all other locale files to add the same key (compile-time error).
- **`lib/localized.ts`**: the fallback chain is `en → zh → ja → ko`. Update `FALLBACK_ORDER` when adding a new locale.

---

## 8. Extensibility Checklist

Complete these as your data and feature set grow:

- [ ] 100 → 1 000 puzzles: split `content/puzzles/` directory by tag
- [ ] 1 000 → 10 000 puzzles: external database; switch `generateStaticParams` to ISR
- [ ] Attempt records > 2 000: add rolling trim or migrate to IndexedDB
- [ ] Multi-instance deployment: switch rate limiting to Redis
- [ ] AI coach model: make configurable via environment variable
- [ ] Cross-device sync: add user auth + cloud storage

---

*Related docs: [architecture.en.md](./architecture.en.md) · [data-schema.en.md](./data-schema.en.md) · [puzzle-authoring.en.md](./puzzle-authoring.en.md)*
