import { describe, it, expect } from "vitest";

import { parseSgfMoves } from "./sgf";

describe("parseSgfMoves", () => {
  it("returns empty for empty string", () => {
    expect(parseSgfMoves("")).toHaveLength(0);
  });
  it("parses a single black move", () => {
    const moves = parseSgfMoves(";B[dd]");
    expect(moves).toHaveLength(1);
    expect(moves[0]).toEqual({ color: "black", coord: { x: 3, y: 3 } });
  });
  it("parses a single white move", () => {
    const moves = parseSgfMoves(";W[qq]");
    expect(moves).toHaveLength(1);
    expect(moves[0]).toEqual({ color: "white", coord: { x: 16, y: 16 } });
  });
  it("parses multiple moves", () => {
    const sgf = ";B[dd];W[qq];B[pd];W[dp]";
    const moves = parseSgfMoves(sgf);
    expect(moves).toHaveLength(4);
    expect(moves[2]).toEqual({ color: "black", coord: { x: 15, y: 3 } });
  });
  it("ignores comments and branches", () => {
    const sgf = "(;B[dd]C[comment];W[qq](;B[pd])(;B[pp]))";
    const moves = parseSgfMoves(sgf);
    expect(moves).toHaveLength(4);
  });
  it("handles aa as origin", () => {
    const moves = parseSgfMoves(";B[aa]");
    expect(moves[0].coord).toEqual({ x: 0, y: 0 });
  });
});
