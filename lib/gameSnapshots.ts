import type { Coord, Stone } from "@/types";

import { playMove } from "./goRules";
import { Move } from "./sgf";

export type Snapshot = {
  stones: Stone[];
  lastMove: Coord | null;
  moveNumber: number;
};

/**
 * Build an array of board snapshots from a move sequence.
 * Index 0 is the empty board. Index N is the board after move N.
 * Length = moves.length + 1.
 */
export function buildSnapshots(moves: Move[]): Snapshot[] {
  const snapshots: Snapshot[] = [];

  // Empty board
  snapshots.push({ stones: [], lastMove: null, moveNumber: 0 });

  let board = new Map<string, "black" | "white">();

  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    const result = playMove(board, move);
    board = result.board;

    // Convert board Map to Stone[]
    const stones: Stone[] = [];
    for (const [key, color] of board) {
      const [x, y] = key.split(",").map(Number);
      stones.push({ x, y, color });
    }

    snapshots.push({
      stones,
      lastMove: move.coord,
      moveNumber: i + 1,
    });
  }

  return snapshots;
}
