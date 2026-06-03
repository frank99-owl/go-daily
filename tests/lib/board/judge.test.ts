import { describe, expect, it } from "vitest";

import { judgeMove } from "@/lib/board/judge";
import type { Puzzle } from "@/types";

function makePuzzle(correct: Array<{ x: number; y: number }>): Puzzle {
  return {
    id: "test-1",
    boardSize: 19,
    stones: [],
    correct,
    difficulty: 1,
    source: "test",
    tags: [],
  } as Puzzle;
}

describe("judgeMove", () => {
  it("returns true when move matches a correct coord", () => {
    const puzzle = makePuzzle([{ x: 3, y: 3 }]);
    expect(judgeMove(puzzle, { x: 3, y: 3 })).toBe(true);
  });

  it("returns false when move does not match", () => {
    const puzzle = makePuzzle([{ x: 3, y: 3 }]);
    expect(judgeMove(puzzle, { x: 4, y: 4 })).toBe(false);
  });

  it("returns true when move matches any correct coord", () => {
    const puzzle = makePuzzle([
      { x: 3, y: 3 },
      { x: 5, y: 5 },
    ]);
    expect(judgeMove(puzzle, { x: 5, y: 5 })).toBe(true);
  });

  it("returns false for empty correct array", () => {
    const puzzle = makePuzzle([]);
    expect(judgeMove(puzzle, { x: 0, y: 0 })).toBe(false);
  });
});
