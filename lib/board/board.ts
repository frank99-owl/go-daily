import type { Coord, Stone } from "@/types";

export type BoardWindow = { xMin: number; xMax: number; yMin: number; yMax: number };

export function coordEquals(a: Coord, b: Coord): boolean {
  return a.x === b.x && a.y === b.y;
}

export function isInBounds(c: Coord, size: number): boolean {
  return c.x >= 0 && c.x < size && c.y >= 0 && c.y < size;
}

export function isOccupied(stones: Stone[], c: Coord): boolean {
  return stones.some((s) => coordEquals(s, c));
}

export function fullWindow(size: number): BoardWindow {
  return { xMin: 0, xMax: size - 1, yMin: 0, yMax: size - 1 };
}

// Standard star-point positions for 9 / 13 / 19 boards.
export function starPoints(size: 9 | 13 | 19): Coord[] {
  if (size === 9) {
    return [
      { x: 2, y: 2 },
      { x: 6, y: 2 },
      { x: 4, y: 4 },
      { x: 2, y: 6 },
      { x: 6, y: 6 },
    ];
  }
  if (size === 13) {
    return [
      { x: 3, y: 3 },
      { x: 9, y: 3 },
      { x: 6, y: 6 },
      { x: 3, y: 9 },
      { x: 9, y: 9 },
    ];
  }
  return [
    { x: 3, y: 3 },
    { x: 9, y: 3 },
    { x: 15, y: 3 },
    { x: 3, y: 9 },
    { x: 9, y: 9 },
    { x: 15, y: 9 },
    { x: 3, y: 15 },
    { x: 9, y: 15 },
    { x: 15, y: 15 },
  ];
}
