import type { Puzzle, Stone } from "@/types";

import { computeCropWindow, fullWindow } from "./board";

type BoardDisplayInput = Pick<Puzzle, "boardSize" | "stones">;

export function isCroppedBoardWindow(size: 9 | 13 | 19, stones: Stone[]): boolean {
  const full = fullWindow(size);
  const win = computeCropWindow(size, stones);
  return (
    win.xMin !== full.xMin ||
    win.xMax !== full.xMax ||
    win.yMin !== full.yMin ||
    win.yMax !== full.yMax
  );
}

export function isLocalBoardDisplay(puzzle: BoardDisplayInput): boolean {
  return puzzle.boardSize === 19 && isCroppedBoardWindow(puzzle.boardSize, puzzle.stones);
}
