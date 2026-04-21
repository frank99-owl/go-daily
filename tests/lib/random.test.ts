import { describe, expect, it } from "vitest";

import { pickRandomPuzzle } from "@/lib/random";
import type { AttemptRecord } from "@/types";

describe("random", () => {
  const puzzles = [{ id: "p1" }, { id: "p2" }, { id: "p3" }];

  const attempts: AttemptRecord[] = [
    {
      puzzleId: "p1",
      date: "2026-04-21",
      userMove: { x: 0, y: 0 },
      correct: true,
      solvedAtMs: 1,
    }, // p1 solved
    {
      puzzleId: "p2",
      date: "2026-04-21",
      userMove: { x: 1, y: 1 },
      correct: false,
      solvedAtMs: 2,
    }, // p2 attempted (wrong)
    // p3 unattempted
  ];

  it("returns a puzzle from 'all'", () => {
    const p = pickRandomPuzzle(puzzles, attempts, "all");
    expect(p).not.toBeNull();
    expect(puzzles.map((x) => x.id)).toContain(p!.id);
  });

  it("returns from 'unattempted'", () => {
    const p = pickRandomPuzzle(puzzles, attempts, "unattempted");
    expect(p?.id).toBe("p3");
  });

  it("returns from 'wrong'", () => {
    const p = pickRandomPuzzle(puzzles, attempts, "wrong");
    expect(p?.id).toBe("p2");
  });

  it("returns null if pool is empty", () => {
    const noMistakesAttempts: AttemptRecord[] = [];
    const p = pickRandomPuzzle(puzzles, noMistakesAttempts, "wrong");
    expect(p).toBeNull();
  });
});
