import { playMove, type BoardSize } from "@/lib/board/goRules";
import { Move } from "@/lib/board/sgf";
import type { Coord, Stone } from "@/types";

export type Snapshot = {
  stones: Stone[];
  lastMove: Coord | null;
  moveNumber: number;
};

/**
 * Build an array of board snapshots from a move sequence.
 * Index 0 is the empty board. Index N is the board after move N.
 * Length = moves.length + 1.
 *
 * `boardSize` defaults to 19 to preserve legacy 19×19 SGF replay behavior;
 * pass 9 or 13 when replaying tsumego moves on smaller boards so edge
 * captures resolve correctly.
 */
export function buildSnapshots(moves: Move[], boardSize: BoardSize = 19): Snapshot[] {
  const snapshots: Snapshot[] = [];

  // Empty board
  snapshots.push({ stones: [], lastMove: null, moveNumber: 0 });

  let board = new Map<string, "black" | "white">();

  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    const result = playMove(board, move, { boardSize });
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
