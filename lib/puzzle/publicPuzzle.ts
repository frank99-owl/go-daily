import { getCoachAccess } from "@/lib/coach/coachAccess";
import type { PublicPuzzle, Puzzle } from "@/types";

export function toPublicPuzzle(puzzle: Puzzle): PublicPuzzle {
  return {
    id: puzzle.id,
    date: puzzle.date,
    boardSize: puzzle.boardSize,
    stones: puzzle.stones,
    toPlay: puzzle.toPlay,
    tag: puzzle.tag,
    difficulty: puzzle.difficulty,
    prompt: puzzle.prompt,
    source: puzzle.source ?? puzzle.date,
    coachAvailable: getCoachAccess(puzzle).available,
  };
}
