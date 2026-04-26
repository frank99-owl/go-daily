import type { Coord, Puzzle } from "@/types";

import { coordEquals } from "./board";

export function judgeMove(puzzle: Puzzle, move: Coord): boolean {
  return puzzle.correct.some((c) => coordEquals(c, move));
}
