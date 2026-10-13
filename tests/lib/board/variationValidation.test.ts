import { describe, expect, it } from "vitest";

import { validatePuzzleVariations } from "@/lib/board/variationValidation";
import type { Stone, WrongBranch } from "@/types";

type VariationPuzzle = Parameters<typeof validatePuzzleVariations>[0];

function makePuzzle(overrides: Partial<VariationPuzzle> = {}): VariationPuzzle {
  return { boardSize: 9, stones: [], toPlay: "black", correct: [{ x: 2, y: 2 }], ...overrides };
}

function branch(userWrongMove: WrongBranch["userWrongMove"], refutation: Stone[]): WrongBranch {
  return { userWrongMove, refutation, note: { zh: "说明", en: "Note", ja: "説明", ko: "설명" } };
}

const KO_STONES: Stone[] = [
  { x: 5, y: 5, color: "white" },
  { x: 4, y: 5, color: "black" },
  { x: 6, y: 5, color: "black" },
  { x: 5, y: 6, color: "black" },
  { x: 4, y: 4, color: "white" },
  { x: 6, y: 4, color: "white" },
  { x: 5, y: 3, color: "white" },
];

describe("validatePuzzleVariations", () => {
  it("allows absent optional lines and a legal one-move solution", () => {
    expect(validatePuzzleVariations(makePuzzle())).toEqual({ valid: true, issues: [] });
    expect(
      validatePuzzleVariations(makePuzzle({ solutionSequence: [{ x: 2, y: 2, color: "black" }] })),
    ).toEqual({ valid: true, issues: [] });
  });

  it("rejects accepted points that are occupied on the complete initial board", () => {
    expect(
      validatePuzzleVariations(makePuzzle({ stones: [{ x: 2, y: 2, color: "white" }] })),
    ).toMatchObject({
      valid: false,
      issues: [{ field: "correct", path: "correct[0]", reason: "occupied" }],
    });
  });

  it("rejects an occupied wrong move without replaying its continuation", () => {
    const result = validatePuzzleVariations(
      makePuzzle({
        stones: [{ x: 1, y: 1, color: "black" }],
        wrongBranches: [branch({ x: 1, y: 1 }, [{ x: 2, y: 2, color: "white" }])],
      }),
    );
    expect(result).toMatchObject({
      valid: false,
      issues: [{ path: "wrongBranches[0].userWrongMove", reason: "occupied" }],
    });
    expect(result.issues).toHaveLength(1);
  });

  it("checks the actual board edge when rejecting suicide", () => {
    const result = validatePuzzleVariations(
      makePuzzle({
        stones: [
          { x: 8, y: 9, color: "white" },
          { x: 9, y: 8, color: "white" },
        ],
        wrongBranches: [branch({ x: 9, y: 9 }, [{ x: 2, y: 2, color: "white" }])],
      }),
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({ path: "wrongBranches[0].userWrongMove", reason: "suicide" }),
    );
  });

  it("replays the wrong move before checking a suicidal refutation", () => {
    const result = validatePuzzleVariations(
      makePuzzle({
        stones: [
          { x: 1, y: 2, color: "black" },
          { x: 2, y: 1, color: "black" },
        ],
        wrongBranches: [branch({ x: 3, y: 3 }, [{ x: 1, y: 1, color: "white" }])],
      }),
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({ path: "wrongBranches[0].refutation[0]", reason: "suicide" }),
    );
  });

  it("permits reusing a captured point later in a legal main line", () => {
    expect(
      validatePuzzleVariations(
        makePuzzle({
          stones: KO_STONES,
          correct: [{ x: 5, y: 4 }],
          solutionSequence: [
            { x: 5, y: 4, color: "black" },
            { x: 8, y: 8, color: "white" },
            { x: 5, y: 5, color: "black" },
          ],
        }),
      ),
    ).toEqual({ valid: true, issues: [] });
  });

  it("does not mutate the input or share replay state between independent branches", () => {
    const puzzle = makePuzzle({
      wrongBranches: [
        branch({ x: 3, y: 3 }, [{ x: 4, y: 4, color: "white" }]),
        branch({ x: 3, y: 3 }, [{ x: 4, y: 4, color: "white" }]),
      ],
    });
    const before = JSON.stringify(puzzle);
    expect(validatePuzzleVariations(puzzle)).toEqual({ valid: true, issues: [] });
    expect(JSON.stringify(puzzle)).toBe(before);
  });

  it("requires the main line to begin with the given side to play and alternate", () => {
    expect(
      validatePuzzleVariations(makePuzzle({ solutionSequence: [{ x: 2, y: 2, color: "white" }] }))
        .issues,
    ).toContainEqual(
      expect.objectContaining({
        path: "solutionSequence[0]",
        reason: "wrong_turn",
        expectedColor: "black",
      }),
    );
    expect(
      validatePuzzleVariations(
        makePuzzle({
          solutionSequence: [
            { x: 2, y: 2, color: "black" },
            { x: 3, y: 3, color: "black" },
          ],
        }),
      ).issues,
    ).toContainEqual(
      expect.objectContaining({
        path: "solutionSequence[1]",
        reason: "wrong_turn",
        expectedColor: "white",
      }),
    );
  });

  it("requires the opponent to answer the user's wrong move", () => {
    expect(
      validatePuzzleVariations(
        makePuzzle({ wrongBranches: [branch({ x: 3, y: 3 }, [{ x: 4, y: 4, color: "black" }])] }),
      ).issues,
    ).toContainEqual(
      expect.objectContaining({
        path: "wrongBranches[0].refutation[0]",
        reason: "wrong_turn",
        expectedColor: "white",
      }),
    );
  });

  it("rejects immediate ko recapture in both main and wrong lines", () => {
    const recapture = { x: 5, y: 5, color: "white" } as const;
    expect(
      validatePuzzleVariations(
        makePuzzle({
          stones: KO_STONES,
          correct: [{ x: 5, y: 4 }],
          solutionSequence: [{ x: 5, y: 4, color: "black" }, recapture],
        }),
      ).issues,
    ).toContainEqual(expect.objectContaining({ path: "solutionSequence[1]", reason: "ko" }));
    expect(
      validatePuzzleVariations(
        makePuzzle({ stones: KO_STONES, wrongBranches: [branch({ x: 5, y: 4 }, [recapture])] }),
      ).issues,
    ).toContainEqual(
      expect.objectContaining({ path: "wrongBranches[0].refutation[0]", reason: "ko" }),
    );
  });

  it("rejects out-of-bounds moves and occupied continuation points", () => {
    expect(
      validatePuzzleVariations(
        makePuzzle({ wrongBranches: [branch({ x: 10, y: 1 }, [{ x: 4, y: 4, color: "white" }])] }),
      ).issues,
    ).toContainEqual(
      expect.objectContaining({ path: "wrongBranches[0].userWrongMove", reason: "out_of_bounds" }),
    );
    expect(
      validatePuzzleVariations(
        makePuzzle({ wrongBranches: [branch({ x: 3, y: 3 }, [{ x: 3, y: 3, color: "white" }])] }),
      ).issues,
    ).toContainEqual(
      expect.objectContaining({ path: "wrongBranches[0].refutation[0]", reason: "occupied" }),
    );
  });

  it("rejects solution starts outside the accepted answers and accepted moves labeled wrong", () => {
    const result = validatePuzzleVariations(
      makePuzzle({
        solutionSequence: [{ x: 3, y: 3, color: "black" }],
        wrongBranches: [branch({ x: 2, y: 2 }, [{ x: 4, y: 4, color: "white" }])],
      }),
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({ reason: "unaccepted_solution_start" }),
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({ reason: "accepted_wrong_move" }),
    );
  });

  it("does not treat an empty refutation as variation support", () => {
    expect(
      validatePuzzleVariations(makePuzzle({ wrongBranches: [branch({ x: 3, y: 3 }, [])] })).issues,
    ).toContainEqual(
      expect.objectContaining({ path: "wrongBranches[0].refutation", reason: "empty_refutation" }),
    );
  });
});
