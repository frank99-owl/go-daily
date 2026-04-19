import type { Coord } from "@/types";

export type Move = { color: "black" | "white"; coord: Coord };

// SGF-ish coord "eb" → { x: 4, y: 1 }  (a=0, b=1, ..., s=18)
function sgfToCoord(s: string): Coord {
  return { x: s.charCodeAt(0) - 97, y: s.charCodeAt(1) - 97 };
}

/**
 * Parse only the main-line move sequence from an SGF string.
 * Ignores branches, comments, and all other properties.
 */
export function parseSgfMoves(sgf: string): Move[] {
  const moves: Move[] = [];
  // Match ;B[xx] or ;W[xx] anywhere in the string
  const re = /;([BW])\[([a-z]{2})\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sgf)) !== null) {
    const color = m[1] === "B" ? "black" : "white";
    const coord = sgfToCoord(m[2]);
    moves.push({ color, coord });
  }
  return moves;
}
