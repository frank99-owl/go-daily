import { describe, expect, it, vi } from "vitest";

import { syncAndReadDueSrsItems } from "@/lib/reviewSrs";
import type { PuzzleSummary } from "@/types";

type QueryResult = { data?: unknown; error?: { message: string } | null };

function query(result: QueryResult) {
  const q: Record<string, unknown> = {
    select: vi.fn(() => q),
    eq: vi.fn(() => q),
    order: vi.fn(() => q),
    limit: vi.fn(() => Promise.resolve(result)),
    upsert: vi.fn(() => Promise.resolve(result)),
    then: (resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return q;
}

function summary(id: string): PuzzleSummary {
  return {
    id,
    difficulty: 1,
    source: "test",
    date: "2026-04-24",
    prompt: {
      zh: id,
      en: id,
      ja: id,
      ko: id,
    },
    isCurated: true,
    boardSize: 9,
    tag: "life-death",
  };
}

function epoch(iso: string): number {
  return new Date(iso).getTime();
}

type SupabaseParam = Parameters<typeof syncAndReadDueSrsItems>[0]["supabase"];

describe("syncAndReadDueSrsItems", () => {
  it("rebuilds missing SRS cards from attempts and returns only due known puzzles", async () => {
    const attempts = query({
      data: [
        {
          puzzle_id: "p1",
          correct: false,
          client_solved_at_ms: epoch("2026-04-23T00:00:00.000Z"),
        },
        {
          puzzle_id: "p2",
          correct: true,
          client_solved_at_ms: epoch("2026-04-23T01:00:00.000Z"),
        },
        {
          puzzle_id: "unknown",
          correct: false,
          client_solved_at_ms: epoch("2026-04-23T02:00:00.000Z"),
        },
      ],
      error: null,
    });
    const cards = query({
      data: [
        {
          puzzle_id: "p3",
          ease_factor: "2.3",
          interval_days: 3,
          due_date: "2026-04-20",
          last_reviewed_at: "2026-04-17T00:00:00.000Z",
        },
        {
          puzzle_id: "p4",
          ease_factor: "2.5",
          interval_days: 1,
          due_date: "2026-04-30",
          last_reviewed_at: "2026-04-23T00:00:00.000Z",
        },
      ],
      error: null,
    });
    const upsert = query({ error: null });
    const from = vi
      .fn()
      .mockReturnValueOnce(attempts)
      .mockReturnValueOnce(cards)
      .mockReturnValueOnce(upsert);

    const items = await syncAndReadDueSrsItems({
      supabase: { from } as unknown as SupabaseParam,
      userId: "user_1",
      summaries: [summary("p1"), summary("p2"), summary("p3"), summary("p4")],
      timeZone: "UTC",
      now: new Date("2026-04-24T12:00:00.000Z"),
    });

    expect(upsert.upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          user_id: "user_1",
          puzzle_id: "p1",
          interval_days: 0,
          due_date: "2026-04-23",
          last_reviewed_at: "2026-04-23T00:00:00.000Z",
        }),
      ],
      { onConflict: "user_id,puzzle_id" },
    );
    expect(items.map((item) => item.puzzleId)).toEqual(["p3", "p1"]);
    expect(items.find((item) => item.puzzleId === "p1")).toMatchObject({
      attemptCount: 1,
      lastAttemptedMs: epoch("2026-04-23T00:00:00.000Z"),
    });
  });

  it("advances an existing card when a newer correct attempt has not been applied", async () => {
    const attempts = query({
      data: [
        {
          puzzle_id: "p1",
          correct: true,
          client_solved_at_ms: epoch("2026-04-24T00:00:00.000Z"),
        },
      ],
      error: null,
    });
    const cards = query({
      data: [
        {
          puzzle_id: "p1",
          ease_factor: "2.18",
          interval_days: 0,
          due_date: "2026-04-23",
          last_reviewed_at: "2026-04-23T00:00:00.000Z",
        },
      ],
      error: null,
    });
    const upsert = query({ error: null });
    const from = vi
      .fn()
      .mockReturnValueOnce(attempts)
      .mockReturnValueOnce(cards)
      .mockReturnValueOnce(upsert);

    const items = await syncAndReadDueSrsItems({
      supabase: { from } as unknown as SupabaseParam,
      userId: "user_1",
      summaries: [summary("p1")],
      timeZone: "UTC",
      now: new Date("2026-04-24T12:00:00.000Z"),
    });

    expect(upsert.upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          puzzle_id: "p1",
          interval_days: 1,
          due_date: "2026-04-25",
          last_reviewed_at: "2026-04-24T00:00:00.000Z",
        }),
      ],
      { onConflict: "user_id,puzzle_id" },
    );
    expect(items).toEqual([]);
  });
});
