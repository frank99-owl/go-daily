import type { Coord, PuzzleTag, Stone } from "@/types";

export const MISTAKE_REASON_IDS = [
  "missed-vital-point",
  "shape-reading",
  "liberty-counting",
  "endgame-value",
  "opening-direction",
] as const;

export type MistakeReasonId = (typeof MISTAKE_REASON_IDS)[number];
export type MistakeReasonConfidence = "high" | "medium" | "low";
export type ResultUnderstandingMode = "mistake" | "training";

export type ResultUnderstanding = {
  id: MistakeReasonId;
  mode: ResultUnderstandingMode;
  confidence: MistakeReasonConfidence;
};

export type ResultUnderstandingInput = {
  tag: PuzzleTag;
  difficulty: 1 | 2 | 3 | 4 | 5;
  boardSize: 9 | 13 | 19;
  stones: Stone[];
  correctMoves: Coord[];
  userMove: Coord | null;
  correct: boolean;
};

function distance(a: Coord, b: Coord): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function isNearEdge(coord: Coord, boardSize: number): boolean {
  return coord.x <= 1 || coord.y <= 1 || coord.x >= boardSize - 2 || coord.y >= boardSize - 2;
}

function isNearCorner(coord: Coord, boardSize: number): boolean {
  const low = coord.x <= 3 && coord.y <= 3;
  const topRight = coord.x >= boardSize - 4 && coord.y <= 3;
  const bottomLeft = coord.x <= 3 && coord.y >= boardSize - 4;
  const high = coord.x >= boardSize - 4 && coord.y >= boardSize - 4;
  return low || topRight || bottomLeft || high;
}

function firstCorrectMove(correctMoves: Coord[]): Coord | null {
  return correctMoves[0] ?? null;
}

function topicForTag(input: ResultUnderstandingInput): ResultUnderstanding {
  const correctMove = firstCorrectMove(input.correctMoves);
  const confidence: MistakeReasonConfidence = correctMove ? "medium" : "low";

  switch (input.tag) {
    case "endgame":
      return { id: "endgame-value", mode: "training", confidence: "high" };
    case "opening":
      return { id: "opening-direction", mode: "training", confidence: "high" };
    case "tesuji":
      return { id: "shape-reading", mode: "training", confidence };
    case "life-death":
      return {
        id: input.difficulty <= 2 ? "liberty-counting" : "shape-reading",
        mode: "training",
        confidence,
      };
  }
}

export function getResultUnderstanding(input: ResultUnderstandingInput): ResultUnderstanding {
  if (input.correct) {
    return topicForTag(input);
  }

  const correctMove = firstCorrectMove(input.correctMoves);
  if (!input.userMove || !correctMove) {
    return { id: "shape-reading", mode: "mistake", confidence: "low" };
  }

  if (input.tag === "endgame") {
    return { id: "endgame-value", mode: "mistake", confidence: "high" };
  }

  if (input.tag === "opening") {
    return { id: "opening-direction", mode: "mistake", confidence: "high" };
  }

  const moveDistance = distance(input.userMove, correctMove);
  const nearCorrectPoint = moveDistance <= 1;
  const correctPointIsLocalUrgent =
    isNearEdge(correctMove, input.boardSize) || isNearCorner(correctMove, input.boardSize);

  if (nearCorrectPoint) {
    return {
      id: "missed-vital-point",
      mode: "mistake",
      confidence: correctPointIsLocalUrgent ? "high" : "medium",
    };
  }

  if (input.tag === "life-death") {
    return {
      id: input.difficulty <= 3 ? "liberty-counting" : "shape-reading",
      mode: "mistake",
      confidence: "medium",
    };
  }

  if (input.tag === "tesuji") {
    return { id: "shape-reading", mode: "mistake", confidence: "medium" };
  }

  return { id: "shape-reading", mode: "mistake", confidence: "low" };
}
