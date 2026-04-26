import type { Color, Coord } from "@/types";

import { Move } from "./sgf";

export type BoardSize = 9 | 13 | 19;
export type GoBoard = Map<string, Color>;

export type PlayMoveOptions = {
  /** Board edge. Defaults to 19 for backward compatibility with 19×19 SGF replays. */
  boardSize?: BoardSize;
};

type IllegalReason = "out_of_bounds" | "occupied" | "suicide" | "ko";

const DEFAULT_SIZE: BoardSize = 19;

function keyOf(c: Coord): string {
  return `${c.x},${c.y}`;
}

function coordFromKey(k: string): Coord {
  const [x, y] = k.split(",").map(Number);
  return { x, y };
}

function inBounds(c: Coord, size: number): boolean {
  return c.x >= 0 && c.x < size && c.y >= 0 && c.y < size;
}

function neighbors(c: Coord): Coord[] {
  return [
    { x: c.x + 1, y: c.y },
    { x: c.x - 1, y: c.y },
    { x: c.x, y: c.y + 1 },
    { x: c.x, y: c.y - 1 },
  ];
}

/**
 * Flood-fill a group of the same color starting from `start`.
 * Returns the group (list of keys) and the set of liberty keys.
 */
function floodFill(
  board: GoBoard,
  start: Coord,
  color: Color,
  size: number,
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
      for (const n of neighbors(c)) {
        if (inBounds(n, size) && !visited.has(keyOf(n))) {
          queue.push(n);
        }
      }
    } else if (here === undefined) {
      liberties.add(k);
    }
    // else: opposite color — wall, do nothing
  }

  return { group, liberties };
}

/** Serialize a board deterministically for ko comparison. */
function boardFingerprint(board: GoBoard): string {
  const entries: string[] = [];
  for (const [k, v] of board) entries.push(`${k}:${v[0]}`);
  entries.sort();
  return entries.join("|");
}

/**
 * Play a move on the board and resolve captures.
 *
 * Does not check legality — callers that need strict rule enforcement must call
 * {@link isLegalMove} first, or this function may return a board with a
 * zero-liberty (suicidal) stone still in place.
 */
export function playMove(
  board: GoBoard,
  move: Move,
  options: PlayMoveOptions = {},
): { board: GoBoard; captured: Coord[] } {
  const size = options.boardSize ?? DEFAULT_SIZE;
  const placed: GoBoard = new Map(board);
  const moveKey = keyOf(move.coord);
  placed.set(moveKey, move.color);

  const opposite: Color = move.color === "black" ? "white" : "black";
  const captured: Coord[] = [];

  for (const n of neighbors(move.coord)) {
    if (!inBounds(n, size)) continue;
    const nk = keyOf(n);
    if (placed.get(nk) !== opposite) continue;

    const { group, liberties } = floodFill(placed, n, opposite, size);
    if (liberties.size === 0) {
      for (const g of group) {
        placed.delete(g);
        captured.push(coordFromKey(g));
      }
    }
  }

  return { board: placed, captured };
}

/** True if the stone at `point` (or any stone in its group) has at least one liberty. */
export function hasLiberty(board: GoBoard, point: Coord, options: PlayMoveOptions = {}): boolean {
  const size = options.boardSize ?? DEFAULT_SIZE;
  const color = board.get(keyOf(point));
  if (!color) return false;
  const { liberties } = floodFill(board, point, color, size);
  return liberties.size > 0;
}

/**
 * True if playing `move` would leave the moved stone's group with zero liberties
 * AND no opponent group is captured by the move.
 */
export function isSuicide(board: GoBoard, move: Move, options: PlayMoveOptions = {}): boolean {
  const size = options.boardSize ?? DEFAULT_SIZE;
  if (!inBounds(move.coord, size)) return false; // out_of_bounds handled elsewhere
  if (board.has(keyOf(move.coord))) return false; // occupied handled elsewhere

  const { board: after, captured } = playMove(board, move, options);
  if (captured.length > 0) return false;
  return !hasLiberty(after, move.coord, options);
}

/**
 * Simple positional-superko check: move is a ko violation if the resulting board
 * state is identical to `previousBoard`. Pass `null` for game start or when ko is not tracked.
 *
 * This is positional ko (recreate the prior position), which is the most common
 * beginner rule. Situational / natural ko variants would additionally consider
 * whose turn it is and move history.
 */
export function isKo(
  board: GoBoard,
  move: Move,
  previousBoard: GoBoard | null,
  options: PlayMoveOptions = {},
): boolean {
  if (!previousBoard) return false;
  const { board: after } = playMove(board, move, options);
  return boardFingerprint(after) === boardFingerprint(previousBoard);
}

/**
 * Full legality check. Combines bounds, occupancy, suicide, and (optional) ko.
 *
 * @returns `{ legal: true }` when the move can be played, otherwise `{ legal: false, reason }`.
 */
export function isLegalMove(
  board: GoBoard,
  move: Move,
  options: PlayMoveOptions & { previousBoard?: GoBoard | null } = {},
): { legal: true } | { legal: false; reason: IllegalReason } {
  const size = options.boardSize ?? DEFAULT_SIZE;
  if (!inBounds(move.coord, size)) return { legal: false, reason: "out_of_bounds" };
  if (board.has(keyOf(move.coord))) return { legal: false, reason: "occupied" };
  if (isSuicide(board, move, { boardSize: size })) return { legal: false, reason: "suicide" };
  if (isKo(board, move, options.previousBoard ?? null, { boardSize: size })) {
    return { legal: false, reason: "ko" };
  }
  return { legal: true };
}
