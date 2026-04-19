import { describe, it, expect } from "vitest";
import { coordEquals, isInBounds, isOccupied, starPoints } from "./board";
import type { Stone } from "@/types";

describe("coordEquals", () => {
  it("returns true for identical coords", () => {
    expect(coordEquals({ x: 3, y: 4 }, { x: 3, y: 4 })).toBe(true);
  });
  it("returns false for different coords", () => {
    expect(coordEquals({ x: 3, y: 4 }, { x: 4, y: 3 })).toBe(false);
  });
});

describe("isInBounds", () => {
  it("accepts origin", () => {
    expect(isInBounds({ x: 0, y: 0 }, 19)).toBe(true);
  });
  it("accepts max coord", () => {
    expect(isInBounds({ x: 18, y: 18 }, 19)).toBe(true);
  });
  it("rejects negative", () => {
    expect(isInBounds({ x: -1, y: 0 }, 19)).toBe(false);
  });
  it("rejects out of range", () => {
    expect(isInBounds({ x: 19, y: 0 }, 19)).toBe(false);
  });
});

describe("isOccupied", () => {
  const stones: Stone[] = [
    { x: 3, y: 3, color: "black" },
    { x: 4, y: 4, color: "white" },
  ];
  it("finds occupied", () => {
    expect(isOccupied(stones, { x: 3, y: 3 })).toBe(true);
  });
  it("finds empty", () => {
    expect(isOccupied(stones, { x: 0, y: 0 })).toBe(false);
  });
});

describe("starPoints", () => {
  it("returns 5 points for 9x9", () => {
    expect(starPoints(9)).toHaveLength(5);
  });
  it("returns 9 points for 19x19", () => {
    expect(starPoints(19)).toHaveLength(9);
  });
  it("includes tengen for 19x19", () => {
    const points = starPoints(19);
    expect(points.some((p) => p.x === 9 && p.y === 9)).toBe(true);
  });
});
