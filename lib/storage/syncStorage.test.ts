import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AttemptRecord } from "@/types";

// ---------------------------------------------------------------------------
// Mocks: idb-keyval uses a real IndexedDB in browsers; jsdom does not have it,
// so we replace it with an in-memory Map that mirrors get/set/del semantics.
// ---------------------------------------------------------------------------
const idbStore = new Map<string, unknown>();

vi.mock("idb-keyval", () => ({
  get: vi.fn(async (key: string) => idbStore.get(key)),
  set: vi.fn(async (key: string, value: unknown) => {
    idbStore.set(key, value);
  }),
  del: vi.fn(async (key: string) => {
    idbStore.delete(key);
  }),
}));

// ---------------------------------------------------------------------------
// Mocks: localStorage helpers used by ./storage — simulate with a plain Map.
// ---------------------------------------------------------------------------
const localAttempts: AttemptRecord[] = [];

vi.mock("./storage", () => ({
  loadAttempts: vi.fn(() => [...localAttempts]),
  saveAttempt: vi.fn((record: AttemptRecord) => {
    localAttempts.push(record);
  }),
  replaceAttempts: vi.fn((records: AttemptRecord[]) => {
    localAttempts.length = 0;
    localAttempts.push(...records);
  }),
}));

// ---------------------------------------------------------------------------
// Mocks: Supabase browser client — configurable upsert / select handlers.
// ---------------------------------------------------------------------------
type UpsertHandler = (rows: unknown[]) => { error: unknown } | Promise<{ error: unknown }>;
type SelectHandler = () =>
  | {
      data: unknown[] | null;
      error: unknown;
    }
  | Promise<{ data: unknown[] | null; error: unknown }>;

let upsertHandler: UpsertHandler = () => ({ error: null });
let selectHandler: SelectHandler = () => ({ data: [], error: null });

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      upsert: async (rows: unknown[]) => upsertHandler(rows),
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: async () => selectHandler(),
          }),
        }),
      }),
    }),
  }),
}));

// ---------------------------------------------------------------------------

import {
  createSyncStorage,
  fetchRemoteAttempts,
  flushSyncQueue,
  MAX_QUEUE_SIZE,
  queueAttempts,
  SYNC_FAILED_STORAGE_KEY,
  SYNC_QUEUE_KEY,
} from "./syncStorage";

function makeAttempt(i: number): AttemptRecord {
  return {
    puzzleId: `p-${i}`,
    date: "2026-04-22",
    userMove: { x: 1, y: 1 },
    correct: i % 2 === 0,
    solvedAtMs: 1_700_000_000_000 + i,
  };
}

beforeEach(() => {
  idbStore.clear();
  localAttempts.length = 0;
  upsertHandler = () => ({ error: null });
  selectHandler = () => ({ data: [], error: null });
  vi.useRealTimers();
});

describe("syncStorage — anonymous", () => {
  it("passes through to localStorage and never touches the queue", async () => {
    const store = createSyncStorage(null);
    await store.saveAttempt(makeAttempt(1));
    await store.saveAttempt(makeAttempt(2));

    expect((await store.getAttempts()).length).toBe(2);
    expect(idbStore.get(SYNC_QUEUE_KEY)).toBeUndefined();

    const result = await store.sync();
    expect(result).toEqual({ pushed: 0, pulled: 0 });
  });
});

