import type { Coord, Stone } from "@/types";

export type BoardWindow = { xMin: number; xMax: number; yMin: number; yMax: number };

export function coordEquals(a: Coord, b: Coord): boolean {
  return a.x === b.x && a.y === b.y;
}

export function isInBounds(c: Coord, size: number): boolean {
  return c.x >= 1 && c.x <= size && c.y >= 1 && c.y <= size;
}

export function isOccupied(stones: Stone[], c: Coord): boolean {
  return stones.some((s) => coordEquals(s, c));
}

export function fullWindow(size: number): BoardWindow {
  return { xMin: 1, xMax: size, yMin: 1, yMax: size };
}

// Standard star-point positions for 9 / 13 / 19 boards (1-based coordinates).
export function starPoints(size: 9 | 13 | 19): Coord[] {
  if (size === 9) {
    return [
      { x: 3, y: 3 },
      { x: 7, y: 3 },
      { x: 5, y: 5 },
      { x: 3, y: 7 },
      { x: 7, y: 7 },
    ];
  }
  if (size === 13) {
    return [
      { x: 4, y: 4 },
      { x: 10, y: 4 },
      { x: 7, y: 7 },
      { x: 4, y: 10 },
      { x: 10, y: 10 },
    ];
  }
  return [
    { x: 4, y: 4 },
    { x: 10, y: 4 },
    { x: 16, y: 4 },
    { x: 4, y: 10 },
    { x: 10, y: 10 },
    { x: 16, y: 10 },
    { x: 4, y: 16 },
    { x: 10, y: 16 },
    { x: 16, y: 16 },
  ];
}
