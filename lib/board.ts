import type { Coord, Stone } from "@/types";

export type BoardWindow = { xMin: number; xMax: number; yMin: number; yMax: number };

const CROP_PAD = 2;

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

export function computeCropWindow(
  size: number,
  stones: Stone[],
  extraStones?: Stone[],
  highlight?: Coord[],
  userMove?: Coord | null,
): BoardWindow {
  const coords: Coord[] = [...stones, ...(extraStones ?? []), ...(highlight ?? [])];
  if (userMove) coords.push(userMove);

  if (coords.length === 0) return fullWindow(size);

  let xMin = size - 1;
  let xMax = 0;
  let yMin = size - 1;
  let yMax = 0;

  for (const c of coords) {
    if (c.x < xMin) xMin = c.x;
    if (c.x > xMax) xMax = c.x;
    if (c.y < yMin) yMin = c.y;
    if (c.y > yMax) yMax = c.y;
  }

  xMin = Math.max(0, xMin - CROP_PAD);
  yMin = Math.max(0, yMin - CROP_PAD);
  xMax = Math.min(size - 1, xMax + CROP_PAD);
  yMax = Math.min(size - 1, yMax + CROP_PAD);

  const w = xMax - xMin + 1;
  const h = yMax - yMin + 1;
  const dim = Math.max(w, h);

  if (w < dim) {
    const extra = dim - w;
    if (xMin === 0) {
      xMax = Math.min(size - 1, xMax + extra);
    } else {
      xMin = Math.max(0, xMin - extra);
    }
    if (xMax - xMin + 1 < dim) xMax = Math.min(size - 1, xMin + dim - 1);
  }
  if (h < dim) {
    const extra = dim - h;
    if (yMin === 0) {
      yMax = Math.min(size - 1, yMax + extra);
    } else {
      yMin = Math.max(0, yMin - extra);
    }
    if (yMax - yMin + 1 < dim) yMax = Math.min(size - 1, yMin + dim - 1);
  }

  return { xMin, xMax, yMin, yMax };
}

export function toWindowCoord(c: Coord, win: BoardWindow): Coord {
  return { x: c.x - win.xMin, y: c.y - win.yMin };
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
