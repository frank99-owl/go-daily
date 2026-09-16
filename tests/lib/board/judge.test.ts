import { describe, expect, it } from "vitest";

import { judgeMove } from "@/lib/board/judge";
import type { Puzzle } from "@/types";

function makePuzzle(correct: Array<{ x: number; y: number }>): Puzzle {
  return {
    id: "test-1",
    date: "2026-01-01",
    boardSize: 19,
    stones: [],
    toPlay: "black",
    correct,
    tag: "life-death",
    difficulty: 2,
    source: "test",
    prompt: { zh: "", en: "", ja: "", ko: "" },
    solutionNote: { zh: "", en: "", ja: "", ko: "" },
  } as Puzzle;
}

describe("judgeMove", () => {
  it("returns true when move matches a correct coord", () => {
    const puzzle = makePuzzle([{ x: 4, y: 4 }]);
    expect(judgeMove(puzzle, { x: 4, y: 4 })).toBe(true);
  });

  it("returns false when move does not match", () => {
    const puzzle = makePuzzle([{ x: 4, y: 4 }]);
    expect(judgeMove(puzzle, { x: 5, y: 5 })).toBe(false);
  });

  it("returns true when move matches any correct coord", () => {
    const puzzle = makePuzzle([
      { x: 4, y: 4 },
      { x: 6, y: 6 },
    ]);
    expect(judgeMove(puzzle, { x: 6, y: 6 })).toBe(true);
  });

  it("returns false for empty correct array", () => {
    const puzzle = makePuzzle([]);
    expect(judgeMove(puzzle, { x: 1, y: 1 })).toBe(false);
  });
});

// ---- Merged from the former co-located lib/board/judge.test.ts (2026-09-16) ----

const mockPuzzle: Puzzle = {
  id: "test-1",
  date: "2026-04-20",
  boardSize: 9,
  stones: [{ x: 3, y: 3, color: "black" }],
  toPlay: "white",
  correct: [{ x: 4, y: 4 }],
  tag: "life-death",
  difficulty: 2,
  prompt: { zh: "测试", en: "Test", ja: "テスト", ko: "테스트" },
  solutionNote: { zh: "笔记", en: "Note", ja: "ノート", ko: "노트" },
};

describe("judgeMove", () => {
  it("returns true for correct move", () => {
    expect(judgeMove(mockPuzzle, { x: 4, y: 4 })).toBe(true);
  });
  it("returns false for wrong move", () => {
    expect(judgeMove(mockPuzzle, { x: 0, y: 0 })).toBe(false);
  });
  it("handles multiple correct answers", () => {
    const multi: Puzzle = {
      ...mockPuzzle,
      correct: [
        { x: 4, y: 4 },
        { x: 5, y: 5 },
      ],
    };
    expect(judgeMove(multi, { x: 5, y: 5 })).toBe(true);
    expect(judgeMove(multi, { x: 0, y: 0 })).toBe(false);
  });
});
