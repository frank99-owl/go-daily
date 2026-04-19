import { describe, it, expect } from "vitest";
import { judgeMove } from "./judge";
import type { Puzzle } from "@/types";

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
