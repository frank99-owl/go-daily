import { describe, expect, it } from "vitest";

import { coordEquals, isInBounds, isOccupied, fullWindow, starPoints } from "@/lib/board/board";

describe("coordEquals", () => {
  it("returns true for identical coords", () => {
    expect(coordEquals({ x: 3, y: 5 }, { x: 3, y: 5 })).toBe(true);
  });

  it("returns false when x differs", () => {
    expect(coordEquals({ x: 3, y: 5 }, { x: 4, y: 5 })).toBe(false);
  });

  it("returns false when y differs", () => {
    expect(coordEquals({ x: 3, y: 5 }, { x: 3, y: 6 })).toBe(false);
  });

  it("returns false when both differ", () => {
    expect(coordEquals({ x: 0, y: 0 }, { x: 1, y: 1 })).toBe(false);
  });
});

describe("isInBounds", () => {
  it("accepts (0,0) on any board", () => {
    expect(isInBounds({ x: 0, y: 0 }, 19)).toBe(true);
  });

  it("accepts max valid coord (size-1)", () => {
    expect(isInBounds({ x: 18, y: 18 }, 19)).toBe(true);
  });

  it("rejects negative x", () => {
    expect(isInBounds({ x: -1, y: 0 }, 19)).toBe(false);
  });

  it("rejects x >= size", () => {
    expect(isInBounds({ x: 19, y: 0 }, 19)).toBe(false);
  });

  it("rejects negative y", () => {
    expect(isInBounds({ x: 0, y: -1 }, 19)).toBe(false);
  });

  it("rejects y >= size", () => {
    expect(isInBounds({ x: 0, y: 19 }, 19)).toBe(false);
  });

  it("works for 9x9 board", () => {
    expect(isInBounds({ x: 8, y: 8 }, 9)).toBe(true);
    expect(isInBounds({ x: 9, y: 0 }, 9)).toBe(false);
  });
});

describe("isOccupied", () => {
  const stones = [
    { x: 3, y: 3, color: "black" as const },
    { x: 5, y: 5, color: "white" as const },
  ];

  it("returns true for occupied position", () => {
    expect(isOccupied(stones, { x: 3, y: 3 })).toBe(true);
  });

  it("returns false for empty position", () => {
    expect(isOccupied(stones, { x: 0, y: 0 })).toBe(false);
  });

  it("returns true for second stone", () => {
    expect(isOccupied(stones, { x: 5, y: 5 })).toBe(true);
  });

  it("returns false for empty stones array", () => {
    expect(isOccupied([], { x: 3, y: 3 })).toBe(false);
  });
});

describe("fullWindow", () => {
  it("returns full board window for 19x19", () => {
    expect(fullWindow(19)).toEqual({ xMin: 0, xMax: 18, yMin: 0, yMax: 18 });
  });

  it("returns full board window for 9x9", () => {
    expect(fullWindow(9)).toEqual({ xMin: 0, xMax: 8, yMin: 0, yMax: 8 });
  });
});

describe("starPoints", () => {
  it("returns 5 points for 9x9", () => {
    expect(starPoints(9)).toHaveLength(5);
  });

  it("returns 5 points for 13x13", () => {
    expect(starPoints(13)).toHaveLength(5);
  });

  it("returns 9 points for 19x19", () => {
    expect(starPoints(19)).toHaveLength(9);
  });

  it("center point is at (4,4) for 9x9", () => {
    const points = starPoints(9);
    expect(points).toContainEqual({ x: 4, y: 4 });
  });

  it("center point is at (9,9) for 19x19", () => {
    const points = starPoints(19);
    expect(points).toContainEqual({ x: 9, y: 9 });
  });
});