describe("syncStorage — authed", () => {
  it("double-writes and enqueues pending attempts", async () => {
    const store = createSyncStorage("user-1");
    await store.saveAttempt(makeAttempt(1));
    await store.saveAttempt(makeAttempt(2));

    expect(localAttempts.length).toBe(2);
    const queue = idbStore.get(SYNC_QUEUE_KEY) as AttemptRecord[];
    expect(queue).toHaveLength(2);
    expect(queue[0]?.puzzleId).toBe("p-1");
  });

  it("caps queue at MAX_QUEUE_SIZE, dropping oldest", async () => {
    const store = createSyncStorage("user-1");
    const seeded = Array.from({ length: MAX_QUEUE_SIZE - 1 }, (_, i) => makeAttempt(i));
    idbStore.set(SYNC_QUEUE_KEY, seeded);

    await store.saveAttempt(makeAttempt(9000));
    await store.saveAttempt(makeAttempt(9001));

    const queue = idbStore.get(SYNC_QUEUE_KEY) as AttemptRecord[];
    expect(queue).toHaveLength(MAX_QUEUE_SIZE);
    expect(queue.at(-1)?.puzzleId).toBe("p-9001");
    expect(queue[0]?.puzzleId).toBe("p-1");
  });

  it("sync() flushes queue on successful upsert and clears IDB", async () => {
    const store = createSyncStorage("user-1");
    await store.saveAttempt(makeAttempt(1));
    await store.saveAttempt(makeAttempt(2));
    expect((idbStore.get(SYNC_QUEUE_KEY) as AttemptRecord[]).length).toBe(2);

    const upsertCalls: number[] = [];
    upsertHandler = (rows) => {
      upsertCalls.push((rows as unknown[]).length);
      return { error: null };
    };

    const { pushed } = await store.sync();
    expect(pushed).toBe(2);
    expect(upsertCalls).toEqual([2]);
    expect(idbStore.get(SYNC_QUEUE_KEY)).toBeUndefined();
  });

  it("sync() returns pulled=0 and does not duplicate when every remote row is already local", async () => {
    const store = createSyncStorage("user-1");
    localAttempts.push(makeAttempt(1));
    localAttempts.push(makeAttempt(2));

    selectHandler = () => ({
      data: [
        {
          puzzle_id: "p-1",
          date: "2026-04-22",
          user_move_x: 1,
          user_move_y: 1,
          correct: false,
          client_solved_at_ms: 1_700_000_000_001,
        },
        {
          puzzle_id: "p-2",
          date: "2026-04-22",
          user_move_x: 1,
          user_move_y: 1,
          correct: true,
          client_solved_at_ms: 1_700_000_000_002,
        },
      ],
      error: null,
    });

    const { pulled } = await store.sync();
    expect(pulled).toBe(0);
    expect(localAttempts).toHaveLength(2);
  });

  it("sync() returns pulled=0 when the remote select errors", async () => {
    const store = createSyncStorage("user-1");
    selectHandler = () => ({ data: null, error: { message: "select failed" } });

    const result = await store.sync();
    expect(result).toEqual({ pushed: 0, pulled: 0 });
  });

  it("sync() leaves the queue intact when upsert returns an error", async () => {
    // Each retry sleeps via setTimeout — fake them to keep the test fast.
    vi.useFakeTimers();
    const store = createSyncStorage("user-1");
    await store.saveAttempt(makeAttempt(1));
    expect((idbStore.get(SYNC_QUEUE_KEY) as AttemptRecord[]).length).toBe(1);

    upsertHandler = () => ({ error: { message: "remote down" } });

    const syncPromise = store.sync();
    // Each retry schedules its own sleep, so a single advanceBy call only
    // fires the first timer. runAllTimersAsync keeps draining as new timers
    // are queued, letting the retry loop reach MAX_RETRIES.
    await vi.runAllTimersAsync();
    const result = await syncPromise;

    expect(result.pushed).toBe(0);
    const queue = idbStore.get(SYNC_QUEUE_KEY) as AttemptRecord[];
    expect(queue).toHaveLength(1);
    expect(queue[0]?.puzzleId).toBe("p-1");
  });

  it("sync() with an empty queue makes no upsert call", async () => {
    const store = createSyncStorage("user-1");
    let upsertCalls = 0;
    upsertHandler = () => {
      upsertCalls += 1;
      return { error: null };
    };

    const result = await store.sync();
    expect(result).toEqual({ pushed: 0, pulled: 0 });
    expect(upsertCalls).toBe(0);
  });

  it("sync() pulls remote attempts missing locally and merges", async () => {
    const store = createSyncStorage("user-1");
    localAttempts.push(makeAttempt(1));

    selectHandler = () => ({
      data: [
        {
          puzzle_id: "p-1",
          date: "2026-04-22",
          user_move_x: 1,
          user_move_y: 1,
          correct: true,
          client_solved_at_ms: 1_700_000_000_001,
        },
        {
          puzzle_id: "p-remote",
          date: "2026-04-22",
          user_move_x: 3,
          user_move_y: 3,
          correct: false,
          client_solved_at_ms: 1_700_000_000_999,
        },
      ],
      error: null,
    });

    const { pulled } = await store.sync();
    expect(pulled).toBe(1);
    expect(localAttempts.find((a) => a.puzzleId === "p-remote")).toBeTruthy();
  });
});

