import * as idb from "idb-keyval";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { createSyncStorage, SYNC_QUEUE_KEY } from "../../../lib/storage/syncStorage";

// Mock dependencies
vi.mock("idb-keyval", () => {
  let store: Record<string, unknown> = {};
  return {
    get: vi.fn(async (key) => store[key]),
    set: vi.fn(async (key, val) => {
      store[key] = val;
    }),
    del: vi.fn(async (key) => {
      delete store[key];
    }),
    _reset: () => {
      store = {};
    },
  };
});

vi.mock("../../../lib/storage/storage", () => ({
  loadAttempts: vi.fn(() => []),
  replaceAttempts: vi.fn(),
  saveAttempt: vi.fn(),
}));

const mockUpsert = vi.fn();
const mockSelect = vi.fn();

vi.mock("../../../lib/supabase/client", () => ({
  createClient: vi.fn(() => ({
    from: vi.fn((table) => {
      if (table === "srs_cards") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      if (table === "attempts") {
        return {
          upsert: mockUpsert,
          select: mockSelect,
        };
      }
      return {};
    }),
  })),
}));

describe("SyncStorage Queue & Backoff Mechanism", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    (idb as typeof idb & { _reset: () => void })._reset();

    // Default mocks
    mockUpsert.mockResolvedValue({ error: null });
    mockSelect.mockReturnValue({
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const dummyAttempt = {
    puzzleId: "p1",
    date: "2023-10-01",
    userMove: { x: 1, y: 1 },
    correct: true,
    solvedAtMs: 1696118400000,
  };

  it("queues attempt and flushes on success", async () => {
    const storage = createSyncStorage("user_123");

    await storage.saveAttempt(dummyAttempt);

    const queue = await idb.get(SYNC_QUEUE_KEY);
    expect(queue).toHaveLength(1);
    expect(queue[0].puzzleId).toBe("p1");

    await vi.runAllTimersAsync();

    expect(mockUpsert).toHaveBeenCalledTimes(1);

    const queueAfter = await idb.get(SYNC_QUEUE_KEY);
    expect(queueAfter).toBeUndefined();
  });

  it("backs off on failure and eventually succeeds", async () => {
    const storage = createSyncStorage("user_123");

    // Fails twice, succeeds on the 3rd
    mockUpsert
      .mockResolvedValueOnce({ error: { message: "Network error 1" } })
      .mockResolvedValueOnce({ error: { message: "Network error 2" } })
      .mockResolvedValue({ error: null });

    await storage.saveAttempt(dummyAttempt);

    // Trigger debounce timer (500ms)
    await vi.advanceTimersByTimeAsync(500);

    // Initial upsert resolves with error
    await vi.advanceTimersByTimeAsync(1);

    // 1st retry sleep (1000ms)
    await vi.advanceTimersByTimeAsync(1000);

    // 2nd retry sleep (2000ms)
    await vi.advanceTimersByTimeAsync(2000);

    // Flush everything
    await vi.runAllTimersAsync();

    expect(mockUpsert).toHaveBeenCalledTimes(3);

    const queueAfter = await idb.get(SYNC_QUEUE_KEY);
    expect(queueAfter).toBeUndefined();
  });

  it("stops retrying after MAX_RETRIES limit", async () => {
    const storage = createSyncStorage("user_123");

    // Always fail
    mockUpsert.mockResolvedValue({ error: { message: "Persistent network error" } });

    await storage.saveAttempt(dummyAttempt);

    // Keep advancing timers until all retries are exhausted
    await vi.runAllTimersAsync();
    // In vitest fake timers, runAllTimersAsync handles all chained setTimeout/promises recursively

    // 10 max retries + 1 initial attempt = 10 total executions of the loop block
    // Wait, the while loop is `while (attempt < MAX_RETRIES)`.
    // attempt starts at 0. 0 -> 1 -> ... -> 9. That's 10 iterations.
    // Each iteration calls `upsert`.
    expect(mockUpsert).toHaveBeenCalledTimes(10);

    // Queue should retain the unsynced item
    const queueAfter = await idb.get(SYNC_QUEUE_KEY);
    expect(queueAfter).toHaveLength(1);
  });
});
