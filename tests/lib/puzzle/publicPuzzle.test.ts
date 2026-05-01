import { describe, expect, it } from "vitest";

import { toPublicPuzzle } from "@/lib/puzzle/publicPuzzle";
import type { Puzzle } from "@/types";

const puzzle: Puzzle = {
  id: "dto-001",
  date: "2026-04-21",
  boardSize: 9,
  stones: [{ x: 3, y: 3, color: "black" }],
  toPlay: "white",
  correct: [{ x: 4, y: 4 }],
  solutionSequence: [{ x: 4, y: 4, color: "white" }],
  wrongBranches: [
    {
      userWrongMove: { x: 0, y: 0 },
      refutation: [{ x: 1, y: 1, color: "black" }],
      note: {
        zh: "错分支",
        en: "Wrong branch",
        ja: "誤りの分岐",
        ko: "잘못된 분기",
      },
    },
  ],
  tag: "life-death",
  difficulty: 2,
  prompt: {
    zh: "白先",
    en: "White to play",
    ja: "白番",
    ko: "백 차례",
  },
  solutionNote: {
    zh: "答案解析",
    en: "Solution note",
    ja: "解説",
    ko: "해설",
  },
  source: "Classical",
};

describe("toPublicPuzzle", () => {
  it("serializes only public puzzle fields", () => {
    const publicPuzzle = toPublicPuzzle(puzzle);

    expect(publicPuzzle).toMatchObject({
      id: "dto-001",
      date: "2026-04-21",
      boardSize: 9,
      stones: [{ x: 3, y: 3, color: "black" }],
      toPlay: "white",
      tag: "life-death",
      difficulty: 2,
      prompt: puzzle.prompt,
      source: "Classical",
      coachAvailable: false,
    });
    expect(publicPuzzle).not.toHaveProperty("correct");
    expect(publicPuzzle).not.toHaveProperty("solutionNote");
    expect(publicPuzzle).not.toHaveProperty("solutionSequence");
    expect(publicPuzzle).not.toHaveProperty("wrongBranches");
  });
});
