import { describe, expect, it } from "vitest";

import { getResultUnderstanding, type ResultUnderstandingInput } from "@/lib/puzzle/mistakeReason";

const baseInput: ResultUnderstandingInput = {
  tag: "life-death",
  difficulty: 1,
  boardSize: 9,
  stones: [],
  correctMoves: [{ x: 2, y: 2 }],
  userMove: { x: 4, y: 4 },
  correct: false,
};

function reason(overrides: Partial<ResultUnderstandingInput>) {
  return getResultUnderstanding({ ...baseInput, ...overrides });
}

describe("getResultUnderstanding", () => {
  it("does not classify a correct move as a mistake", () => {
    expect(reason({ correct: true, tag: "life-death", difficulty: 1 })).toEqual({
      id: "liberty-counting",
      mode: "training",
      confidence: "medium",
    });
  });

  it("classifies endgame puzzles as endgame value", () => {
    expect(reason({ tag: "endgame" })).toEqual({
      id: "endgame-value",
      mode: "mistake",
      confidence: "high",
    });
  });

  it("classifies opening puzzles as opening direction", () => {
    expect(reason({ tag: "opening" })).toEqual({
      id: "opening-direction",
      mode: "mistake",
      confidence: "high",
    });
  });

  it("classifies near misses around a correct point as missed vital point", () => {
    expect(reason({ correctMoves: [{ x: 1, y: 1 }], userMove: { x: 1, y: 2 } })).toEqual({
      id: "missed-vital-point",
      mode: "mistake",
      confidence: "high",
    });
  });

  it("classifies life-and-death misses away from the point as liberty counting", () => {
    expect(
      reason({
        tag: "life-death",
        difficulty: 2,
        correctMoves: [{ x: 1, y: 1 }],
        userMove: { x: 6, y: 6 },
      }),
    ).toEqual({
      id: "liberty-counting",
      mode: "mistake",
      confidence: "medium",
    });
  });

  it("classifies tesuji misses away from the point as shape reading", () => {
    expect(reason({ tag: "tesuji", userMove: { x: 6, y: 6 } })).toEqual({
      id: "shape-reading",
      mode: "mistake",
      confidence: "medium",
    });
  });

  it("falls back conservatively when there is no user move", () => {
    expect(reason({ userMove: null })).toEqual({
      id: "shape-reading",
      mode: "mistake",
      confidence: "low",
    });
  });
});
