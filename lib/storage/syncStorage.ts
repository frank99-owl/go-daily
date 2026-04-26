/**
 * syncStorage — unified attempt persistence with three runtime states:
 *
 *   anon              localStorage only
 *   logged-in-online  localStorage (immediate) + IndexedDB queue → Supabase
 *   logged-in-offline localStorage (immediate) + IndexedDB queue (retries later)
 *
 * The queue lives in IndexedDB to survive page reloads, cross-tab navigation,
 * and offline-to-online transitions. ClientInit calls `flushSyncQueue` when
 * the browser comes back online for a logged-in user.
 */
import { del, get, set } from "idb-keyval";

import { nextSrsCardForAttempt, type SrsCardState } from "@/lib/puzzle/srs";
import { createClient } from "@/lib/supabase/client";
import type { AttemptRecord } from "@/types";

import { attemptKey } from "./attemptKey";
import {
  loadAttempts as loadLocalAttempts,
  replaceAttempts as replaceLocalAttempts,
  saveAttempt as saveLocalAttempt,
} from "./storage";

export interface SyncStorage {
  getAttempts(): Promise<AttemptRecord[]>;
  saveAttempt(record: AttemptRecord): Promise<void>;
  /** Push pending queue + pull remote delta. Returns merge stats. */
  sync(): Promise<{ pushed: number; pulled: number }>;
}

export const SYNC_QUEUE_KEY = "go-daily.sync.queue.v1";
export const SYNC_FAILED_STORAGE_KEY = "go-daily.sync.failed";
export const MAX_QUEUE_SIZE = 1000;
/** Supabase REST payload sweet spot for bulk inserts. */
const INSERT_BATCH = 500;
/** Exponential backoff schedule (ms), clamped at 30s. */
const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000];
const MAX_RETRIES = 10;
const FLUSH_DEBOUNCE_MS = 500;

type AttemptRow = {
  user_id: string;
  puzzle_id: string;
  date: string;
  user_move_x: number | null;
  user_move_y: number | null;
  correct: boolean;
  client_solved_at_ms: number;
};

function toRow(userId: string, a: AttemptRecord): AttemptRow {
  return {
    user_id: userId,
    puzzle_id: a.puzzleId,
    date: a.date,
    user_move_x: a.userMove?.x ?? null,
    user_move_y: a.userMove?.y ?? null,
    correct: a.correct,
    client_solved_at_ms: a.solvedAtMs,
  };
}

function fromRow(row: {
  puzzle_id: string;
  date: string;
  user_move_x: number | null;
  user_move_y: number | null;
  correct: boolean;
  client_solved_at_ms: number | string;
}): AttemptRecord {
  return {
    puzzleId: row.puzzle_id,
    date: row.date,
    userMove:
      row.user_move_x != null && row.user_move_y != null
        ? { x: row.user_move_x, y: row.user_move_y }
        : null,
    correct: row.correct,
    solvedAtMs: Number(row.client_solved_at_ms),
  };
}

type SrsCardRow = {
  puzzle_id: string;
  ease_factor: number | string;
  interval_days: number | string;
  due_date: string;
  last_reviewed_at: string | null;
};

function fromSrsRow(row: SrsCardRow): SrsCardState {
  return {
    easeFactor: Number(row.ease_factor),
    intervalDays: Number(row.interval_days),
    dueDate: row.due_date,
    lastReviewedAt: row.last_reviewed_at,
  };
}

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

async function readQueue(): Promise<AttemptRecord[]> {
  try {
    return (await get<AttemptRecord[]>(SYNC_QUEUE_KEY)) ?? [];
  } catch {
    // idb-keyval throws when no IndexedDB is available (e.g. SSR accidents).
    // Treat as an empty queue — the in-memory flush path still works.
    return [];
  }
}

function dedupeAttempts(records: AttemptRecord[]): AttemptRecord[] {
  const seen = new Set<string>();
  const deduped: AttemptRecord[] = [];
  for (const record of records) {
    const key = attemptKey(record);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(record);
  }
  return deduped;
}

async function writeQueue(queue: AttemptRecord[]): Promise<void> {
  try {
    if (queue.length === 0) {
      await del(SYNC_QUEUE_KEY);
      return;
    }
    await set(SYNC_QUEUE_KEY, queue);
  } catch {
    // Same fallback as readQueue — swallow to avoid crashing UI.
  }
}

export async function queueAttempts(records: AttemptRecord[]): Promise<void> {
  if (records.length === 0) return;
  const queue = await readQueue();
  const merged = dedupeAttempts([...queue, ...records]);
  if (merged.length > MAX_QUEUE_SIZE) {
    merged.splice(0, merged.length - MAX_QUEUE_SIZE);
  }
  await writeQueue(merged);
}