describe("queueAttempts (exported helper used by mergeOnLogin)", () => {
  it("dedupes by attemptKey across separate enqueue calls", async () => {
    const a = makeAttempt(1);
    await queueAttempts([a]);
    // Second call with the same record should not duplicate.
    await queueAttempts([a, makeAttempt(2)]);

    const queue = idbStore.get(SYNC_QUEUE_KEY) as AttemptRecord[];
    expect(queue).toHaveLength(2);
    expect(queue.map((r) => r.puzzleId).sort()).toEqual(["p-1", "p-2"]);
  });

  it("is a no-op for an empty input", async () => {
    await queueAttempts([]);
    expect(idbStore.get(SYNC_QUEUE_KEY)).toBeUndefined();
  });

  it("trims to MAX_QUEUE_SIZE when overflow occurs in one call", async () => {
    const records = Array.from({ length: MAX_QUEUE_SIZE + 5 }, (_, i) => makeAttempt(i));
    await queueAttempts(records);

    const queue = idbStore.get(SYNC_QUEUE_KEY) as AttemptRecord[];
    expect(queue).toHaveLength(MAX_QUEUE_SIZE);
    // Oldest few are dropped; most recent retained.
    expect(queue.at(-1)?.puzzleId).toBe(`p-${MAX_QUEUE_SIZE + 4}`);
  });
});

describe("fetchRemoteAttempts", () => {
  it("decodes Supabase rows to AttemptRecord[]", async () => {
    selectHandler = () => ({
      data: [
        {
          puzzle_id: "p-1",
          date: "2026-04-22",
          user_move_x: 4,
          user_move_y: 5,
          correct: true,
          // Supabase int8 columns can come back as strings — verify Number() coerces.
          client_solved_at_ms: "1700000000123",
        },
        {
          puzzle_id: "p-pass",
          date: "2026-04-22",
          user_move_x: null,
          user_move_y: null,
          correct: false,
          client_solved_at_ms: 1_700_000_000_456,
        },
      ],
      error: null,
    });

    const records = await fetchRemoteAttempts("user-1");
    expect(records).toHaveLength(2);
    expect(records[0]).toEqual({
      puzzleId: "p-1",
      date: "2026-04-22",
      userMove: { x: 4, y: 5 },
      correct: true,
      solvedAtMs: 1_700_000_000_123,
    });
    // userMove becomes null when either coord column is null
    expect(records[1].userMove).toBeNull();
  });

  it("returns an empty array when the remote responds with no rows", async () => {
    selectHandler = () => ({ data: null, error: null });
    const records = await fetchRemoteAttempts("user-1");
    expect(records).toEqual([]);
  });

  it("throws when the select returns an error", async () => {
    selectHandler = () => ({ data: null, error: { message: "RLS denied" } });
    await expect(fetchRemoteAttempts("user-1")).rejects.toThrow(
      /failed to fetch remote attempts: RLS denied/,
    );
  });
});

describe("flushSyncQueue convenience helper", () => {
  it("returns the number of pushed records and drains the queue", async () => {
    // Seed the queue directly so the helper has something to push.
    idbStore.set(SYNC_QUEUE_KEY, [makeAttempt(1), makeAttempt(2), makeAttempt(3)]);

    const pushed = await flushSyncQueue("user-1");
    expect(pushed).toBe(3);
    expect(idbStore.get(SYNC_QUEUE_KEY)).toBeUndefined();
  });

  it("returns 0 when the queue is empty", async () => {
    const pushed = await flushSyncQueue("user-1");
    expect(pushed).toBe(0);
  });
});

describe("markFailure side-effect on localStorage", () => {
  it("sets a failure marker when the queue is not drained", async () => {
    vi.useFakeTimers();
    const setSpy = vi.spyOn(window.localStorage, "setItem");
    const store = createSyncStorage("user-1");
    await store.saveAttempt(makeAttempt(1));

    upsertHandler = () => ({ error: { message: "down" } });
    const p = store.sync();
    await vi.runAllTimersAsync();
    await p;

    const failedCalls = setSpy.mock.calls.filter(([key]) => key === SYNC_FAILED_STORAGE_KEY);
    expect(failedCalls.length).toBeGreaterThan(0);
  });

  it("clears the failure marker after a successful drain", async () => {
    const removeSpy = vi.spyOn(window.localStorage, "removeItem");
    idbStore.set(SYNC_QUEUE_KEY, [makeAttempt(1)]);

    await flushSyncQueue("user-1");
    expect(removeSpy).toHaveBeenCalledWith(SYNC_FAILED_STORAGE_KEY);
  });
});
