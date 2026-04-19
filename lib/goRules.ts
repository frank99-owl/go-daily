import type { Color, Coord } from "@/types";
import { Move } from "./sgf";

function keyOf(c: Coord): string {
  return `${c.x},${c.y}`;
}

function coordFromKey(k: string): Coord {
  const [x, y] = k.split(",").map(Number);
  return { x, y };
}

/**
 * Flood-fill a group of the same color starting from `start`.
 * Returns the group (list of keys) and the set of liberty keys.
 */
function floodFill(
  board: Map<string, Color>,
  start: Coord,
  color: Color,
): { group: string[]; liberties: Set<string> } {
  const group: string[] = [];
  const liberties = new Set<string>();
  const visited = new Set<string>();
  const queue: Coord[] = [start];

  while (queue.length > 0) {
    const c = queue.pop()!;
    const k = keyOf(c);
    if (visited.has(k)) continue;
    visited.add(k);

    const here = board.get(k);
    if (here === color) {
      group.push(k);
      // Explore 4 neighbors
      const neighbors: Coord[] = [
        { x: c.x + 1, y: c.y },
        { x: c.x - 1, y: c.y },
        { x: c.x, y: c.y + 1 },
        { x: c.x, y: c.y - 1 },
      ];
      for (const n of neighbors) {
        if (n.x >= 0 && n.x < 19 && n.y >= 0 && n.y < 19) {
          const nk = keyOf(n);
          if (!visited.has(nk)) {
            queue.push(n);
          }
        }
      }
    } else if (here === undefined) {
      liberties.add(k);
    }
    // else: opposite color — wall, do nothing
  }

  return { group, liberties };
}

/**
 * Play a move on the board and resolve captures.
 * Suicide is not checked (professional games don't have suicide moves).
 */
export function playMove(
  board: Map<string, Color>,
  move: Move,
): { board: Map<string, Color>; captured: Coord[] } {
  const placed = new Map(board);
  const moveKey = keyOf(move.coord);
  placed.set(moveKey, move.color);

  const opposite: Color = move.color === "black" ? "white" : "black";
  const captured: Coord[] = [];

  // Check each 4-neighbor of the placed stone
  const neighbors: Coord[] = [
    { x: move.coord.x + 1, y: move.coord.y },
    { x: move.coord.x - 1, y: move.coord.y },
    { x: move.coord.x, y: move.coord.y + 1 },
    { x: move.coord.x, y: move.coord.y - 1 },
  ];

  for (const n of neighbors) {
    if (n.x < 0 || n.x >= 19 || n.y < 0 || n.y >= 19) continue;
    const nk = keyOf(n);
    if (placed.get(nk) !== opposite) continue;

    const { group, liberties } = floodFill(placed, n, opposite);
    if (liberties.size === 0) {
      for (const g of group) {
        placed.delete(g);
        captured.push(coordFromKey(g));
      }
    }
  }

  return { board: placed, captured };
}