function markFailure(failed: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (failed) {
      window.localStorage.setItem(SYNC_FAILED_STORAGE_KEY, new Date().toISOString());
    } else {
      window.localStorage.removeItem(SYNC_FAILED_STORAGE_KEY);
    }
  } catch {
    // Sync status is diagnostic only; never crash gameplay if storage is blocked.
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Anonymous implementation: transparent localStorage passthrough.
// ---------------------------------------------------------------------------
function createAnonSyncStorage(): SyncStorage {
  return {
    async getAttempts() {
      return loadLocalAttempts();
    },
    async saveAttempt(record) {
      saveLocalAttempt(record);
    },
    async sync() {
      return { pushed: 0, pulled: 0 };
    },
  };
}

// ---------------------------------------------------------------------------
// Authed implementation: double-write + persistent retry queue.
// ---------------------------------------------------------------------------
function createAuthedSyncStorage(userId: string): SyncStorage {
  const supabase = createClient();
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let flushInFlight: Promise<number> | null = null;

  async function updateSrsCard(record: AttemptRecord): Promise<void> {
    try {
      const { data: existing, error: readError } = await supabase
        .from("srs_cards")
        .select("puzzle_id, ease_factor, interval_days, due_date, last_reviewed_at")
        .eq("user_id", userId)
        .eq("puzzle_id", record.puzzleId)
        .maybeSingle();

      if (readError) return;

      const solvedAt = new Date(record.solvedAtMs);
      if (Number.isNaN(solvedAt.getTime())) return;

      const next = nextSrsCardForAttempt({
        card: existing ? fromSrsRow(existing as SrsCardRow) : null,
        correct: record.correct,
        solvedAt,
        timeZone: browserTimeZone(),
      });
      if (!next) return;

      await supabase.from("srs_cards").upsert(
        {
          user_id: userId,
          puzzle_id: record.puzzleId,
          ease_factor: next.easeFactor,
          interval_days: next.intervalDays,
          due_date: next.dueDate,
          last_reviewed_at: next.lastReviewedAt,
        },
        { onConflict: "user_id,puzzle_id" },
      );
    } catch {
      // Best-effort only. The server review page rebuilds SRS state from
      // synced attempts if this browser-side write is skipped or offline.
    }
  }

  async function pushQueueOnce(): Promise<number> {
    let queue = await readQueue();
    if (queue.length === 0) return 0;

    let pushed = 0;
    let attempt = 0;

    while (queue.length > 0 && attempt < MAX_RETRIES) {
      const batch = queue.slice(0, INSERT_BATCH);
      const rows = batch.map((a) => toRow(userId, a));
      const { error } = await supabase.from("attempts").upsert(rows, {
        onConflict: "user_id,puzzle_id,client_solved_at_ms",
        ignoreDuplicates: true,
      });

      if (!error) {
        queue = queue.slice(batch.length);
        await writeQueue(queue);
        pushed += batch.length;
        attempt = 0;
        continue;
      }

      attempt += 1;
      const wait = BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)];
      await sleep(wait);
    }

    markFailure(queue.length > 0);
    return pushed;
  }

  function scheduleFlush(): void {
    if (flushTimer) return;
    flushTimer = setTimeout(async () => {
      flushTimer = null;
      await runFlush();
    }, FLUSH_DEBOUNCE_MS);
  }

  async function runFlush(): Promise<number> {
    if (flushInFlight) return flushInFlight;
    flushInFlight = pushQueueOnce().finally(() => {
      flushInFlight = null;
    });
    return flushInFlight;
  }

  async function enqueue(record: AttemptRecord): Promise<void> {
    await queueAttempts([record]);
  }

  return {
    async getAttempts() {
      return loadLocalAttempts();
    },
    async saveAttempt(record) {
      saveLocalAttempt(record);
      await enqueue(record);
      scheduleFlush();
      void updateSrsCard(record);
    },
    async sync() {
      const pushed = await runFlush();

      const { data, error } = await supabase
        .from("attempts")
        .select("puzzle_id, date, user_move_x, user_move_y, correct, client_solved_at_ms")
        .eq("user_id", userId)
        .order("client_solved_at_ms", { ascending: false })
        .limit(10_000);

      if (error) return { pushed, pulled: 0 };

      const remote = (data ?? []).map(fromRow);
      const local = loadLocalAttempts();
      const seen = new Set(local.map(attemptKey));
      const toAdd = remote.filter((r) => !seen.has(attemptKey(r)));
      if (toAdd.length > 0) {
        replaceLocalAttempts([...local, ...toAdd]);
      }
      return { pushed, pulled: toAdd.length };
    },
  };
}

export async function fetchRemoteAttempts(userId: string): Promise<AttemptRecord[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("attempts")
    .select("puzzle_id, date, user_move_x, user_move_y, correct, client_solved_at_ms")
    .eq("user_id", userId)
    .order("client_solved_at_ms", { ascending: false })
    .limit(10_000);

  if (error) {
    throw new Error(`failed to fetch remote attempts: ${error.message}`);
  }

  return (data ?? []).map(fromRow);
}

export function createSyncStorage(userId: string | null): SyncStorage {
  return userId ? createAuthedSyncStorage(userId) : createAnonSyncStorage();
}

/**
 * One-shot helper for the service worker / `online` event listener to
 * drain pending attempts without spinning up a full SyncStorage façade.
 */
export async function flushSyncQueue(userId: string): Promise<number> {
  const authed = createAuthedSyncStorage(userId);
  const { pushed } = await authed.sync();
  return pushed;
}
