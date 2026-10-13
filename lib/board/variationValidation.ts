import type { Color, Puzzle, Stone } from "@/types";

import { isLegalMove, playMove, type GoBoard } from "./goRules";

type VariationPuzzle = Pick<
  Puzzle,
  "boardSize" | "stones" | "toPlay" | "correct" | "solutionSequence" | "wrongBranches"
>;

type IllegalMoveReason = Extract<ReturnType<typeof isLegalMove>, { legal: false }>["reason"];

export interface PuzzleVariationIssue {
  field: "correct" | "solutionSequence" | "wrongBranches";
  path: string;
  reason:
    | IllegalMoveReason
    | "wrong_turn"
    | "unaccepted_solution_start"
    | "accepted_wrong_move"
    | "empty_refutation";
  move?: Stone;
  expectedColor?: Color;
}

export interface PuzzleVariationValidation {
  valid: boolean;
  issues: PuzzleVariationIssue[];
}

function replayLine(
  puzzle: VariationPuzzle,
  moves: Stone[],
  field: PuzzleVariationIssue["field"],
  stepPath: (index: number) => string,
  issues: PuzzleVariationIssue[],
): void {
  let board: GoBoard = new Map(
    puzzle.stones.map((stone) => [`${stone.x},${stone.y}`, stone.color]),
  );
  let previousBoard: GoBoard | null = null;
  let expectedColor = puzzle.toPlay;

  for (let index = 0; index < moves.length; index++) {
    const stone = moves[index];
    const path = stepPath(index);
    if (stone.color !== expectedColor) {
      issues.push({ field, path, reason: "wrong_turn", move: stone, expectedColor });
      return;
    }

    const move = { coord: { x: stone.x, y: stone.y }, color: stone.color };
    const legality = isLegalMove(board, move, { boardSize: puzzle.boardSize, previousBoard });
    if (!legality.legal) {
      issues.push({ field, path, reason: legality.reason, move: stone });
      // Later moves have no meaningful position after an illegal step.
      return;
    }

    const after = playMove(board, move, { boardSize: puzzle.boardSize });
    previousBoard = board;
    board = after.board;
    expectedColor = expectedColor === "black" ? "white" : "black";
  }
}

/**
 * Replay every supplied line from the complete initial position. This checks
 * playable moves, alternating turns and immediate ko within the supplied line;
 * it does not establish that a legal line solves or refutes the puzzle.
 * Missing optional lines are allowed, and a legal one-move solution is valid.
 */
export function validatePuzzleVariations(puzzle: VariationPuzzle): PuzzleVariationValidation {
  const issues: PuzzleVariationIssue[] = [];
  const initial: GoBoard = new Map(
    puzzle.stones.map((stone) => [`${stone.x},${stone.y}`, stone.color]),
  );
  for (const [index, point] of puzzle.correct.entries()) {
    const move = { ...point, color: puzzle.toPlay };
    const legality = isLegalMove(
      initial,
      { coord: point, color: puzzle.toPlay },
      { boardSize: puzzle.boardSize },
    );
    if (!legality.legal) {
      issues.push({ field: "correct", path: `correct[${index}]`, reason: legality.reason, move });
    }
  }

  const solution = puzzle.solutionSequence ?? [];
  if (solution.length > 0) {
    const first = solution[0];
    if (!puzzle.correct.some((point) => point.x === first.x && point.y === first.y)) {
      issues.push({
        field: "solutionSequence",
        path: "solutionSequence[0]",
        reason: "unaccepted_solution_start",
        move: first,
      });
    }
    replayLine(
      puzzle,
      solution,
      "solutionSequence",
      (index) => `solutionSequence[${index}]`,
      issues,
    );
  }

  for (const [index, branch] of (puzzle.wrongBranches ?? []).entries()) {
    const prefix = `wrongBranches[${index}]`;
    const first = { ...branch.userWrongMove, color: puzzle.toPlay };
    if (puzzle.correct.some((point) => point.x === first.x && point.y === first.y)) {
      issues.push({
        field: "wrongBranches",
        path: `${prefix}.userWrongMove`,
        reason: "accepted_wrong_move",
        move: first,
      });
    }
    if (branch.refutation.length === 0) {
      issues.push({
        field: "wrongBranches",
        path: `${prefix}.refutation`,
        reason: "empty_refutation",
      });
    }
    replayLine(
      puzzle,
      [first, ...branch.refutation],
      "wrongBranches",
      (step) => (step === 0 ? `${prefix}.userWrongMove` : `${prefix}.refutation[${step - 1}]`),
      issues,
    );
  }

  return { valid: issues.length === 0, issues };
}
