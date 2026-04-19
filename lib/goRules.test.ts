import { describe, it, expect } from "vitest";
import { playMove } from "./goRules";
import type { Color, Coord } from "@/types";

function makeBoard(stones: { coord: Coord; color: Color }[]): Map<string, Color> {
  const b = new Map<string, Color>();
  for (const s of stones) {
    b.set(`${s.coord.x},${s.coord.y}`, s.color);
  }
  return b;
}

describe("playMove", () => {
  it("places a stone without capture", () => {
    const board = makeBoard([]);
    const result = playMove(board, { color: "black", coord: { x: 3, y: 3 } });
    expect(result.board.get("3,3")).toBe("black");
    expect(result.captured).toHaveLength(0);
  });

  it("captures a single stone surrounded on all 4 sides", () => {
    const board = makeBoard([
      { coord: { x: 3, y: 3 }, color: "white" },
      { coord: { x: 3, y: 2 }, color: "black" },
      { coord: { x: 2, y: 3 }, color: "black" },
      { coord: { x: 4, y: 3 }, color: "black" },
    ]);
    const result = playMove(board, { color: "black", coord: { x: 3, y: 4 } });
    expect(result.captured).toHaveLength(1);
    expect(result.captured[0]).toEqual({ x: 3, y: 3 });
    expect(result.board.has("3,3")).toBe(false);
  });

  it("does not capture own stones", () => {
    const board = makeBoard([
      { coord: { x: 3, y: 3 }, color: "black" },
      { coord: { x: 3, y: 2 }, color: "white" },
      { coord: { x: 2, y: 3 }, color: "white" },
      { coord: { x: 4, y: 3 }, color: "white" },
    ]);
    const result = playMove(board, { color: "black", coord: { x: 3, y: 4 } });
    expect(result.board.has("3,3")).toBe(true);
    expect(result.captured).toHaveLength(0);
  });

  it("captures a connected group", () => {
    const board = makeBoard([
      { coord: { x: 3, y: 3 }, color: "white" },
      { coord: { x: 4, y: 3 }, color: "white" },
      { coord: { x: 3, y: 2 }, color: "black" },
      { coord: { x: 4, y: 2 }, color: "black" },
      { coord: { x: 2, y: 3 }, color: "black" },
      { coord: { x: 5, y: 3 }, color: "black" },
      { coord: { x: 3, y: 4 }, color: "black" },
    ]);
    const result = playMove(board, { color: "black", coord: { x: 4, y: 4 } });
    expect(result.captured).toHaveLength(2);
    expect(result.board.has("3,3")).toBe(false);
    expect(result.board.has("4,3")).toBe(false);
  });
});
